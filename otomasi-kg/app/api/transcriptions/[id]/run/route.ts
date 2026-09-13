import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getTranscriptionPool, recoverInterruptedTranscriptions, sql } from '@/lib/database/transcription-db';
import { requestDirectory, validId } from '@/lib/transcription-storage';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.toLowerCase();
  if (!validId(id)) return Response.json({ error: 'Invalid request ID.' }, { status: 400 });
  const token = randomUUID();
  try {
    await recoverInterruptedTranscriptions();
    const pool = await getTranscriptionPool();
    // A filtered unique index permits only one PROCESSING row at a time.
    const result = await pool.request().input('id', sql.UniqueIdentifier, id)
      .input('token', sql.UniqueIdentifier, token).query(`
      UPDATE dbo.TranscriptionRequest SET status='PROCESSING', startedAt=SYSUTCDATETIME(),
        heartbeatAt=SYSUTCDATETIME(), completedAt=NULL, errorMessage=NULL, runToken=@token,
        progressPercent=0, progressStage='VALIDATING'
      OUTPUT inserted.filename, inserted.language
      WHERE id=@id AND status IN ('PENDING','FAILED')`);
    const row = result.recordset[0];
    if (!row) return Response.json({ error: 'This request is missing or has already started.' }, { status: 409 });
    try {
      const child = spawn(process.execPath, [path.resolve('runnable/transcription-worker.mjs'),
        id, token, requestDirectory(id), row.filename, row.language || 'auto'], {
        cwd: process.cwd(), detached: true, windowsHide: true, stdio: 'ignore', env: process.env,
      });
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      child.unref();
    } catch (error) {
      await pool.request().input('id', sql.UniqueIdentifier, id).input('token', sql.UniqueIdentifier, token)
        .query(`UPDATE dbo.TranscriptionRequest SET status='FAILED', progressStage='FAILED', completedAt=SYSUTCDATETIME(),
          errorMessage=N'Could not start transcription. Check the server configuration and retry.'
          WHERE id=@id AND runToken=@token AND status='PROCESSING'`);
      throw error;
    }
    return Response.json({ status: 'PROCESSING' }, { status: 202 });
  } catch (error) {
    if (error instanceof sql.RequestError && [2601, 2627].includes(error.number ?? 0)) {
      return Response.json({ error: 'Another file is being transcribed. Your upload is saved; click Transcribe when it finishes.' }, { status: 409 });
    }
    console.error('Cannot start transcription:', error);
    return Response.json({ error: 'Cannot start transcription. Please try again.' }, { status: 500 });
  }
}
