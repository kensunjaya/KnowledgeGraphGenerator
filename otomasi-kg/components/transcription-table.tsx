"use client";

import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, TranscriptionRequest } from '@/lib/transcription-options';

const badges = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200/60',
  PROCESSING: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
  FAILED: 'bg-rose-50 text-rose-800 border-rose-200/60',
};

const progressLabels = {
  PENDING: 'Waiting to start', VALIDATING: 'Checking media…', LOADING_MODEL: 'Loading model…',
  TRANSCRIBING: 'Transcribing', SAVING: 'Saving transcript…', COMPLETED: 'Completed', FAILED: 'Failed',
};

export function TranscriptionTable({ requests, onRefresh }: { requests: TranscriptionRequest[]; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'title' | 'status' | 'createdAt'>('createdAt');
  const [ascending, setAscending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [failedRequest, setFailedRequest] = useState<TranscriptionRequest | null>(null);
  const errorDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = errorDialog.current;
    if (!failedRequest || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [failedRequest]);
  const active = requests.some(row => row.status === 'PROCESSING');
  const filtered = requests.filter(row => `${row.title} ${row.filename}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (ascending ? 1 : -1) * a[sort].localeCompare(b[sort]));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const buttonClass = 'text-xs font-semibold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg px-3 py-1.5 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  async function run(id: string) {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/api/transcriptions/${id}/run`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannot start transcription.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Cannot start transcription.'); }
    finally { await onRefresh(); setBusy(null); }
  }

  async function download(row: TranscriptionRequest, format: 'md' | 'pdf') {
    setBusy(row.id); setError('');
    try {
      const response = await fetch(`/api/transcriptions/${row.id}/download?format=${format}`);
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Download failed.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${row.title.replace(/[<>:"/\\|?*]/g, '_')}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : 'Download failed.'); }
    finally { setBusy(null); }
  }

  return <section className="w-full bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <h2 className="text-sm font-bold">Processing Monitor <span className="text-xs font-normal text-zinc-500">({requests.length} total runs)</span></h2>
      <div className="flex items-center gap-3">
        {active && <span role="status" className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">Transcribing</span>}
        <input type="search" aria-label="Search transcriptions" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search title or file…" className="min-w-0 w-full sm:w-56 text-xs border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950" />
      </div>
    </div>
    {error && <p role="alert" className="p-4 text-sm text-rose-800 bg-rose-50">{error}</p>}
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse">
        <thead><tr className="bg-zinc-50/75 border-b border-zinc-200 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
          {([['title', 'Transcription'], ['status', 'Status'], ['createdAt', 'Created']] as const).map(([field, label]) =>
            <th key={field} scope="col" className="px-6 py-3.5" aria-sort={sort === field ? ascending ? 'ascending' : 'descending' : 'none'}>
              <button className="uppercase cursor-pointer whitespace-nowrap" onClick={() => { setSort(field); setAscending(sort === field ? !ascending : field !== 'createdAt'); setPage(1); }}>{label} {sort === field ? ascending ? '↑' : '↓' : '↕'}</button>
            </th>)}
          <th scope="col" className="px-6 py-3.5">Downloads / Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map(row => <tr key={row.id} className="hover:bg-zinc-50/50 transition-colors">
            <td className="px-6 py-4 min-w-60 max-w-sm"><p className="font-semibold text-zinc-900 break-words">{row.title}</p>
              <p className="text-xs text-zinc-500 mt-1 break-all">{row.filename} · {(row.fileSize / 1024 / 1024).toFixed(1)} MB</p>
              <p className="text-[11px] text-zinc-400 mt-1">{LANGUAGES.find(([code]) => code === (row.language || 'auto'))?.[1] || row.language}</p>
            </td>
            <td className="px-6 py-4">{row.status === 'FAILED' ?
              <button type="button" onClick={() => setFailedRequest(row)} aria-haspopup="dialog" title="View error details"
                className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md border shadow-xs cursor-pointer hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 ${badges.FAILED}`}>
                <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current" />Failed
              </button> :
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md border shadow-xs ${badges[row.status]}`}><span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current" />{row.status[0] + row.status.slice(1).toLowerCase()}</span>
            }
              {row.status === 'PROCESSING' && <div className="mt-2 min-w-40">
                <div className="flex justify-between gap-3 text-xs text-zinc-500 mb-1.5">
                  <span>{progressLabels[row.progressStage] || 'Starting…'}</span>
                  <span className="tabular-nums">{row.progressPercent ?? 0}%</span>
                </div>
                <div role="progressbar" aria-label={`Transcription progress for ${row.title}`} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={row.progressPercent ?? 0} aria-valuetext={`${progressLabels[row.progressStage] || 'Starting'}, ${row.progressPercent ?? 0}%`}
                  className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500 transition-[width] motion-reduce:transition-none" style={{ width: `${row.progressPercent ?? 0}%` }} />
                </div>
              </div>}
            </td>
            <td className="px-6 py-4 text-xs text-zinc-500 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
            <td className="px-6 py-4"><div className="flex items-center gap-2 whitespace-nowrap">
              {row.status === 'COMPLETED' ? <>
                <button disabled={busy !== null} className={buttonClass} onClick={() => download(row, 'md')} aria-label={`Download ${row.title} as Markdown`}>Markdown</button>
                <button disabled={busy !== null} className={buttonClass} onClick={() => download(row, 'pdf')} aria-label={`Download ${row.title} as PDF`}>PDF</button>
              </> : row.status === 'PROCESSING' ? <span className="text-xs text-indigo-600">Processing…</span> :
                <button disabled={active || busy !== null} className={buttonClass} onClick={() => run(row.id)}>{row.status === 'FAILED' ? 'Retry' : 'Transcribe'}</button>}
              {busy === row.id && <span role="status" className="text-xs text-zinc-500">Please wait…</span>}
            </div></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {rows.length === 0 && <p className="px-6 py-14 text-center text-sm text-zinc-500">{search ? 'No transcriptions match your search.' : 'No transcriptions yet. Upload an audio or video file above to get started.'}</p>}
    <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between text-xs text-zinc-500">
      <span>{filtered.length} results · Page {currentPage} of {pages}</span>
      <div className="flex gap-2"><button className={buttonClass} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className={buttonClass} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>
    </div>
    <dialog ref={errorDialog} aria-labelledby="transcription-error-title" onClose={() => setFailedRequest(null)}
      onClick={event => { if (event.target === event.currentTarget) errorDialog.current?.close(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[85vh] p-0 bg-white text-zinc-900 border border-zinc-200 rounded-xl shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm">
      {failedRequest && <div className="flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50/75 flex items-center justify-between gap-4">
          <h2 id="transcription-error-title" className="text-sm font-bold">Transcription error details</h2>
          <button type="button" onClick={() => errorDialog.current?.close()} aria-label="Close error details" className="text-zinc-500 hover:text-zinc-950 rounded-lg p-1 cursor-pointer focus-visible:outline-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div><p className="text-sm font-bold break-words">{failedRequest.title}</p><p className="text-xs text-zinc-500 mt-1 break-all">{failedRequest.filename}</p></div>
          <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-4">{failedRequest.errorMessage || 'No error message details recorded.'}</pre>
        </div>
        <div className="px-6 py-4 border-t border-zinc-200 flex justify-end">
          <button type="button" onClick={() => errorDialog.current?.close()} className={buttonClass}>Close</button>
        </div>
      </div>}
    </dialog>
  </section>;
}
