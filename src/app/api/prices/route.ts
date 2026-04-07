import { NextRequest } from 'next/server';
import axios from 'axios';
import { getSnapshots } from '@/lib/wayback';
import { extractPriceData } from '@/lib/parser';

export interface PricePoint {
  date: string;
  price: number;
  shop?: string;
  timestamp: string;
}

export type SSEEvent =
  | { type: 'snapshots'; total: number }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; points: PricePoint[]; total: number; parsed: number }
  | { type: 'error'; message: string };

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,kk;q=0.8,en;q=0.7',
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get<string>(url, {
      headers: HEADERS,
      timeout: 20_000,
      maxRedirects: 5,
      responseType: 'text',
    });
    return data;
  } catch {
    return null;
  }
}

function normalizeKaspiUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const city = u.searchParams.get('c');
    let out = `${u.origin}${u.pathname}`;
    if (!out.endsWith('/')) out += '/';
    if (city) out += `?c=${city}`;
    return out;
  } catch {
    return raw;
  }
}

/** Run tasks with bounded concurrency */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone?: (index: number, result: R) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
      onDone?.(i, results[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');

  const enc = new TextEncoder();
  function sse(event: SSEEvent): Uint8Array {
    return enc.encode(`data: ${JSON.stringify(event)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(ctrl) {
      if (!raw) {
        ctrl.enqueue(sse({ type: 'error', message: 'Missing url parameter' }));
        ctrl.close();
        return;
      }
      if (!raw.includes('kaspi.kz/shop/p/')) {
        ctrl.enqueue(sse({ type: 'error', message: 'URL must be a kaspi.kz product link' }));
        ctrl.close();
        return;
      }

      const productUrl = normalizeKaspiUrl(raw);

      let snapshots;
      try {
        snapshots = await getSnapshots(productUrl);
      } catch (e) {
        ctrl.enqueue(sse({ type: 'error', message: `Failed to query web archive: ${String(e)}` }));
        ctrl.close();
        return;
      }

      if (snapshots.length === 0) {
        ctrl.enqueue(sse({ type: 'done', points: [], total: 0, parsed: 0 }));
        ctrl.close();
        return;
      }

      ctrl.enqueue(sse({ type: 'snapshots', total: snapshots.length }));

      let done = 0;
      const rawResults = await mapConcurrent(
        snapshots,
        4,
        async (snap) => {
          const html = await fetchHtml(snap.archivedUrl);
          if (!html) return null;
          const parsed = extractPriceData(html);
          if (!parsed) return null;
          return {
            date: snap.date.toISOString().split('T')[0],
            price: parsed.price,
            shop: parsed.shop || undefined,
            timestamp: snap.timestamp,
          } as PricePoint;
        },
        () => {
          done++;
          ctrl.enqueue(sse({ type: 'progress', done, total: snapshots.length }));
        }
      );

      const points = rawResults
        .filter((r): r is PricePoint => r !== null)
        .sort((a, b) => a.date.localeCompare(b.date));

      ctrl.enqueue(sse({ type: 'done', points, total: snapshots.length, parsed: points.length }));
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
