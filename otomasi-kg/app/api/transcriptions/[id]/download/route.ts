import { getTranscriptionPool, sql } from '@/lib/database/transcription-db';
import { validId } from '@/lib/transcription-storage';
import { transcriptPdf } from '@/lib/transcription-pdf';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') || 'md';
  if (!validId(id) || !['md', 'pdf'].includes(format)) return Response.json({ error: 'Invalid download request.' }, { status: 400 });
  try {
    const pool = await getTranscriptionPool();
    const result = await pool.request().input('id', sql.UniqueIdentifier, id)
      .query('SELECT title, status, markdown FROM dbo.TranscriptionRequest WHERE id=@id');
    const row = result.recordset[0];
    if (!row) return Response.json({ error: 'Transcription not found.' }, { status: 404 });
    if (row.status !== 'COMPLETED' || !row.markdown) return Response.json({ error: 'This transcription is not ready to download.' }, { status: 409 });
    const filename = row.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150) || 'transcript';
    const encoded = encodeURIComponent(`${filename}.${format}`).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`);
    const body = format === 'pdf' ? new Uint8Array(await transcriptPdf(row.markdown)) : row.markdown;
    return new Response(body, { headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="transcript.${format}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('Cannot download transcription:', error);
    return Response.json({ error: 'Download failed. Please try again or choose Markdown.' }, { status: 500 });
  }
}
