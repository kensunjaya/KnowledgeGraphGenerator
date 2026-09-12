"use client";

import { useRef, useState } from 'react';
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MEDIA_EXTENSIONS, LANGUAGES, validateMediaFile } from '@/lib/transcription-options';

export function TranscriptionForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('auto');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const inputClass = 'w-full text-sm border border-zinc-200 rounded-lg px-3.5 py-2.5 text-zinc-900 bg-white focus:outline-none focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 shadow-xs';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    if (!file) { setError('Choose an audio or video file.'); return; }
    const validation = validateMediaFile(file.name, file.size);
    if (validation) { setError(validation); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/transcriptions', {
        method: 'POST', body: file,
        headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name),
          'X-Transcription-Title': encodeURIComponent(title.trim()), 'X-Language': language },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      setTitle(''); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage('File uploaded. Starting transcription…');
      try {
        const started = await fetch(`/api/transcriptions/${data.id}/run`, { method: 'POST' });
        const result = await started.json();
        setMessage(started.ok ? 'Transcription started. You can leave this page and return to download the result.'
          : result.error || 'Your upload is saved. Start it from the table below.');
      } catch { setMessage('Your upload is saved. Start it from the table below.'); }
      await onCreated();
    } catch (error) { setError(error instanceof Error ? error.message : 'Upload failed. Please try again.'); }
    finally { setBusy(false); }
  }

  return <section className="w-full bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/50">
      <h2 className="text-sm font-bold text-zinc-900">New transcription</h2>
      <p className="text-xs text-zinc-500 mt-1">Turn speech from an audio or video file into a timestamped transcript.</p>
    </div>
    <form onSubmit={submit} className="p-6 space-y-5">
      {error && <p role="alert" className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{message}</p>}
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div><label htmlFor="transcription-title" className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Title / Name</label>
            <input id="transcription-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Weekly team meeting" required maxLength={255} className={inputClass} /></div>
          <div><label htmlFor="transcription-language" className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Spoken language</label>
            <select id="transcription-language" value={language} onChange={e => setLanguage(e.target.value)} className={inputClass}>
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select></div>
        </div>
        <div className="border border-dashed border-zinc-300 rounded-xl p-6 bg-zinc-50/50 space-y-3">
          <label htmlFor="transcription-file" className="block text-sm font-semibold text-zinc-800">Audio or video file</label>
          <input ref={fileInput} id="transcription-file" type="file" accept={MEDIA_EXTENSIONS.join(',')} required
            aria-describedby="transcription-formats" className="block w-full text-xs text-zinc-600 file:mr-4 file:bg-white file:border file:border-zinc-300 file:rounded-full file:px-4 file:py-2 file:text-xs file:font-bold file:cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4"
            onChange={e => {
              const chosen = e.target.files?.[0] || null;
              setError(''); setMessage('');
              if (chosen) {
                const validation = validateMediaFile(chosen.name, chosen.size);
                if (validation) { setError(validation); setFile(null); e.target.value = ''; return; }
                if (!title) setTitle(chosen.name.replace(/\.[^.]+$/, '').slice(0, 255));
              }
              setFile(chosen);
            }} />
          <div id="transcription-formats" className="text-xs text-zinc-500 leading-relaxed">
            <p>Audio: {AUDIO_EXTENSIONS.map(ext => ext.slice(1).toUpperCase()).join(', ')}.</p>
            <p>Video: {VIDEO_EXTENSIONS.map(ext => ext.slice(1).toUpperCase()).join(', ')}.</p>
            <p className="mt-1">Maximum 500 MB. Videos must contain an audio track.</p>
          </div>
          {file && <p className="text-xs font-semibold text-emerald-800 break-all">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB ready</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <p className="text-xs text-zinc-500 max-w-sm">Speech stays in its original language. Long recordings may take a while to transcribe.</p>
          <button disabled={busy || !file} type="submit" className="bg-zinc-950 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-500 text-white font-bold text-xs px-6 py-3 rounded-full shadow-sm cursor-pointer disabled:cursor-not-allowed">{busy ? 'Uploading…' : 'Transcribe'}</button>
        </div>
      </fieldset>
    </form>
  </section>;
}
