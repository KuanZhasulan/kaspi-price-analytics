import axios from 'axios';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

export interface CCSnapshot {
  timestamp: string;
  date: Date;
  filename: string;
  offset: number;
  length: number;
}

interface CdxRecord {
  timestamp: string;
  filename: string;
  offset: string;
  length: string;
}

/** Fetch list of CC crawl index IDs, most recent first */
async function getCrawlIndexIds(maxCount = 20): Promise<string[]> {
  try {
    const { data } = await axios.get<Array<{ id: string }>>(
      'https://index.commoncrawl.org/collinfo.json',
      { timeout: 10_000 }
    );
    return data.slice(0, maxCount).map((c) => c.id);
  } catch {
    return [];
  }
}

/** Query one CC index CDX endpoint for a URL pattern */
async function queryIndex(indexId: string, urlPattern: string): Promise<CdxRecord[]> {
  const url =
    `https://index.commoncrawl.org/${indexId}-index` +
    `?url=${encodeURIComponent(urlPattern)}` +
    `&output=json&limit=3&filter=status:200` +
    `&fl=timestamp,filename,offset,length`;

  try {
    const { data } = await axios.get<string>(url, {
      timeout: 12_000,
      responseType: 'text',
    });
    // Response is NDJSON (one JSON object per line)
    return data
      .split('\n')
      .map((line) => { try { return JSON.parse(line) as CdxRecord; } catch { return null; } })
      .filter((r): r is CdxRecord => r !== null && !!r.timestamp && !!r.filename);
  } catch {
    return [];
  }
}

/**
 * Query the last `maxIndexes` Common Crawl indexes in parallel.
 * Returns one snapshot per calendar month (earliest per month).
 */
export async function getCommonCrawlSnapshots(
  productUrl: string,
  maxIndexes = 20
): Promise<CCSnapshot[]> {
  const indexIds = await getCrawlIndexIds(maxIndexes);
  if (indexIds.length === 0) return [];

  // Build URL pattern without city param, with wildcard for query string
  let urlPattern = productUrl;
  try {
    const u = new URL(productUrl);
    urlPattern = `${u.hostname}${u.pathname}*`;
  } catch {}

  // Query all indexes in parallel
  const allRecords = (
    await Promise.all(indexIds.map((id) => queryIndex(id, urlPattern)))
  ).flat();

  // Deduplicate: one per calendar month (keep earliest)
  const byMonth = new Map<string, CdxRecord>();
  for (const rec of allRecords) {
    const month = rec.timestamp.slice(0, 6);
    if (!byMonth.has(month)) byMonth.set(month, rec);
  }

  return Array.from(byMonth.values())
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((rec) => ({
      timestamp: rec.timestamp,
      date: parseTs(rec.timestamp),
      filename: rec.filename,
      offset: parseInt(rec.offset, 10),
      length: parseInt(rec.length, 10),
    }));
}

/**
 * Fetch and decode the HTML from a Common Crawl WARC record.
 * Steps: byte-range fetch → gunzip outer WARC → skip HTTP headers → optional inner gunzip.
 */
export async function fetchCCPage(snap: CCSnapshot): Promise<string | null> {
  if (snap.length > 3_000_000) return null; // skip unreasonably large records

  try {
    const { data } = await axios.get<ArrayBuffer>(
      `https://data.commoncrawl.org/${snap.filename}`,
      {
        headers: { Range: `bytes=${snap.offset}-${snap.offset + snap.length - 1}` },
        responseType: 'arraybuffer',
        timeout: 30_000,
      }
    );

    const warcBuf = await gunzipAsync(Buffer.from(data));
    return await extractBodyFromWarc(warcBuf);
  } catch {
    return null;
  }
}

async function extractBodyFromWarc(buf: Buffer): Promise<string | null> {
  // WARC record layout:
  //   [WARC headers] \r\n\r\n [HTTP response] \r\n\r\n
  // HTTP response layout:
  //   [HTTP status + headers] \r\n\r\n [body]

  const warcEnd = findDoubleCrLf(buf, 0);
  if (warcEnd === -1) return null;

  const httpBuf = buf.slice(warcEnd + 4);
  const httpHeaderEnd = findDoubleCrLf(httpBuf, 0);
  if (httpHeaderEnd === -1) return null;

  const httpHeaderStr = httpBuf.slice(0, httpHeaderEnd).toString('utf8').toLowerCase();
  const bodyBuf = httpBuf.slice(httpHeaderEnd + 4);

  if (httpHeaders(httpHeaderStr, 'content-encoding', 'gzip')) {
    try {
      const dec = await gunzipAsync(bodyBuf);
      return dec.toString('utf8');
    } catch {
      /* fall through */
    }
  }

  return bodyBuf.toString('utf8');
}

function findDoubleCrLf(buf: Buffer, start: number): number {
  for (let i = start; i < buf.length - 3; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) return i;
  }
  return -1;
}

function httpHeaders(headerBlock: string, name: string, value: string): boolean {
  return headerBlock.includes(`${name}: ${value}`);
}

function parseTs(ts: string): Date {
  return new Date(
    parseInt(ts.slice(0, 4), 10),
    parseInt(ts.slice(4, 6), 10) - 1,
    parseInt(ts.slice(6, 8), 10)
  );
}
