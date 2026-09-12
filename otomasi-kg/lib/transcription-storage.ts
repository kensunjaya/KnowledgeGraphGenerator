import path from 'node:path';

export const uploadRoot = process.env.TRANSCRIPTION_UPLOAD_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.env.TRANSCRIPTION_UPLOAD_DIR)
  : path.join(process.cwd(), '.transcription-uploads');
export const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function requestDirectory(id: string) {
  if (!validId(id)) throw new Error('Invalid request ID.');
  return path.join(uploadRoot, id.toLowerCase());
}
