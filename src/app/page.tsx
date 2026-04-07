'use client';

import { useState, useRef } from 'react';
import type { PricePoint } from '@/app/api/prices/route';
import PriceChart from '@/components/PriceChart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Search, TrendingUp } from 'lucide-react';

interface ApiResponse {
  points: PricePoint[];
  total: number;
  parsed: number;
  error?: string;
  message?: string;
}

const EXAMPLE_URL =
  'https://kaspi.kz/shop/p/apple-macbook-air-13-2020-13-3-8-gb-ssd-256-gb-macos-mgn63ru-a-101182724/?c=750000000';

function LoadingSkeleton() {
  return (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

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

  const isEmpty = status === 'done' && result && result.points.length === 0;

  return (
    <main className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm tracking-tight">Kaspi Price Analytics</span>
          <Badge variant="secondary" className="text-xs ml-auto">
            Wayback Machine
          </Badge>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3 py-6">
          <h1 className="text-4xl font-bold tracking-tight">
            Track{' '}
            <span className="text-primary">price history</span>{' '}
            on kaspi.kz
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Paste any kaspi.kz product link to see how the price has changed over time using web
            archive data.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://kaspi.kz/shop/p/..."
              className="pl-9 h-11 text-sm bg-secondary border-border/60 focus-visible:ring-primary"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={status === 'loading'}
            className="h-11 px-6 font-medium"
          >
            {status === 'loading' ? 'Analyzing…' : 'Analyze'}
          </Button>
        </form>

        {/* Example link */}
        {status === 'idle' && (
          <div className="text-center -mt-4">
            <button
              type="button"
              onClick={useExample}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-4"
            >
              Try an example: Apple MacBook Air 13 2020
            </button>
          </div>
        )}

        {/* States */}
        {status === 'loading' && <LoadingSkeleton />}

        {status === 'error' && result?.error && (
          <Alert variant="destructive" className="max-w-2xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        {(isEmpty || result?.message) && (
          <div className="text-center py-16 text-muted-foreground space-y-2">
            <p className="text-base font-medium text-foreground">No price data found</p>
            {result?.total !== undefined && (
              <p className="text-sm">
                Checked {result.total} archive snapshot{result.total !== 1 ? 's' : ''} — none
                contained extractable price information.
              </p>
            )}
            {result?.message && <p className="text-sm">{result.message}</p>}
            <p className="text-xs text-muted-foreground/60 mt-1">
              This can happen with JavaScript-heavy pages captured before scripts ran.
            </p>
          </div>
        )}

        {status === 'done' && result && result.points.length > 0 && (
          <PriceChart data={result.points} total={result.total} parsed={result.parsed} />
        )}
      </div>
    </main>
  );
}
