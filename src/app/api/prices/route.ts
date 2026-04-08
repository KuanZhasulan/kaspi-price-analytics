import { NextRequest } from 'next/server';
import axios from 'axios';
import { getSnapshots, type Snapshot } from '@/lib/wayback';
import { getArchiveTodaySnapshots } from '@/lib/archiveToday';
import { getCommonCrawlSnapshots, fetchCCPage, type CCSnapshot } from '@/lib/commonCrawl';
import { extractPriceData, extractProductName } from '@/lib/parser';
import { log } from '@/lib/log';

export type SourceId = 'live' | 'wayback' | 'archive.today' | 'common-crawl';

export interface PricePoint {
  date: string;
  price: number;
  shop?: string;
  timestamp: string;
  source: SourceId;
}

export type SourceStatus = 'ok' | 'empty' | 'error';

export type SSEEvent =
  | { type: 'source'; source: SourceId; status: SourceStatus; count: number }
  | { type: 'snapshots'; total: number }
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; points: PricePoint[]; total: number; parsed: number }
  | { type: 'error'; message: string };

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,kk;q=0.8,en;q=0.7',
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const { data } = await axios.get<string>(url, {
      headers: BROWSER_HEADERS,
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

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone?: () => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
      onDone?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ─── Snapshot unification ─────────────────────────────────────────────────────

interface TaggedSnap {
  timestamp: string;
  date: Date;
  source: SourceId;
  // For standard archives
  archivedUrl?: string;
  // For Common Crawl
  ccData?: CCSnapshot;
}

function mergeAllByMonth(
  groups: Array<{ snaps: Array<Snapshot | CCSnapshot>; source: SourceId }>
): TaggedSnap[] {
  const byMonth = new Map<string, TaggedSnap>();

  for (const { snaps, source } of groups) {
    for (const s of snaps) {
      const month = s.timestamp.slice(0, 6);
      if (byMonth.has(month)) continue; // keep first source found per month

      const isCC = 'filename' in s;
      byMonth.set(month, {
        timestamp: s.timestamp,
        date: s.date,
        source,
        archivedUrl: isCC ? undefined : (s as Snapshot).archivedUrl,
        ccData: isCC ? (s as CCSnapshot) : undefined,
      });
    }
  }

  return Array.from(byMonth.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchSnapshotHtml(snap: TaggedSnap): Promise<string | null> {
  if (snap.ccData) return fetchCCPage(snap.ccData);
  if (snap.archivedUrl) return fetchHtml(snap.archivedUrl);
  return null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
      const startMs = Date.now();
      let productName: string | null = null;

      log.header('Kaspi Price Analytics — new request');
      log.info(`URL: ${productUrl}`);

      // ── Step 1: All sources in parallel ──────────────────────────────────
      const [
        liveHtml,
        waybackSnaps,
        archiveTodaySnaps,
        ccSnaps,
      ] = await Promise.all([
        fetchHtml(productUrl),
        getSnapshots(productUrl).catch(() => [] as Snapshot[]),
        getArchiveTodaySnapshots(productUrl).catch(() => [] as Snapshot[]),
        getCommonCrawlSnapshots(productUrl).catch(() => [] as CCSnapshot[]),
      ]);

      log.info(
        `Sources ready — live:${!!liveHtml} wayback:${waybackSnaps.length} ` +
        `archive.today:${archiveTodaySnaps.length} cc:${ccSnaps.length}`
      );

      // Emit per-source status so the UI can show a source status panel
      ctrl.enqueue(sse({ type: 'source', source: 'live',          status: liveHtml                 ? 'ok' : 'error', count: liveHtml                 ? 1 : 0 }));
      ctrl.enqueue(sse({ type: 'source', source: 'wayback',       status: waybackSnaps.length      ? 'ok' : 'empty', count: waybackSnaps.length             }));
      ctrl.enqueue(sse({ type: 'source', source: 'archive.today', status: archiveTodaySnaps.length ? 'ok' : 'empty', count: archiveTodaySnaps.length        }));
      ctrl.enqueue(sse({ type: 'source', source: 'common-crawl',  status: ccSnaps.length           ? 'ok' : 'empty', count: ccSnaps.length                  }));

      // ── Step 2: Live price ────────────────────────────────────────────────
      const today = new Date().toISOString().split('T')[0];
      let livePoint: PricePoint | null = null;

      if (liveHtml) {
        productName = extractProductName(liveHtml);
        const parsed = extractPriceData(liveHtml);
        if (parsed) {
          log.price(today, parsed.price, parsed.shop, `${parsed.strategy} [live]`);
          livePoint = { date: today, price: parsed.price, shop: parsed.shop, timestamp: 'live', source: 'live' };
        }
      }

      // ── Step 3: Merge all archive sources, one snapshot per month ─────────
      const allSnaps = mergeAllByMonth([
        { snaps: waybackSnaps,      source: 'wayback'       },
        { snaps: archiveTodaySnaps, source: 'archive.today' },
        { snaps: ccSnaps,           source: 'common-crawl'  },
      ]);

      if (allSnaps.length === 0 && !livePoint) {
        log.info('No data found from any source.');
        ctrl.enqueue(sse({ type: 'done', points: [], total: 0, parsed: 0 }));
        ctrl.close();
        return;
      }

      if (allSnaps.length === 0) {
        const pts = [livePoint].filter(Boolean) as PricePoint[];
        log.summary(productName, pts.length, 0, Date.now() - startMs);
        ctrl.enqueue(sse({ type: 'done', points: pts, total: 0, parsed: pts.length }));
        ctrl.close();
        return;
      }

      log.found(allSnaps.length, productUrl);
      ctrl.enqueue(sse({ type: 'snapshots', total: allSnaps.length }));

      // ── Step 5: Fetch + parse each snapshot (4 concurrent) ───────────────
      let done = 0;
      const rawResults = await mapConcurrent(
        allSnaps,
        4,
        async (snap) => {
          const date = snap.date.toISOString().split('T')[0];
          const html = await fetchSnapshotHtml(snap);
          if (!html) { log.miss(date); return null; }
          if (!productName) productName = extractProductName(html);
          const parsed = extractPriceData(html);
          if (!parsed) { log.miss(date); return null; }
          log.price(date, parsed.price, parsed.shop, `${parsed.strategy} [${snap.source}]`);
          return { date, price: parsed.price, shop: parsed.shop || undefined, timestamp: snap.timestamp, source: snap.source } as PricePoint;
        },
        () => {
          done++;
          ctrl.enqueue(sse({ type: 'progress', done, total: allSnaps.length }));
        }
      );

      // ── Step 6: Merge everything ──────────────────────────────────────────
      const archivePoints = rawResults.filter((r): r is PricePoint => r !== null);
      const allPoints: PricePoint[] = [...archivePoints];
      if (livePoint && !allPoints.some((p) => p.date === livePoint.date)) allPoints.push(livePoint);

      const points = allPoints.sort((a, b) => a.date.localeCompare(b.date));
      log.summary(productName, points.length, allSnaps.length, Date.now() - startMs);
      ctrl.enqueue(sse({ type: 'done', points, total: allSnaps.length, parsed: points.length }));
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
