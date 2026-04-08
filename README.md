# Kaspi Price Analytics

Track the full price history of any product on [kaspi.kz](https://kaspi.kz) using historical internet archives.

## Why this exists

Kaspi.kz is Kazakhstan's dominant e-commerce marketplace. Like many large platforms, it is prone to:

- **Fake discounts** — sellers inflate the listed price before a sale event (e.g. 11.11, Black Friday) so the "discount" is illusory
- **Price gouging** — prices spike during high demand or supply shortages, then quietly return to normal
- **Inflation masking** — gradual price increases that are hard to notice without a historical record

There is no official price history feature on Kaspi. This tool fills that gap by reconstructing a product's price timeline from publicly available web archive snapshots, giving you the evidence to make informed decisions and hold sellers accountable.

## How it works

When you paste a product URL, the app queries three independent web archives in parallel:

| Source | What it provides |
|--------|-----------------|
| **Wayback Machine** | The most comprehensive source — queries 4 URL patterns via the CDX API to maximise hit rate |
| **Archive.today** | An independent archive that occasionally captures Kaspi pages |
| **Common Crawl** | A public crawl dataset; retrieves raw WARC records and decompresses them on the fly |

It also fetches the **current live price** from Kaspi directly.

All snapshots are deduplicated to one per calendar month (earliest capture wins), parsed for price data using a 5-strategy cascade, and streamed back to the browser in real time via Server-Sent Events.

## Getting started

```bash
npm install
npm run dev       # starts at http://localhost:3000
```

Paste any `kaspi.kz/shop/p/...` product URL and click **Analyze**. Results stream in as each archive source responds — typically within 30–90 seconds.

## Tech stack

- **Next.js 14** (App Router) — frontend and API route in one repo
- **Server-Sent Events** — real-time progress streaming, no WebSocket needed
- **Recharts** — price history chart
- No database — all data is fetched live from public archives at query time

## Running tests

```bash
npm test
```

## Contributing

The more archive sources that work, the better the price history. If you know of a public web archive that indexes Kaspi pages, open an issue or PR.
