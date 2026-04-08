import axios from 'axios';
import { getSnapshots } from '../wayback';

jest.mock('axios');
const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

const PRODUCT_URL = 'https://kaspi.kz/shop/p/apple-iphone-15-128gb-113137790/?c=750000000';

/** Build a minimal CDX response (header row + data rows). */
function cdxResponse(timestamps: string[]) {
  return {
    data: [['timestamp', 'statuscode'], ...timestamps.map((ts) => [ts, '200'])],
  };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe('getSnapshots', () => {
  it('returns empty array for an invalid URL', async () => {
    const result = await getSnapshots('not-a-url');
    expect(result).toEqual([]);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('returns empty array when CDX returns only the header row', async () => {
    mockedGet.mockResolvedValue({ data: [['timestamp', 'statuscode']] });
    const result = await getSnapshots(PRODUCT_URL);
    expect(result).toEqual([]);
  });

  it('returns empty array when CDX throws', async () => {
    mockedGet.mockRejectedValue(new Error('network error'));
    const result = await getSnapshots(PRODUCT_URL);
    expect(result).toEqual([]);
  });

  it('parses a single snapshot and builds the archived URL', async () => {
    mockedGet.mockResolvedValue(cdxResponse(['20231005120000']));
    const result = await getSnapshots(PRODUCT_URL);

    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe('20231005120000');
    expect(result[0].archivedUrl).toContain('web.archive.org/web/20231005120000id_/');
    expect(result[0].archivedUrl).toContain('kaspi.kz');
    expect(result[0].date).toEqual(new Date(2023, 9, 5)); // month is 0-indexed
  });

  it('deduplicates multiple snapshots to one per month (keeps earliest)', async () => {
    // Two snapshots in Oct 2023 — only the earlier one should survive
    mockedGet.mockResolvedValue(
      cdxResponse(['20231005120000', '20231020080000', '20231105090000'])
    );
    const result = await getSnapshots(PRODUCT_URL);

    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe('20231005120000'); // earliest Oct
    expect(result[1].timestamp).toBe('20231105090000'); // Nov
  });

  it('merges snapshots from all four CDX patterns (no duplicates)', async () => {
    // Pattern 1 returns Oct, pattern 2 returns the same Oct + Nov, others empty
    mockedGet
      .mockResolvedValueOnce(cdxResponse(['20231005120000']))           // pattern 1
      .mockResolvedValueOnce(cdxResponse(['20231001000000', '20231105090000'])) // pattern 2
      .mockResolvedValueOnce({ data: [['timestamp', 'statuscode']] })  // pattern 3
      .mockResolvedValueOnce({ data: [['timestamp', 'statuscode']] }); // pattern 4

    const result = await getSnapshots(PRODUCT_URL);

    expect(result).toHaveLength(2); // Oct + Nov, no duplicate Oct
    // Oct: earliest is 20231001 from pattern 2
    expect(result[0].timestamp).toBe('20231001000000');
    expect(result[1].timestamp).toBe('20231105090000');
  });

  it('returns snapshots sorted chronologically', async () => {
    mockedGet.mockResolvedValue(
      cdxResponse(['20231205000000', '20230305000000', '20230805000000'])
    );
    const result = await getSnapshots(PRODUCT_URL);
    const timestamps = result.map((s) => s.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('queries CDX exactly four times (one per URL pattern)', async () => {
    mockedGet.mockResolvedValue(cdxResponse([]));
    await getSnapshots(PRODUCT_URL);
    expect(mockedGet).toHaveBeenCalledTimes(4);
  });

  it('includes the product URL in the CDX query', async () => {
    mockedGet.mockResolvedValue(cdxResponse([]));
    await getSnapshots(PRODUCT_URL);
    const calls = mockedGet.mock.calls.map(([url]) => url as string);
    expect(calls.every((u) => u.includes('web.archive.org/cdx'))).toBe(true);
    expect(calls.some((u) => u.includes('kaspi.kz'))).toBe(true);
  });
});
