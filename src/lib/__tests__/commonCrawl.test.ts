import axios from 'axios';
import { gzipSync } from 'zlib';
import { getCommonCrawlSnapshots, fetchCCPage, CCSnapshot } from '../commonCrawl';

jest.mock('axios');
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const PRODUCT_URL = 'https://kaspi.kz/shop/p/apple-iphone-15-128gb-113137790/?c=750000000';

const COLLINFO = [{ id: 'CC-MAIN-2023-40' }, { id: 'CC-MAIN-2023-14' }];

function ndjson(records: object[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n');
}

function makeWarcBuffer(body: string, contentEncoding?: 'gzip'): Buffer {
  const bodyBuf =
    contentEncoding === 'gzip' ? gzipSync(Buffer.from(body)) : Buffer.from(body);

  const httpHeaderLines = [
    'HTTP/1.1 200 OK',
    'Content-Type: text/html',
    ...(contentEncoding ? [`Content-Encoding: ${contentEncoding}`] : []),
  ];

  const httpSection = Buffer.concat([
    Buffer.from(httpHeaderLines.join('\r\n')),
    Buffer.from('\r\n\r\n'),
    bodyBuf,
  ]);

  const warcSection = Buffer.concat([
    Buffer.from('WARC/1.0\r\nContent-Type: application/http'),
    Buffer.from('\r\n\r\n'),
    httpSection,
  ]);

  return gzipSync(warcSection);
}

beforeEach(() => {
  mockedGet.mockReset();
});

// ---------------------------------------------------------------------------
// getCommonCrawlSnapshots
// ---------------------------------------------------------------------------

describe('getCommonCrawlSnapshots', () => {
  it('returns [] when collinfo fetch fails', async () => {
    mockedGet.mockRejectedValue(new Error('network'));
    const result = await getCommonCrawlSnapshots(PRODUCT_URL);
    expect(result).toEqual([]);
  });

  it('returns [] when collinfo returns an empty array', async () => {
    mockedGet.mockResolvedValue({ data: [] });
    const result = await getCommonCrawlSnapshots(PRODUCT_URL);
    expect(result).toEqual([]);
  });

  it('returns [] when all index queries return empty NDJSON', async () => {
    mockedGet
      .mockResolvedValueOnce({ data: COLLINFO })
      .mockResolvedValue({ data: '' });
    const result = await getCommonCrawlSnapshots(PRODUCT_URL, 2);
    expect(result).toEqual([]);
  });

  it('parses a valid CDX record correctly', async () => {
    const rec = {
      timestamp: '20230401120000',
      filename: 'crawl-data/foo.warc.gz',
      offset: '100',
      length: '500',
    };
    mockedGet
      .mockResolvedValueOnce({ data: [{ id: 'CC-MAIN-2023-40' }] })
      .mockResolvedValueOnce({ data: ndjson([rec]) });

    const result = await getCommonCrawlSnapshots(PRODUCT_URL, 1);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('20230401120000');
    expect(result[0].filename).toBe('crawl-data/foo.warc.gz');
    expect(result[0].offset).toBe(100);
    expect(result[0].length).toBe(500);
    expect(result[0].date).toEqual(new Date(2023, 3, 1)); // month is 0-indexed
  });

  it('deduplicates multiple snapshots in the same month to exactly one', async () => {
    const recs = [
      { timestamp: '20230401000000', filename: 'a.warc.gz', offset: '1', length: '10' }, // first April seen
      { timestamp: '20230415000000', filename: 'b.warc.gz', offset: '2', length: '20' }, // second April — dropped
      { timestamp: '20230501000000', filename: 'c.warc.gz', offset: '3', length: '30' },
    ];
    mockedGet
      .mockResolvedValueOnce({ data: [{ id: 'CC-MAIN-2023-40' }] })
      .mockResolvedValueOnce({ data: ndjson(recs) });

    const result = await getCommonCrawlSnapshots(PRODUCT_URL, 1);
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe('20230401000000'); // first-seen April kept
    expect(result[1].timestamp).toBe('20230501000000');
  });

  it('returns snapshots sorted chronologically', async () => {
    const recs = [
      { timestamp: '20230501000000', filename: 'c.warc.gz', offset: '3', length: '30' },
      { timestamp: '20230101000000', filename: 'a.warc.gz', offset: '1', length: '10' },
      { timestamp: '20230301000000', filename: 'b.warc.gz', offset: '2', length: '20' },
    ];
    mockedGet
      .mockResolvedValueOnce({ data: [{ id: 'CC-MAIN-2023-40' }] })
      .mockResolvedValueOnce({ data: ndjson(recs) });

    const result = await getCommonCrawlSnapshots(PRODUCT_URL, 1);
    const timestamps = result.map((s) => s.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('skips malformed NDJSON lines without throwing', async () => {
    const raw =
      'not-json\n' +
      '{"timestamp":"20230601000000","filename":"x.warc.gz","offset":"1","length":"10"}\n' +
      'bad{json}';
    mockedGet
      .mockResolvedValueOnce({ data: [{ id: 'CC-MAIN-2023-40' }] })
      .mockResolvedValueOnce({ data: raw });

    const result = await getCommonCrawlSnapshots(PRODUCT_URL, 1);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('20230601000000');
  });

  it('handles a failed index query gracefully (other indexes still return results)', async () => {
    const rec = { timestamp: '20230701000000', filename: 'x.warc.gz', offset: '1', length: '10' };
    mockedGet
      .mockResolvedValueOnce({ data: COLLINFO })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: ndjson([rec]) });

    const result = await getCommonCrawlSnapshots(PRODUCT_URL, 2);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('20230701000000');
  });

  it('queries one CDX index per crawl id (plus one collinfo call)', async () => {
    mockedGet
      .mockResolvedValueOnce({ data: COLLINFO })
      .mockResolvedValue({ data: '' });

    await getCommonCrawlSnapshots(PRODUCT_URL, 2);
    // 1 collinfo + 2 index queries
    expect(mockedGet).toHaveBeenCalledTimes(3);
  });

  it('respects maxIndexes and does not fetch more than requested', async () => {
    mockedGet
      .mockResolvedValueOnce({ data: COLLINFO }) // returns 2 ids
      .mockResolvedValue({ data: '' });

    await getCommonCrawlSnapshots(PRODUCT_URL, 1);
    // collinfo returns 2 but maxIndexes=1 → only 1 index query
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('includes the product hostname in CDX query URLs', async () => {
    mockedGet
      .mockResolvedValueOnce({ data: [{ id: 'CC-MAIN-2023-40' }] })
      .mockResolvedValue({ data: '' });

    await getCommonCrawlSnapshots(PRODUCT_URL, 1);
    const calls = mockedGet.mock.calls.map(([url]) => url as string);
    const indexCalls = calls.filter((u) => u.includes('commoncrawl.org') && u.includes('-index'));
    expect(indexCalls.length).toBe(1);
    expect(indexCalls[0]).toContain('kaspi.kz');
  });
});

// ---------------------------------------------------------------------------
// fetchCCPage
// ---------------------------------------------------------------------------

describe('fetchCCPage', () => {
  const baseSnap: CCSnapshot = {
    timestamp: '20230401120000',
    date: new Date(2023, 3, 1),
    filename: 'crawl-data/foo.warc.gz',
    offset: 0,
    length: 1000,
  };

  it('returns null for records larger than 3 MB without fetching', async () => {
    const result = await fetchCCPage({ ...baseSnap, length: 3_000_001 });
    expect(result).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('returns null when the network fetch throws', async () => {
    mockedGet.mockRejectedValue(new Error('timeout'));
    const result = await fetchCCPage(baseSnap);
    expect(result).toBeNull();
  });

  it('extracts the HTML body from a valid WARC record', async () => {
    const html = '<html><body>hello kaspi</body></html>';
    const warcBuf = makeWarcBuffer(html);
    mockedGet.mockResolvedValue({ data: warcBuf });

    const result = await fetchCCPage(baseSnap);
    expect(result).toContain('hello kaspi');
  });

  it('decompresses a gzip-encoded HTTP body inside the WARC', async () => {
    const html = '<html><body>gzipped content</body></html>';
    const warcBuf = makeWarcBuffer(html, 'gzip');
    mockedGet.mockResolvedValue({ data: warcBuf });

    const result = await fetchCCPage(baseSnap);
    expect(result).toContain('gzipped content');
  });

  it('sends a byte-range header matching the snapshot offset and length', async () => {
    const snap = { ...baseSnap, offset: 1024, length: 2048 };
    const warcBuf = makeWarcBuffer('<html/>');
    mockedGet.mockResolvedValue({ data: warcBuf });

    await fetchCCPage(snap);
    const [, config] = mockedGet.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(config.headers['Range']).toBe(`bytes=1024-${1024 + 2048 - 1}`);
  });
});
