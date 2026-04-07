import axios from 'axios';

/**
 * Fetch the most recent Yandex-cached version of a URL.
 * Yandex heavily crawls .kz / Russian-language sites and often has
 * a more recent snapshot than Wayback for Kaspi pages.
 *
 * Returns the raw cached HTML, or null if not cached / unreachable.
 */
export async function fetchYandexCache(url: string): Promise<string | null> {
  const cacheUrl =
    `https://yandexwebcache.net/yandbtm` +
    `?fmode=inject&tm=1&base=1&lang=ru` +
    `&url=${encodeURIComponent(url)}`;

  try {
    const { data } = await axios.get<string>(cacheUrl, {
      timeout: 20_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
      responseType: 'text',
    });
    return typeof data === 'string' && data.length > 500 ? data : null;
  } catch {
    return null;
  }
}
