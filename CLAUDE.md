# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (Next.js, port 3000)
npm run build    # production build
npm run lint     # ESLint via next lint
```

No test suite exists. No single-test command.

## Commit format

All commits must follow: `FIX | Message` or `FEAT | Message`

## Architecture

Next.js 14 App Router. No database — all data comes from public web archives at query time.

### Data flow

1. User pastes a kaspi.kz product URL into `src/app/page.tsx` (client component)
2. A `fetch` opens a Server-Sent Events stream to `GET /api/prices?url=...`
3. `src/app/api/prices/route.ts` orchestrates all sources in parallel and streams `SSEEvent` objects back
4. The UI updates in real-time as each source reports in and snapshots are processed

### Archive sources (`src/lib/`)

| File | Source | Notes |
|------|--------|-------|
| `wayback.ts` | Wayback Machine CDX API | Most reliable; queries 4 URL patterns in parallel; uses `id_` mode for raw HTML |
| `commonCrawl.ts` | Common Crawl | Fetches WARC byte ranges directly; gunzips WARC+HTTP layers |
| `archiveToday.ts` | Archive.today timemap | Rarely has Kaspi pages; kept as low-cost probe |

### SSE event protocol

`route.ts` emits these event types in order:
- `source` — per-source status after the parallel fetch (`ok` / `empty` / `error`)
- `snapshots` — total snapshot count discovered
- `progress` — incremental count as snapshots are parsed (4 concurrent)
- `done` — final `PricePoint[]` array
- `error` — fatal error

`SourceId` is a string union exported from `route.ts` and imported directly by `page.tsx` — it is the shared contract between server and client.

### Price extraction cascade (`src/lib/parser.ts`)

`extractPriceData(html)` tries 5 strategies in order, returning on first success:
1. JSON-LD `offers.price`
2. `<meta property="product:price:amount">`
3. `BACKEND.components.item` — Kaspi's SSR state embedded as a JS variable (most common hit)
4. Named price fields in any `<script>` tag (`minPrice`, `unitPrice`, etc.)
5. Tenge symbol regex (`\d+ ₸`) — uses mode (most frequent value) to avoid shipping/instalment outliers

### Snapshot deduplication

Both source-level (`wayback.ts`, `archiveToday.ts`) and route-level (`mergeAllByMonth`) keep **one snapshot per calendar month** (earliest timestamp wins). Sources are prioritised in declaration order: wayback → archive.today → common-crawl.

### URL normalisation

`normalizeKaspiUrl` strips everything except the path and optional `?c=<cityCode>` before querying archives. The `ysclid` and other tracking params are dropped.
