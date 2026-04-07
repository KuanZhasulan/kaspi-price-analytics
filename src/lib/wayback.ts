import axios from 'axios';

export interface Snapshot {
  timestamp: string;
  archivedUrl: string;
  date: Date;
}

/**
 * Fetch available Wayback Machine snapshots for a URL.
 * Uses collapse=timestamp:6 to get at most one snapshot per month.
 */
export async function getSnapshots(productUrl: string): Promise<Snapshot[]> {
  // Strip query params for broader matching, keep path only
  let baseUrl = productUrl;
  try {
    const parsed = new URL(productUrl);
    baseUrl = `${parsed.hostname}${parsed.pathname}`;
  } catch {}

  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx` +
    `?url=${encodeURIComponent(baseUrl)}*` +
    `&output=json` +
    `&fl=timestamp,statuscode` +
    `&filter=statuscode:200` +
    `&collapse=timestamp:6` +
    `&limit=60` +
    `&from=20190101`;

  const response = await axios.get<string[][]>(cdxUrl, { timeout: 30_000 });
  const rows = response.data;

  if (!Array.isArray(rows) || rows.length <= 1) return [];

  // rows[0] is the header ["timestamp","statuscode"]
  return rows.slice(1).map(([timestamp]) => ({
    timestamp,
    archivedUrl: `https://web.archive.org/web/${timestamp}id_/${productUrl}`,
    date: parseWaybackTimestamp(timestamp),
  }));
}

function parseWaybackTimestamp(ts: string): Date {
  // Format: YYYYMMDDHHmmss
  const year = parseInt(ts.slice(0, 4), 10);
  const month = parseInt(ts.slice(4, 6), 10) - 1;
  const day = parseInt(ts.slice(6, 8), 10);
  return new Date(year, month, day);
}
