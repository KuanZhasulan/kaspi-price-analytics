import axios from 'axios';
import type { Snapshot } from './wayback';

/**
 * Query the Memento TimeTravel aggregator, which combines 20+ web archives
 * (Internet Archive, Archive.today, national libraries, etc.) in one request.
 *
 * Returns one snapshot per calendar month, deduplicated across all member archives.
 */
export async function getMementoSnapshots(productUrl: string): Promise<Snapshot[]> {
  const timemapUrl = `http://timetravel.mementoweb.org/timemap/link/${productUrl}`;

  let body: string;
  try {
    const { data } = await axios.get<string>(timemapUrl, {
      timeout: 15_000,
      responseType: 'text',
      headers: { Accept: 'application/link-format, text/plain, */*' },
    });
    body = data;
  } catch {
    return [];
  }

  // Parse Link-format mementos:
  // <https://web.archive.org/web/20210601.../url>; rel="memento"; datetime="..."
  const re = /<(https?:\/\/[^>]+)>;\s*rel="memento"[^,]*/g;
  const byMonth = new Map<string, { ts: string; url: string }>();

  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const archivedUrl = m[1];
    const ts = extractTimestamp(archivedUrl);
    if (!ts) continue;
    const month = ts.slice(0, 6);
    if (!byMonth.has(month) || ts < byMonth.get(month)!.ts) {
      byMonth.set(month, { ts, url: archivedUrl });
    }
  }

  return Array.from(byMonth.values())
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map(({ ts, url }) => ({
      timestamp: ts,
      archivedUrl: url,
      date: parseTs(ts),
    }));
}

/**
 * Extract a 14-digit timestamp from known archive URL patterns:
 *   Wayback:     https://web.archive.org/web/20210601120000/...
 *   Archive.ph:  https://archive.ph/20210601120000/...
 *   Others:      look for any 14-digit run in the URL
 */
function extractTimestamp(url: string): string | null {
  const m = url.match(/\/(\d{14})\//);
  return m ? m[1] : null;
}

function parseTs(ts: string): Date {
  return new Date(
    parseInt(ts.slice(0, 4), 10),
    parseInt(ts.slice(4, 6), 10) - 1,
    parseInt(ts.slice(6, 8), 10)
  );
}
