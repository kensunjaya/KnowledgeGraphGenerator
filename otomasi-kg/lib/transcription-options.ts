export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma'];
export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v', '.mpeg', '.mpg'];
export const MEDIA_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];
export const LANGUAGES = [
  ['auto', 'Detect automatically'], ['en', 'English'], ['id', 'Indonesian'],
  ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['es', 'Spanish'],
  ['fr', 'French'], ['de', 'German'], ['ar', 'Arabic'], ['hi', 'Hindi'],
  ['pt', 'Portuguese'], ['ru', 'Russian'], ['it', 'Italian'], ['nl', 'Dutch'],
  ['ms', 'Malay'], ['th', 'Thai'], ['vi', 'Vietnamese'], ['tl', 'Tagalog'],
  ['tr', 'Turkish'], ['uk', 'Ukrainian'],
] as const;

export function fileExtension(filename: string) {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase();
}

export function validateMediaFile(filename: string, size: number): string | null {
  if (!MEDIA_EXTENSIONS.includes(fileExtension(filename))) return 'Choose a supported audio or video file.';
  if (size <= 0) return 'The file is empty.';
  if (size > MAX_UPLOAD_BYTES) return 'The file exceeds the 500 MB limit.';
  return null;
}

export interface TranscriptionRequest {
  id: string;
  title: string;
  filename: string;
  fileSize: number;
  language: string | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progressPercent: number;
  progressStage: 'PENDING' | 'VALIDATING' | 'LOADING_MODEL' | 'TRANSCRIBING' | 'SAVING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}
