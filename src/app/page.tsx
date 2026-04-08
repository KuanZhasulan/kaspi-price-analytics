'use client';

import { useState, useRef } from 'react';
import type { PricePoint, SSEEvent, SourceId, SourceStatus } from '@/app/api/prices/route';
import PriceChart from '@/components/PriceChart';
import { Search, TrendingUp } from 'lucide-react';

interface Result {
  points: PricePoint[];
  total: number;
  parsed: number;
}

interface Progress {
  done: number;
  total: number;
}

// ─── Source status panel ──────────────────────────────────────────────────────

const ALL_SOURCES: SourceId[] = ['live', 'wayback', 'archive.today', 'common-crawl'];

const SOURCE_LABELS: Record<SourceId, string> = {
  live:            'Live',
  wayback:         'Wayback Machine',
  'archive.today': 'Archive.today',
  'common-crawl':  'Common Crawl',
};

type SourceState = { status: 'checking' | SourceStatus; count: number };
type SourceStatuses = Record<SourceId, SourceState>;

function initSourceStatuses(): SourceStatuses {
  return Object.fromEntries(
    ALL_SOURCES.map((id) => [id, { status: 'checking', count: 0 }])
  ) as SourceStatuses;
}

function StatusDot({ status }: { status: SourceState['status'] }) {
  if (status === 'checking')
    return <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse shrink-0" />;
  if (status === 'ok')
    return <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />;
  if (status === 'empty')
    return <span className="w-2 h-2 rounded-full bg-slate-700 border border-slate-600 shrink-0" />;
  // error
  return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />;
}

function sourceLabel(id: SourceId, state: SourceState): string {
  if (state.status === 'checking') return 'Checking…';
  if (state.status === 'error')    return 'Unavailable';
  if (state.status === 'empty')    return 'No data';
  // ok
  if (id === 'live') return 'Fetched';
  return `${state.count} snapshot${state.count !== 1 ? 's' : ''}`;
}

function SourceStatusPanel({ statuses }: { statuses: SourceStatuses }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
          Archive sources
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
          {ALL_SOURCES.map((id) => {
            const state = statuses[id];
            return (
              <div key={id} className="flex items-center gap-2 min-w-0">
                <StatusDot status={state.status} />
                <span className="text-sm text-slate-300 truncate">{SOURCE_LABELS[id]}</span>
                <span className={`text-xs ml-auto shrink-0 tabular-nums ${
                  state.status === 'checking' ? 'text-slate-600' :
                  state.status === 'ok'       ? 'text-teal-400'  :
                  state.status === 'error'    ? 'text-red-500'   :
                  'text-slate-600'
                }`}>
                  {sourceLabel(id, state)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const EXAMPLE_URL =
  'https://kaspi.kz/shop/p/apple-macbook-air-13-2020-13-3-8-gb-ssd-256-gb-macos-mgn63ru-a-101182724/?c=750000000';

function ProgressBar({ done, total }: Progress) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-3 py-10 text-center">
      <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-slate-300 font-medium">Fetching price history from web archives…</p>
      <p className="text-slate-500 text-sm">
        {done > 0 ? `Processed ${done} of ${total} snapshots` : `Found ${total} snapshots, processing…`}
      </p>
      <div className="max-w-sm mx-auto">
        <div className="flex justify-between text-xs text-slate-600 mb-1.5">
          <span>{pct}%</span>
          <span>{total} snapshots</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-slate-600 text-xs mt-2">This may take 30–90 seconds</p>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatuses>(initSourceStatuses);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    // Cancel any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setErrorMsg('');
    setSourceStatuses(initSourceStatuses());

    try {
      const res = await fetch(`/api/prices?url=${encodeURIComponent(url.trim())}`, {
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';

        for (const chunk of lines) {
          const line = chunk.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line) as SSEEvent;
            if (event.type === 'source') {
              setSourceStatuses((prev) => ({
                ...prev,
                [event.source]: { status: event.status, count: event.count },
              }));
            } else if (event.type === 'snapshots') {
              setProgress({ done: 0, total: event.total });
            } else if (event.type === 'progress') {
              setProgress({ done: event.done, total: event.total });
            } else if (event.type === 'done') {
              setResult({ points: event.points, total: event.total, parsed: event.parsed });
              setStatus('done');
            } else if (event.type === 'error') {
              setErrorMsg(event.message);
              setStatus('error');
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3 relative">
          <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-slate-950" />
          </div>
          <span className="font-semibold text-sm text-slate-200">Kaspi Price Analytics</span>
          <span className="absolute left-1/2 -translate-x-1/2 text-xs text-slate-500">
            developed by <span className="text-slate-400">Kuan Zhassulan</span>{' '}
            <span className="text-slate-600">(KZ)</span>
          </span>
          <span className="ml-auto text-xs bg-slate-800 text-slate-400 border border-slate-700 rounded-full px-3 py-1">
            Wayback Machine
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3 pb-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Track{' '}
            <span className="text-teal-400">price history</span>
            {' '}on kaspi.kz
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto text-base">
            Paste any kaspi.kz product link to see how the price has changed over time.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://kaspi.kz/shop/p/..."
                className="w-full pl-9 pr-4 h-11 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
                required
                disabled={status === 'loading'}
              />
            </div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="h-11 px-6 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium rounded-xl transition-colors shrink-0"
            >
              {status === 'loading' ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          {status === 'idle' && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => { setUrl(EXAMPLE_URL); inputRef.current?.focus(); }}
                className="text-xs text-slate-600 hover:text-teal-400 transition-colors underline underline-offset-2"
              >
                Try example: Apple MacBook Air 13 2020
              </button>
            </div>
          )}
        </form>

        {/* Source status panel — visible while loading and after done */}
        {(status === 'loading' || status === 'done') && (
          <SourceStatusPanel statuses={sourceStatuses} />
        )}

        {/* Loading + progress */}
        {status === 'loading' && (
          <ProgressBar done={progress.done} total={progress.total} />
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="max-w-2xl mx-auto bg-red-950/40 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
            <span className="font-medium">Error: </span>{errorMsg}
          </div>
        )}

        {/* No data */}
        {status === 'done' && result && result.points.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <p className="text-slate-300 font-medium">No price data found</p>
            <p className="text-slate-500 text-sm">
              Checked {result.total} archive snapshot{result.total !== 1 ? 's' : ''} — none
              contained extractable price data.
            </p>
            <p className="text-slate-600 text-xs mt-1">
              This happens when Kaspi&apos;s JavaScript-rendered prices weren&apos;t captured by the
              archiver.
            </p>
          </div>
        )}

        {/* Chart */}
        {status === 'done' && result && result.points.length > 0 && (
          <PriceChart data={result.points} total={result.total} parsed={result.parsed} />
        )}
      </div>
    </div>
  );
}
