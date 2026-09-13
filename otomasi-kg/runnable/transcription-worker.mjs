// Detached from Next.js so navigation and HTTP timeouts do not stop a job.
import sql from 'mssql';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { parseProgress } from './transcription-progress.mjs';

const [id, runToken, directory, filename, language] = process.argv.slice(2);
const pool = new sql.ConnectionPool({
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || '', port: Number(process.env.DB_PORT || 1433),
  database: 'Transcription', options: { encrypt: false, trustServerCertificate: true },
});
let child;
let heartbeat;
let heartbeatBusy = false;
let leaseLost = false;
let lastHeartbeat = Date.now();
let progress = { stage: 'VALIDATING', percent: 0 };
const request = () => pool.request().input('id', sql.UniqueIdentifier, id)
  .input('token', sql.UniqueIdentifier, runToken);

async function run() {
  try {
    await pool.connect();
    const claimed = await request().query(`UPDATE dbo.TranscriptionRequest
      SET heartbeatAt=SYSUTCDATETIME() WHERE id=@id AND runToken=@token AND status='PROCESSING'`);
    if (!claimed.rowsAffected[0]) return;
    const script = fileURLToPath(new URL('./transcribe_web.py', import.meta.url));
    const args = [script, path.join(directory, filename), '--output-dir', directory];
    if (language && language !== 'auto') args.push('--language', language);
    let stderr = '';
    child = spawn(process.env.TRANSCRIPTION_PYTHON_EXECUTABLE || process.env.PYTHON_EXECUTABLE || 'python', args, {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1800); });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => { progress = parseProgress(line, progress); });
    heartbeat = setInterval(async () => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      try {
        const updated = await request().input('percent', sql.Int, progress.percent)
          .input('stage', sql.VarChar(30), progress.stage).query(`UPDATE dbo.TranscriptionRequest
          SET heartbeatAt=SYSUTCDATETIME(), progressPercent=@percent, progressStage=@stage
          WHERE id=@id AND runToken=@token AND status='PROCESSING'`);
        if (!updated.rowsAffected[0]) { leaseLost = true; child.kill(); }
        else lastHeartbeat = Date.now();
      } catch {
        // Stop before another request may reclaim an expired lease.
        if (Date.now() - lastHeartbeat > 60000) { leaseLost = true; child.kill(); }
      } finally { heartbeatBusy = false; }
    }, 1000);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearInterval(heartbeat);
    while (heartbeatBusy) await new Promise(resolve => setTimeout(resolve, 25));
    if (leaseLost) throw new Error('Database connection was interrupted. Retry this file.');
    if (code !== 0) throw new Error(stderr.trim() || `Transcription exited with code ${code}.`);
    await request().query(`UPDATE dbo.TranscriptionRequest SET progressStage='SAVING', progressPercent=99
      WHERE id=@id AND runToken=@token AND status='PROCESSING'`);
    const stem = path.parse(filename).name;
    const markdown = await readFile(path.join(directory, `${stem}.md`), 'utf8');
    if (!markdown.trim()) throw new Error('The transcription produced no text.');
    const saved = await request().input('markdown', sql.NVarChar(sql.MAX), markdown).query(`
      UPDATE dbo.TranscriptionRequest SET status='COMPLETED', markdown=@markdown, progressPercent=100, progressStage='COMPLETED',
        completedAt=SYSUTCDATETIME(), errorMessage=NULL
      WHERE id=@id AND runToken=@token AND status='PROCESSING'`);
    // Only remove media after the result is committed to the database.
    if (saved.rowsAffected[0]) await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if (pool.connected) {
      await request().input('error', sql.NVarChar(2000), String(error.message).slice(-2000))
        .query(`UPDATE dbo.TranscriptionRequest SET status='FAILED', progressStage='FAILED', errorMessage=@error,
          completedAt=SYSUTCDATETIME() WHERE id=@id AND runToken=@token AND status='PROCESSING'`)
        .catch(() => {});
    }
  } finally {
    clearInterval(heartbeat);
    await pool.close().catch(() => {});
  }
}

// The parent only supplies a validated UUID directory below this configured root.
const root = path.resolve(process.env.TRANSCRIPTION_UPLOAD_DIR || '.transcription-uploads');
if (!/^[0-9a-f-]{36}$/i.test(id || '') || path.resolve(directory || '') !== path.join(root, id)
    || path.basename(filename || '') !== filename) process.exit(1);
await run();
