import axios from 'axios';

export interface Snapshot {
  timestamp: string;
  archivedUrl: string;
  date: Date;
}

/**
 * Try multiple CDX URL patterns in parallel and merge unique results.
 * Kaspi pages may be archived under several slightly-different URL forms.
 */
export async function getSnapshots(productUrl: string): Promise<Snapshot[]> {
  let hostname = '';
  let pathname = '';
  let cityParam = '';

  try {
    const u = new URL(productUrl);
    hostname  = u.hostname;
    pathname  = u.pathname;
    cityParam = u.searchParams.get('c') ?? '';
  } catch {
    return [];
  }

  // Normalise pathname (ensure trailing slash)
  const path = pathname.endsWith('/') ? pathname : pathname + '/';
  const base = `${hostname}${path}`;

  // Multiple patterns to maximise hit rate
  const patterns = [
    `${base}*`,                                              // any query params
    `${base}?c=${cityParam}*`,                               // with city param
    `${base}`,                                               // exact (no params)
    `${hostname}${pathname.endsWith('/') ? pathname.slice(0,-1) : pathname}*`, // no trailing slash
  ].filter(Boolean);

  const allRows = await Promise.all(patterns.map((pat) => queryCdx(pat)));
  const merged  = mergeSnapshots(allRows.flat(), productUrl);
  return merged;
}

async function queryCdx(urlPattern: string): Promise<Snapshot[]> {
  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx` +
    `?url=${encodeURIComponent(urlPattern)}` +
    `&output=json` +
    `&fl=timestamp,statuscode` +
    `&filter=statuscode:200` +
    `&collapse=timestamp:6` +   // one per month
    `&limit=100`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data } = await axios.get<string[][]>(cdxUrl, { timeout: 60_000 });
      if (!Array.isArray(data) || data.length <= 1) return [];
      return data.slice(1).map(([ts]) => toSnapshot(ts, ''));
    } catch {
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return [];
}

/** Deduplicate by YYYYMM, keep earliest per month, build final archivedUrl */
function mergeSnapshots(snaps: Snapshot[], productUrl: string): Snapshot[] {
  const byMonth = new Map<string, string>(); // YYYYMM → timestamp
  for (const s of snaps) {
    const month = s.timestamp.slice(0, 6);
    if (!byMonth.has(month) || s.timestamp < byMonth.get(month)!) {
      byMonth.set(month, s.timestamp);
    }
  }
  return Array.from(byMonth.values())
    .sort()
    .map((ts) => ({
      timestamp: ts,
      archivedUrl: `https://web.archive.org/web/${ts}id_/${productUrl}`,
      date: parseTs(ts),
    }));
}

function toSnapshot(ts: string, url: string): Snapshot {
  return { timestamp: ts, archivedUrl: url, date: parseTs(ts) };
}

function parseTs(ts: string): Date {
  return new Date(
    parseInt(ts.slice(0, 4), 10),
    parseInt(ts.slice(4, 6), 10) - 1,
    parseInt(ts.slice(6, 8), 10)
  );
}
