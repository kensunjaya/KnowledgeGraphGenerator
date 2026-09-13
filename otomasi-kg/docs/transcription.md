# Transcription

Open `/transcription` from the portal. Select an audio or video file, enter a title,
choose the spoken language (or automatic detection), and click **Transcribe**.
Completed requests offer **Markdown** and **PDF** downloads generated from the saved
database result. Transcription preserves the spoken language; it does not translate.

## Setup

Run these commands from `otomasi-kg`:

```sh
npm install
npx playwright install chromium
python -m venv .venv-transcription
```

Install Python dependencies using the new environment:

```powershell
# Windows
.venv-transcription/Scripts/python.exe -m pip install -r runnable/requirements-whisper.txt
```

```sh
# Linux / macOS
.venv-transcription/bin/python -m pip install -r runnable/requirements-whisper.txt
# Linux PDF rendering may also need Chromium system packages:
npx playwright install --with-deps chromium
```

Set `TRANSCRIPTION_PYTHON_EXECUTABLE` in `.env.local` to the absolute path of that
environment's Python executable. It overrides `PYTHON_EXECUTABLE` for transcription
only; otherwise the existing Python setting, then `python`, is used.

The app connects to the **Transcription** SQL Server database using the existing
`DB_SERVER`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD`. Its separate pool does not
change the Knowledge Graph or Secret Manager connections. Create the schema once:

```sh
npm run setup:transcription
```

The migration in `database/transcription.sql` is idempotent and refuses to run in a
different database. The application account needs SELECT, INSERT, and UPDATE on
`dbo.TranscriptionRequest`; schema setup additionally needs CREATE TABLE rights.

Start with `npm run dev`, or `npm run build` and `npm start`. Use a persistent Node
server with Python, `runnable/`, `node_modules/`, and writable disk available. This
worker flow is not designed for ephemeral serverless hosting. Keep the portal
behind the same access controls as the existing Knowledge Graph tools.

## Files, accuracy, and processing

- Audio: MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, WMA.
- Video: MP4, MKV, MOV, WEBM, AVI, M4V, MPEG, MPG.
- Maximum size: 500 MB. Both the form and server validate the file; the server
  streams the body to disk with a byte limit instead of buffering the entire file.
- PyAV verifies that the container has a decodable audio track before the model
  loads. Codec support depends on PyAV/FFmpeg; an extension alone cannot guarantee
  decodability. Empty, corrupt, or silent-track-free videos report a failed request.
- `transcribe_web.py` validates media and calls the existing `transcribe.py` CLI.
  Model, beam size, VAD, grouping, timestamps, and Markdown generation are retained:
  **large-v3**, CUDA **float16**, otherwise CPU **float32** with available CPU threads.
  The web form does not offer smaller models or quantized precision.
- First use downloads the `large-v3` model to the Hugging Face cache and needs
  internet access and several GB of free space. CUDA requires the driver and
  CUDA/cuDNN runtime supported by CTranslate2. CPU processing can take a long time;
  there is no transcription deadline or speed-based quality reduction.

Uploads live in `.transcription-uploads/<request UUID>/`, outside `public/`.
`TRANSCRIPTION_UPLOAD_DIR` may set an alternative persistent directory. Uploaded
media and intermediate TXT/MD files are deleted only after Markdown is saved in
SQL Server. Failed/pending requests retain media for retry; back up or manage this
directory along with pending database records.

A database constraint allows one processing request at a time. If another file is
running, a new upload stays **Pending**; click **Transcribe** in its table row when
the active request finishes. A detached Node worker continues after the browser
closes and updates its database heartbeat and progress every second. A worker interrupted
for two minutes becomes **Failed** when the list refreshes and can be retried.

The table refreshes every three seconds and shows checking media, loading the model,
transcribing, and saving stages. Percentage measures the last segment's end timestamp
divided by the original audio duration, not elapsed time or time remaining. It can jump
over silence or pause while the model loads. Progress stays below 100% until the database
commit succeeds. Retries reset progress to zero. After updating an existing deployment,
run `npm run setup:transcription` to add the progress columns, then restart the app.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/transcriptions` | List request metadata and status; omit transcript bodies. |
| POST | `/api/transcriptions` | Raw media body with URL-encoded `X-Filename`, URL-encoded `X-Transcription-Title`, and `X-Language` (`auto` or a form option). Returns a pending request ID. |
| POST | `/api/transcriptions/:id/run` | Start a pending or failed request. Returns 202 or 409 if unavailable/busy. |
| GET | `/api/transcriptions/:id/download?format=md` | Download stored Markdown; `format=pdf` renders a paginated A4 PDF. |

Configure any reverse proxy to accept 500 MB uploads and allow sufficient upload
time. Only uploading uses a long HTTP request; transcription runs in the worker.
PDF rendering uses escaped transcript text with no scripts or remote resources.
Install fonts for the languages used on the server so Chromium can render their
characters. Markdown always preserves the original Unicode transcript.

## Verification

```sh
python -m unittest discover -s runnable -p 'test_*.py' -v
npm run test:transcription
npm run build
```

Node unit tests use Node 22.18+ native TypeScript support. The optional integration
test requires a running app, database access, the configured Python dependencies,
and Chromium. It creates and cleans up only its own test requests:

```sh
node --test tests/transcription.integration.mjs
```

Set `TRANSCRIPTION_TEST_URL` if the app is not at `http://localhost:3100`. Integration
tests use stubbed Whisper output through the real script for deterministic checks;
they do not download a model or measure transcription accuracy.
