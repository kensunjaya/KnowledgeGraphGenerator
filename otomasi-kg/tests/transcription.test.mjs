import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaFile, MAX_UPLOAD_BYTES } from '../lib/transcription-options.ts';
import { transcriptHtml } from '../lib/transcription-pdf.ts';
import { requestDirectory } from '../lib/transcription-storage.ts';
import { parseProgress } from '../runnable/transcription-progress.mjs';

test('progress is monotonic, bounded below completion, and ignores ordinary output', () => {
  const initial = { stage: 'VALIDATING', percent: 0 };
  const current = parseProgress('{"stage":"TRANSCRIBING","percent":42.8}', initial);
  assert.deepEqual(current, { stage: 'TRANSCRIBING', percent: 42 });
  assert.deepEqual(parseProgress('{"stage":"TRANSCRIBING","percent":10}', current), current);
  assert.equal(parseProgress('{"stage":"LOADING_MODEL","percent":0}', current), current);
  assert.equal(parseProgress('Language: en', current), current);
  assert.equal(parseProgress('{"stage":"TRANSCRIBING","percent":"bad"}', current), current);
  assert.deepEqual(parseProgress('{"stage":"SAVING","percent":100}', current), { stage: 'SAVING', percent: 99 });
  assert.equal(parseProgress('{"stage":"COMPLETED","percent":100}', current), current);
});

test('media validation accepts audio/video case-insensitively and rejects invalid uploads', () => {
  assert.equal(validateMediaFile('MEETING.MP4', 100), null);
  assert.equal(validateMediaFile('voice.wav', MAX_UPLOAD_BYTES), null);
  assert.match(validateMediaFile('voice.wav', MAX_UPLOAD_BYTES + 1), /500 MB/);
  assert.match(validateMediaFile('voice.wav', 0), /empty/);
  assert.match(validateMediaFile('script.exe', 100), /supported/);
  assert.match(validateMediaFile('voice.mp3.exe', 100), /supported/);
});

test('request paths normalize SQL Server UUID casing and reject traversal', () => {
  const id = 'abcdef00-1234-5678-9012-abcdef123456';
  assert.equal(requestDirectory(id.toUpperCase()), requestDirectory(id));
  assert.throws(() => requestDirectory('../outside'));
});

test('PDF renderer preserves text and timestamp groups without executing transcript markup', () => {
  const html = transcriptHtml('# Transcript: meeting\n\n- **Model:** `large-v3`\n\n## Transcript\n\n**[00:00–00:04]**\n\nHello <script>alert(1)</script> & 世界.');
  assert.ok(html.includes('<h1 dir="auto">Transcript: meeting</h1>'));
  assert.ok(html.includes('<h3>[00:00–00:04]</h3>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; 世界.'));
  assert.ok(!html.includes('<script>'));
});
