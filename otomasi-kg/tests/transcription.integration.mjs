// Explicit integration suite: needs a running app and the Transcription DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import sql from 'mssql';

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.TRANSCRIPTION_TEST_URL || 'http://localhost:3100';
const root = path.resolve(process.env.TRANSCRIPTION_UPLOAD_DIR || '.transcription-uploads');
const python = process.env.TRANSCRIPTION_PYTHON_EXECUTABLE || process.env.PYTHON_EXECUTABLE || 'python';

test('upload, validation, retry, concurrency, worker persistence, and downloads', { timeout: 120000 }, async () => {
  const pool = await new sql.ConnectionPool({
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 1433),
    database: 'Transcription', options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  const ids = [];
  await mkdir('tmp', { recursive: true });
  const fixture = await mkdtemp(path.resolve('tmp', 'transcription-test-'));
  const request = id => pool.request().input('id', sql.UniqueIdentifier, id);
  const upload = (name, body, language = 'en') => fetch(`${base}/api/transcriptions`, {
    method: 'POST', body,
    headers: { 'X-Filename': encodeURIComponent(name), 'X-Transcription-Title': 'Integration%20test', 'X-Language': language },
  });
  async function create(name, body) {
    const response = await upload(name, body);
    assert.equal(response.status, 201, await response.clone().text());
    const row = await response.json(); ids.push(row.id); return row.id;
  }
  async function waitFor(id, status) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const result = await request(id).query('SELECT * FROM dbo.TranscriptionRequest WHERE id=@id');
      if (result.recordset[0]?.status === status) return result.recordset[0];
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${status}`);
  }
  try {
    // Never interfere with actual work already running on the shared server.
    const active = await pool.request().query("SELECT id FROM dbo.TranscriptionRequest WHERE status='PROCESSING'");
    assert.equal(active.recordset.length, 0, 'Run this test while no real transcription is processing.');
    assert.equal((await upload('bad.exe', 'bad')).status, 400);
    assert.equal((await upload('empty.mp3', '')).status, 400);
    assert.equal((await upload('audio.mp3', 'bad', 'invalid')).status, 400);
    assert.equal((await fetch(`${base}/api/transcriptions/invalid/run`, { method: 'POST' })).status, 400);

    const corrupt = await create('corrupt.mp4', 'not actual media');
    assert.equal((await fetch(`${base}/api/transcriptions/${corrupt}/download`)).status, 409);
    assert.equal((await fetch(`${base}/api/transcriptions/${corrupt}/run`, { method: 'POST' })).status, 202);
    const failure = await waitFor(corrupt, 'FAILED');
    assert.match(failure.errorMessage, /Cannot read this media/);
    assert.equal((await fetch(`${base}/api/transcriptions/${corrupt}/run`, { method: 'POST' })).status, 202);
    await waitFor(corrupt, 'FAILED');

    // Generate a valid audio stream without external sample media.
    const wav = Buffer.alloc(44 + 32000);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(32000, 40);
    const completed = await create('meeting.wav', wav);
    const token = randomUUID();
    await request(completed).input('token', sql.UniqueIdentifier, token).query(`UPDATE dbo.TranscriptionRequest
      SET status='PROCESSING', runToken=@token, heartbeatAt=SYSUTCDATETIME() WHERE id=@id`);
    assert.equal((await fetch(`${base}/api/transcriptions/${corrupt}/run`, { method: 'POST' })).status, 409);

    // Stubs replace only model inference. PyAV validation, transcribe.py's
    // decoding arguments, grouping/rendering, worker and database writes are real.
    await writeFile(path.join(fixture, 'ctranslate2.py'), 'def get_cuda_device_count():\n    return 0\n');
    await writeFile(path.join(fixture, 'faster_whisper.py'), `from types import SimpleNamespace
class WhisperModel:
    def __init__(self, name, **kwargs):
        assert name == 'large-v3'
        assert kwargs['device'] == 'cpu'
        assert kwargs['compute_type'] == 'float32'
        assert kwargs['cpu_threads'] >= 1
    def transcribe(self, path, **kwargs):
        assert kwargs['language'] == 'en'
        assert kwargs['beam_size'] == 5
        assert kwargs['vad_filter'] is True
        segments = [SimpleNamespace(start=i*10, end=i*10+4, text='Hello from the saved transcript. Unicode: café, 日本語, العربية. ' * 3) for i in range(35)]
        return iter(segments), SimpleNamespace(duration=350, language='en', language_probability=0.99)
`);
    const worker = spawn(process.execPath, ['runnable/transcription-worker.mjs', completed, token,
      path.join(root, completed), 'meeting.wav', 'en'], { windowsHide: true,
      env: { ...process.env, TRANSCRIPTION_PYTHON_EXECUTABLE: python, PYTHONPATH: fixture }, stdio: 'inherit' });
    assert.equal(await new Promise((resolve, reject) => { worker.once('error', reject); worker.once('close', resolve); }), 0);
    const row = await waitFor(completed, 'COMPLETED');
    assert.match(row.markdown, /Hello from the saved transcript/);
    assert.match(row.markdown, /large-v3/);
    await assert.rejects(stat(path.join(root, completed)), { code: 'ENOENT' });
    const markdown = await fetch(`${base}/api/transcriptions/${completed}/download?format=md`);
    assert.equal(markdown.status, 200);
    assert.equal(await markdown.text(), row.markdown);
    assert.match(markdown.headers.get('content-disposition'), /attachment/);
    const pdf = await fetch(`${base}/api/transcriptions/${completed}/download?format=pdf`);
    assert.equal(pdf.status, 200, await pdf.clone().text());
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    await writeFile('tmp/transcription-qa.pdf', bytes);
    await writeFile('tmp/transcription-qa.md', row.markdown);
    assert.equal((await fetch(`${base}/api/transcriptions/${completed}/download?format=exe`)).status, 400);
    assert.equal((await fetch(`${base}/api/transcriptions/${randomUUID()}/download`)).status, 404);

    await request(corrupt).query(`UPDATE dbo.TranscriptionRequest SET status='PROCESSING',
      heartbeatAt=DATEADD(MINUTE,-3,SYSUTCDATETIME()) WHERE id=@id`);
    const listed = await fetch(`${base}/api/transcriptions`);
    assert.equal(listed.status, 200);
    const list = await listed.json();
    assert.equal(list.find(row => row.id === corrupt).status, 'FAILED');
    assert.ok(list.every(row => !Object.hasOwn(row, 'markdown')));
  } finally {
    for (const id of ids) {
      await request(id).query('DELETE dbo.TranscriptionRequest WHERE id=@id');
      const directory = path.resolve(root, id);
      assert.equal(path.dirname(directory), root);
      await rm(directory, { recursive: true, force: true });
    }
    assert.equal(path.dirname(fixture), path.resolve('tmp'));
    await rm(fixture, { recursive: true, force: true });
    await pool.close();
  }
});
