import axios from 'axios';
import type { Snapshot } from './wayback';

/**
 * Fetch historical snapshots from Archive.today (archive.ph) via the Memento timemap API.
 * Returns snapshots in the same format as Wayback Machine.
 */
export async function getArchiveTodaySnapshots(productUrl: string): Promise<Snapshot[]> {
  const timemapUrl = `https://archive.ph/timemap/link/${productUrl}`;

  let body: string;
  try {
    const { data } = await axios.get<string>(timemapUrl, {
      timeout: 10_000,
      headers: { 'Accept': 'application/link-format, text/plain, */*' },
      responseType: 'text',
    });
    body = data;
  } catch {
    return [];
  }

  // Parse lines like:
  // <https://archive.ph/20211001120000/https://kaspi.kz/...>; rel="memento"; datetime="..."
  const re = /<(https:\/\/archive\.ph\/(\d{14})\/[^>]+)>;\s*rel="memento"/g;
  const byMonth = new Map<string, { ts: string; url: string }>();

  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const [, archivedUrl, ts] = m;
    const month = ts.slice(0, 6); // YYYYMM
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

function parseTs(ts: string): Date {
  return new Date(
    parseInt(ts.slice(0, 4), 10),
    parseInt(ts.slice(4, 6), 10) - 1,
    parseInt(ts.slice(6, 8), 10)
  );
}
