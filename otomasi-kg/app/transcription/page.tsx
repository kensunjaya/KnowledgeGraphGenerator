"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TranscriptionForm } from '@/components/transcription-form';
import { TranscriptionTable } from '@/components/transcription-table';
import { TopProgressBar } from '@/components/top-progress-bar';
import { TranscriptionRequest } from '@/lib/transcription-options';

export default function TranscriptionPage() {
  const [requests, setRequests] = useState<TranscriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/transcriptions', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannot load transcriptions.');
      setRequests(data); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Cannot load transcriptions.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Schedule the initial request alongside the polling subscription.
    const initial = setTimeout(() => { void refresh(); }, 0);
    // Poll also when idle, so jobs started in another tab appear here.
    const interval = setInterval(() => { void refresh(); }, 3000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [refresh]);

  return <div className="min-h-screen bg-white font-sans text-zinc-900 pb-20">
    <TopProgressBar show={loading || requests.some(row => row.status === 'PROCESSING')} />
    <header className="bg-white border-b border-zinc-200 py-4.5 px-6 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <Link href="/" className="px-3 py-1 rounded-lg text-xs font-semibold text-zinc-600 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200/80">← Portal</Link>
        <div className="h-4 w-px bg-zinc-200" />
        <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />
        <h1 className="text-md font-bold tracking-tight text-zinc-950">Transcription</h1>
      </div>
    </header>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-8 flex flex-col items-center">
      <TranscriptionForm onCreated={refresh} />
      {error && <div role="alert" className="w-full text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-4">{error} <button onClick={refresh} className="font-semibold underline ml-2">Try again</button></div>}
      {loading ? <p className="text-center py-16 text-zinc-500 text-sm">Loading transcriptions…</p> : <TranscriptionTable requests={requests} onRefresh={refresh} />}
    </main>
  </div>;
}
