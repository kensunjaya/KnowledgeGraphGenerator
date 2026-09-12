import { randomUUID } from 'node:crypto';
import { mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { getTranscriptionPool, recoverInterruptedTranscriptions, sql } from '@/lib/database/transcription-db';
import { LANGUAGES, MAX_UPLOAD_BYTES, validateMediaFile } from '@/lib/transcription-options';
import { requestDirectory } from '@/lib/transcription-storage';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await recoverInterruptedTranscriptions();
    const pool = await getTranscriptionPool();
    const result = await pool.request().query(`SELECT LOWER(CONVERT(VARCHAR(36), id)) AS id, title, filename, fileSize, language,
      status, createdAt, startedAt, completedAt, errorMessage
      FROM dbo.TranscriptionRequest ORDER BY createdAt DESC`);
    return Response.json(result.recordset, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Cannot list transcriptions:', error);
    return Response.json({ error: 'Cannot load transcriptions. Check the database connection and try again.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let directory: string | undefined;
  try {
    let title: string;
    let originalName: string;
    try {
      title = decodeURIComponent(req.headers.get('X-Transcription-Title') || '').trim();
      originalName = decodeURIComponent(req.headers.get('X-Filename') || '');
    } catch { return Response.json({ error: 'Invalid upload metadata.' }, { status: 400 }); }
    const language = req.headers.get('X-Language') || 'auto';
    if (!title || title.length > 255) return Response.json({ error: 'Enter a title of 1–255 characters.' }, { status: 400 });
    if (!LANGUAGES.some(([code]) => code === language)) return Response.json({ error: 'Choose a supported language.' }, { status: 400 });
    const filename = originalName.replace(/^.*[\\/]/, '').replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
    const validation = validateMediaFile(filename, Number(req.headers.get('Content-Length') || 1));
    if (validation || filename.length > 240) return Response.json({ error: validation || 'The filename is too long.' }, { status: 400 });
    if (!req.body) return Response.json({ error: 'Choose a media file.' }, { status: 400 });
    const pool = await getTranscriptionPool();
    const id = randomUUID();
    directory = requestDirectory(id);
    await mkdir(directory, { recursive: true });
    const handle = await open(path.join(directory, filename), 'wx');
    let size = 0;
    const reader = req.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_UPLOAD_BYTES) {
          await reader.cancel();
          break;
        }
        // FileHandle.write is permitted to write fewer bytes than requested.
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await handle.write(value, offset, value.byteLength - offset);
          offset += bytesWritten;
        }
      }
    } finally { reader.releaseLock(); await handle.close(); }
    const sizeError = validateMediaFile(filename, size);
    if (sizeError) {
      await rm(directory, { recursive: true, force: true });
      return Response.json({ error: sizeError }, { status: size > MAX_UPLOAD_BYTES ? 413 : 400 });
    }
    await pool.request().input('id', sql.UniqueIdentifier, id).input('title', sql.NVarChar(255), title)
      .input('filename', sql.NVarChar(255), filename).input('size', sql.BigInt, size)
      .input('language', sql.VarChar(10), language === 'auto' ? null : language)
      .query(`INSERT dbo.TranscriptionRequest (id,title,filename,fileSize,language)
        VALUES (@id,@title,@filename,@size,@language)`);
    return Response.json({ id, status: 'PENDING' }, { status: 201 });
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    console.error('Cannot upload transcription:', error);
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
