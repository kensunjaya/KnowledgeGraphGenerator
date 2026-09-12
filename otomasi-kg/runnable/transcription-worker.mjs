// Detached from Next.js so navigation and HTTP timeouts do not stop a job.
import sql from 'mssql';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1800); });
    heartbeat = setInterval(async () => {
      if (heartbeatBusy) return;
      heartbeatBusy = true;
      try {
        const updated = await request().query(`UPDATE dbo.TranscriptionRequest
          SET heartbeatAt=SYSUTCDATETIME() WHERE id=@id AND runToken=@token AND status='PROCESSING'`);
        if (!updated.rowsAffected[0]) { leaseLost = true; child.kill(); }
        else lastHeartbeat = Date.now();
      } catch {
        // Stop before another request may reclaim an expired lease.
        if (Date.now() - lastHeartbeat > 60000) { leaseLost = true; child.kill(); }
      } finally { heartbeatBusy = false; }
    }, 15000);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    clearInterval(heartbeat);
    if (leaseLost) throw new Error('Database connection was interrupted. Retry this file.');
    if (code !== 0) throw new Error(stderr.trim() || `Transcription exited with code ${code}.`);
    const stem = path.parse(filename).name;
    const markdown = await readFile(path.join(directory, `${stem}.md`), 'utf8');
    if (!markdown.trim()) throw new Error('The transcription produced no text.');
    const saved = await request().input('markdown', sql.NVarChar(sql.MAX), markdown).query(`
      UPDATE dbo.TranscriptionRequest SET status='COMPLETED', markdown=@markdown,
        completedAt=SYSUTCDATETIME(), errorMessage=NULL
      WHERE id=@id AND runToken=@token AND status='PROCESSING'`);
    // Only remove media after the result is committed to the database.
    if (saved.rowsAffected[0]) await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if (pool.connected) {
      await request().input('error', sql.NVarChar(2000), String(error.message).slice(-2000))
        .query(`UPDATE dbo.TranscriptionRequest SET status='FAILED', errorMessage=@error,
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
