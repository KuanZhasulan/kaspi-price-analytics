import axios from 'axios';
import { getArchiveTodaySnapshots } from '../archiveToday';

jest.mock('axios');
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const PRODUCT_URL = 'https://kaspi.kz/shop/p/apple-iphone-15-128gb-113137790/?c=750000000';

function mementoLine(domain: string, ts: string, url = PRODUCT_URL): string {
  return `<https://${domain}/${ts}/${url}>; rel="memento"; datetime="Mon, 01 Jan 2023 00:00:00 GMT"`;
}

function timemapBody(lines: string[]): string {
  return lines.join('\n');
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe('getArchiveTodaySnapshots', () => {
  it('returns [] when the network request throws', async () => {
    mockedGet.mockRejectedValue(new Error('timeout'));
    const result = await getArchiveTodaySnapshots(PRODUCT_URL);
    expect(result).toEqual([]);
  });

  it('returns [] when the response body contains no memento links', async () => {
    mockedGet.mockResolvedValue({ data: 'no links here' });
    const result = await getArchiveTodaySnapshots(PRODUCT_URL);
    expect(result).toEqual([]);
  });

  it('returns [] for an empty response body', async () => {
    mockedGet.mockResolvedValue({ data: '' });
    const result = await getArchiveTodaySnapshots(PRODUCT_URL);
    expect(result).toEqual([]);
  });

  it('parses a valid memento line correctly', async () => {
    mockedGet.mockResolvedValue({
      data: mementoLine('archive.ph', '20230401120000'),
    });
    const result = await getArchiveTodaySnapshots(PRODUCT_URL);

    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('20230401120000');
    expect(result[0].archivedUrl).toBe(`https://archive.ph/20230401120000/${PRODUCT_URL}`);
    expect(result[0].date).toEqual(new Date(2023, 3, 1)); // month is 0-indexed
  });

  it('recognises all supported archive domains', async () => {
    const domains = ['archive.ph', 'archive.today', 'archive.is', 'archive.fo', 'archive.li'];
    // Give each a unique month so none are deduplicated
    const lines = domains.map((d, i) =>
      mementoLine(d, `2023${String(i + 1).padStart(2, '0')}01000000`)
    );
    mockedGet.mockResolvedValue({ data: timemapBody(lines) });

    const result = await getArchiveTodaySnapshots(PRODUCT_URL);
    expect(result).toHaveLength(domains.length);
    // Each result's archivedUrl should start with the corresponding domain
    domains.forEach((domain, i) => {
      expect(result[i].archivedUrl).toMatch(new RegExp(`^https://${domain.replace('.', '\\.')}/`));
    });
  });

  it('deduplicates to one snapshot per month (keeps earliest timestamp)', async () => {
    const body = timemapBody([
      mementoLine('archive.ph', '20230415000000'), // later in April
      mementoLine('archive.ph', '20230401000000'), // earlier in April — should win
      mementoLine('archive.ph', '20230501000000'), // May
    ]);
    mockedGet.mockResolvedValue({ data: body });

    const result = await getArchiveTodaySnapshots(PRODUCT_URL);
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe('20230401000000'); // earliest April kept
    expect(result[0].date).toEqual(new Date(2023, 3, 1));
    expect(result[1].timestamp).toBe('20230501000000');
  });

  it('returns snapshots sorted chronologically', async () => {
    const body = timemapBody([
      mementoLine('archive.ph', '20230501000000'),
      mementoLine('archive.ph', '20230101000000'),
      mementoLine('archive.ph', '20230301000000'),
    ]);
    mockedGet.mockResolvedValue({ data: body });

    const result = await getArchiveTodaySnapshots(PRODUCT_URL);
    const timestamps = result.map((s) => s.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('ignores non-memento relation lines (timemap, first, last)', async () => {
    const body = [
      `<https://archive.ph/timemap/link/${PRODUCT_URL}>; rel="self"`,
      `<${PRODUCT_URL}>; rel="original"`,
      `<https://archive.ph/20230101000000/${PRODUCT_URL}>; rel="first memento"`,
      mementoLine('archive.ph', '20230601000000'),
      `<https://archive.ph/20230601000000/${PRODUCT_URL}>; rel="last memento"`,
    ].join('\n');
    mockedGet.mockResolvedValue({ data: body });

    const result = await getArchiveTodaySnapshots(PRODUCT_URL);
    // Only the plain rel="memento" line should be parsed
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('20230601000000');
  });

  it('queries the correct timemap URL with responseType text', async () => {
    mockedGet.mockResolvedValue({ data: '' });
    await getArchiveTodaySnapshots(PRODUCT_URL);

    const [calledUrl, config] = mockedGet.mock.calls[0] as [string, { responseType: string }];
    expect(calledUrl).toBe(`https://archive.ph/timemap/link/${PRODUCT_URL}`);
    // responseType must be 'text' — otherwise axios attempts JSON parsing and breaks the regex
    expect(config.responseType).toBe('text');
  });
});
