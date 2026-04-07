'use client';

import { useState, useRef } from 'react';
import type { PricePoint } from '@/app/api/prices/route';
import PriceChart from '@/components/PriceChart';

interface ApiResponse {
  points: PricePoint[];
  total: number;
  parsed: number;
  error?: string;
  message?: string;
}

const EXAMPLE_URL =
  'https://kaspi.kz/shop/p/apple-macbook-air-13-2020-13-3-8-gb-ssd-256-gb-macos-mgn63ru-a-101182724/?c=750000000';

export default function Home() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ApiResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus('loading');
    setResult(null);

    try {
      const res = await fetch(`/api/prices?url=${encodeURIComponent(url.trim())}`);
      const json: ApiResponse = await res.json();
      setResult(json);
      setStatus(json.error ? 'error' : 'done');
    } catch {
      setResult({ points: [], total: 0, parsed: 0, error: 'Network error. Please try again.' });
      setStatus('error');
    }
  }

  function useExample() {
    setUrl(EXAMPLE_URL);
    inputRef.current?.focus();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center text-slate-950 font-bold text-sm">
              K
            </div>
            <span className="text-slate-400 text-sm font-medium">Kaspi Price Analytics</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Price History Tracker</h1>
          <p className="text-slate-400">
            Paste a kaspi.kz product link to see how the price has changed over time using web
            archive data.
          </p>
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://kaspi.kz/shop/p/..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors text-sm"
              required
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-6 py-3.5 rounded-xl font-medium transition-colors text-sm whitespace-nowrap"
            >
              {status === 'loading' ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          <button
            type="button"
            onClick={useExample}
            className="mt-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            Use example: MacBook Air 13 2020
          </button>
        </form>

        {/* Loading state */}
        {status === 'loading' && (
          <div className="text-center py-20 text-slate-400">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
            <p className="font-medium mb-1">Fetching price history from web archives</p>
            <p className="text-sm text-slate-600">
              This queries the Wayback Machine and may take 30–90 seconds…
            </p>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && result?.error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl p-5 text-red-400">
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1 text-red-500">{result.error}</p>
          </div>
        )}

        {/* Empty state */}
        {status === 'done' && result && result.points.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <p className="text-lg font-medium text-slate-400 mb-2">No price data found</p>
            <p className="text-sm">
              The Wayback Machine has {result.total} snapshot{result.total !== 1 ? 's' : ''} of
              this page, but none contained extractable price information.
            </p>
            <p className="text-sm mt-1 text-slate-600">
              This can happen with heavily JavaScript-rendered pages captured before scripts ran.
            </p>
          </div>
        )}

        {/* Message (e.g. no snapshots) */}
        {status === 'done' && result?.message && result.points.length === 0 && (
          <div className="bg-yellow-950/40 border border-yellow-800 rounded-xl p-5 text-yellow-400 text-sm">
            {result.message}
          </div>
        )}

        {/* Results */}
        {status === 'done' && result && result.points.length > 0 && (
          <PriceChart
            data={result.points}
            total={result.total}
            parsed={result.parsed}
          />
        )}
      </div>
    </main>
  );
}
