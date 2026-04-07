// ANSI color helpers for server-side terminal logs
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  teal:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m',
  white:  '\x1b[97m',
};

function ts() {
  return C.gray + new Date().toISOString().slice(11, 19) + C.reset;
}

export const log = {
  header(msg: string) {
    console.log(`\n${C.bold}${C.teal}▶  ${msg}${C.reset}  ${ts()}`);
  },

  info(msg: string) {
    console.log(`   ${C.blue}ℹ${C.reset}  ${msg}`);
  },

  found(total: number, url: string) {
    console.log(`   ${C.teal}◈${C.reset}  ${C.bold}${total}${C.reset} archive snapshots found`);
    console.log(`   ${C.gray}    ${url}${C.reset}`);
  },

  price(date: string, price: number, shop: string | undefined, strategy: string) {
    const priceStr = C.green + C.bold + fmtPrice(price) + C.reset;
    const shopStr  = shop ? C.gray + ` (${shop})` + C.reset : '';
    const strat    = C.gray + ` [${strategy}]` + C.reset;
    console.log(`   ${C.green}✓${C.reset}  ${C.yellow}${date}${C.reset}  →  ${priceStr}${shopStr}${strat}`);
  },

  miss(date: string) {
    console.log(`   ${C.gray}✗  ${date}  →  no price found${C.reset}`);
  },

  summary(productName: string | null, found: number, total: number, ms: number) {
    const name = productName
      ? `${C.bold}${C.white}${productName}${C.reset}`
      : C.gray + '(name unknown)' + C.reset;
    console.log(
      `\n   ${C.teal}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`
    );
    console.log(`   ${C.bold}Product :${C.reset} ${name}`);
    console.log(`   ${C.bold}Results :${C.reset} ${C.green}${found} prices${C.reset} extracted from ${total} snapshots`);
    console.log(`   ${C.bold}Duration:${C.reset} ${(ms / 1000).toFixed(1)}s`);
    console.log(`   ${C.teal}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`);
  },
};

function fmtPrice(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₸';
}
