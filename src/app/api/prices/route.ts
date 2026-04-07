import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getSnapshots } from '@/lib/wayback';
import { extractPriceData } from '@/lib/parser';

/** Run tasks with max `concurrency` in flight at once */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export interface PricePoint {
  date: string;       // YYYY-MM-DD
  price: number;      // KZT
  shop?: string;
  timestamp: string;  // Wayback timestamp (for dedup)
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,kk;q=0.8,en;q=0.7',
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get<string>(url, {
      headers: FETCH_HEADERS,
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
    // Keep city param if present; strip other query params
    const city = u.searchParams.get('c');
    let out = `${u.origin}${u.pathname}`;
    if (!out.endsWith('/')) out += '/';
    if (city) out += `?c=${city}`;
    return out;
  } catch {
    return raw;
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  if (!raw.includes('kaspi.kz/shop/p/')) {
    return NextResponse.json({ error: 'URL must be a kaspi.kz product link' }, { status: 400 });
  }

  const productUrl = normalizeKaspiUrl(raw);

  let snapshots;
  try {
    snapshots = await getSnapshots(productUrl);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to query web archive', details: String(err) },
      { status: 502 }
    );
  }

  if (snapshots.length === 0) {
    return NextResponse.json({
      points: [],
      total: 0,
      message: 'No archived snapshots found for this product URL.',
    });
  }

  // Concurrency: 4 parallel Wayback fetches
  const results = await mapConcurrent(snapshots, 4, async (snap): Promise<PricePoint | null> => {
    const html = await fetchHtml(snap.archivedUrl);
    if (!html) return null;

    const parsed = extractPriceData(html);
    if (!parsed) return null;

    return {
      date: snap.date.toISOString().split('T')[0],
      price: parsed.price,
      shop: parsed.shop || undefined,
      timestamp: snap.timestamp,
    };
  });

  const points: PricePoint[] = results
    .filter((r): r is PricePoint => r !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    points,
    total: snapshots.length,
    parsed: points.length,
  });
}
