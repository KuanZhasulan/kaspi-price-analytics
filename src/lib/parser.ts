import * as cheerio from 'cheerio';

export interface ParsedData {
  price: number;
  shop?: string;
  strategy: string;
}

/**
 * Extract product name from a Kaspi page HTML.
 * Tries JSON-LD, og:title, <title>, then <h1>.
 */
export function extractProductName(html: string): string | null {
  // 1. JSON-LD name field
  const jldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jldRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const name = findNameInJsonLd(data);
      if (name) return name;
    } catch {}
  }

  // 2. og:title
  const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) return clean(ogMatch[1]);

  // 3. <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return clean(titleMatch[1]);

  // 4. first <h1>
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match?.[1]) return clean(h1Match[1]);

  return null;
}

function findNameInJsonLd(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  // Skip Organization nodes — we want Product name, not site name
  if (o['@type'] === 'Organization' || o['@type'] === 'WebSite') return null;
  if (o['@type'] === 'Product' && typeof o.name === 'string' && o.name.length > 3) return o.name as string;
  for (const val of Object.values(o)) {
    const found = findNameInJsonLd(val);
    if (found) return found;
  }
  // Fallback: any name field in a non-Organization context
  if (typeof o.name === 'string' && o.name.length > 3 && !o.name.toLowerCase().includes('kaspi')) {
    return o.name as string;
  }
  return null;
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/ [-|–] [Kk]aspi.*$/i, '').trim();
}

/**
 * Extract price (and optionally shop name) from a Kaspi product page HTML.
 * Tries multiple strategies in order of reliability.
 */
export function extractPriceData(html: string): ParsedData | null {
  return (
    fromJsonLd(html) ??
    fromMetaTags(html) ??
    fromBackendState(html) ??
    fromScriptPriceFields(html) ??
    fromHtmlElements(html) ??
    fromFormattedTenge(html) ??
    null
  );
}

export function extractProductNameFromHtml(html: string): string | null {
  return extractProductName(html);
}

// ─── Strategy 1: JSON-LD structured data ────────────────────────────────────

function fromJsonLd(html: string): ParsedData | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const result = searchJsonLdForOffers(data);
      if (result) return { ...result, strategy: 'json-ld' };
    } catch {}
  }
  return null;
}

function searchJsonLdForOffers(obj: unknown): ParsedData | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  if (o.offers) {
    const offerList = Array.isArray(o.offers) ? o.offers : [o.offers];
    for (const offer of offerList as Record<string, unknown>[]) {
      const rawPrice = offer.price ?? offer.lowPrice;
      if (rawPrice != null) {
        const price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
        if (isValid(price)) {
          return {
            price,
            strategy: 'json-ld',
            shop: typeof offer.seller === 'object' && offer.seller !== null
              ? String((offer.seller as Record<string, unknown>).name ?? '')
              : undefined,
          };
        }
      }
    }
  }

  for (const val of Object.values(o)) {
    const found = searchJsonLdForOffers(val);
    if (found) return found;
  }
  return null;
}

// ─── Strategy 2: Meta tags ───────────────────────────────────────────────────

function fromMetaTags(html: string): ParsedData | null {
  const $ = cheerio.load(html);
  const content =
    $('meta[property="product:price:amount"]').attr('content') ??
    $('meta[property="og:price:amount"]').attr('content') ??
    $('meta[name="price"]').attr('content');

  if (content) {
    const price = parseFloat(content.replace(/[^0-9.]/g, ''));
    if (isValid(price)) return { price, strategy: 'meta' };
  }
  return null;
}

// ─── Strategy 2.5: Kaspi BACKEND.components.item state ──────────────────────
// Kaspi SSR embeds product data as BACKEND.components.item = {...}
// The script contains literal < chars (e.g. in descriptions) so the generic
// [^<] script regex misses it — handle it with a targeted extraction.

function fromBackendState(html: string): ParsedData | null {
  const m = html.match(/"price"\s*:\s*(\d{4,9})\s*[,}]/);
  if (!m) return null;
  const price = parseInt(m[1], 10);
  if (!isValid(price)) return null;
  return { price, strategy: 'backend-state' };
}

// ─── Strategy 3: price fields in <script> tags (covers Nuxt SSR / __NUXT__) ─

function fromScriptPriceFields(html: string): ParsedData | null {
  const scriptRe = /<script(?:\s[^>]*)?>([^<]{200,})<\/script>/gi;
  let m: RegExpExecArray | null;

  while ((m = scriptRe.exec(html)) !== null) {
    const content = m[1];
    if (!/price/i.test(content)) continue;

    const prices: number[] = [];

    // Match any price-related JSON field
    const fieldRe = /"(?:min[Pp]rice|[Uu]nit[Pp]rice|[Pp]rice|selling[Pp]rice|current[Pp]rice|offer[Pp]rice|kaspi[Pp]rice|base[Pp]rice|total[Pp]rice|lowest[Pp]rice|final[Pp]rice)"\s*:\s*(\d{4,9})/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(content)) !== null) {
      const p = parseInt(fm[1], 10);
      if (isValid(p)) prices.push(p);
    }

    if (prices.length > 0) {
      return { price: Math.min(...prices), strategy: 'script-json' };
    }
  }
  return null;
}

// ─── Strategy 4: HTML elements ───────────────────────────────────────────────

const PRICE_SELECTORS = [
  '.item__price-once',
  '.price__value',
  '.product-price__value',
  '[data-price]',
  '.offer-price',
  '.price-cell',
];

const SHOP_SELECTORS = [
  '.item__merchant-link',
  '.merchant-name',
  '.offer__merchant',
  '[data-merchant]',
];

function fromHtmlElements(html: string): ParsedData | null {
  const $ = cheerio.load(html);

  for (const sel of PRICE_SELECTORS) {
    const el = $(sel).first();
    if (!el.length) continue;

    // Check data-price attribute first
    const attr = el.attr('data-price');
    if (attr) {
      const p = parseFloat(attr.replace(/[^0-9.]/g, ''));
      if (isValid(p)) return { price: p, shop: findShop($), strategy: 'html-attr' };
    }

    // Fall back to text content
    const text = el.text().replace(/[^0-9]/g, '');
    if (text.length >= 4) {
      const p = parseInt(text, 10);
      if (isValid(p)) return { price: p, shop: findShop($), strategy: 'html-text' };
    }
  }
  return null;
}

// ─── Strategy 5: formatted tenge amounts in raw HTML ─────────────────────────
// Matches "89 990 ₸" or "1 234 567₸" or "89990₸" anywhere in the HTML

function fromFormattedTenge(html: string): ParsedData | null {
  // Match digits (with optional space-thousands-separators) immediately before ₸
  const re = /(\d[\d\u00a0 ]{2,10}\d)\s*₸/g;
  const prices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const p = parseInt(m[1].replace(/[\s\u00a0]/g, ''), 10);
    if (isValid(p)) prices.push(p);
  }
  if (prices.length === 0) return null;
  // Return the most common value (mode) — avoids outliers from shipping etc.
  const freq = new Map<number, number>();
  for (const p of prices) freq.set(p, (freq.get(p) ?? 0) + 1);
  const best = Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0][0];
  return { price: best, strategy: 'tenge-symbol' };
}

function findShop($: cheerio.CheerioAPI): string | undefined {
  for (const sel of SHOP_SELECTORS) {
    const text = $(sel).first().text().trim();
    if (text) return text;
  }
  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reasonable KZT price range: 1 000 – 100 000 000 tenge */
function isValid(price: number): boolean {
  return Number.isFinite(price) && price >= 1_000 && price <= 100_000_000;
}
