// Full-catalog crawler — pulls EVERY product (name + price) from each store, not
// just the curated cuts. Output: catalog.json = { storeId: [{ n, p, lb }] }.
//
// This powers "search any product" (e.g. "Salad Mate dressing") → cheapest store.
//
//   cd scraper && node catalog.mjs
//
// Handles two platforms headless:
//   • hb (My Cloud Grocer): auto-discovers departments from the store nav, then
//     recursively walks every subcategory, reading the product list the SPA
//     fetches (a blind API call returns nothing — must read the response).
//   • shopify (KMP): /products.json paginated.
// Mercatus stores (Glatt, Gourmet Glatt) Cloudflare-block headless — those are
// pulled via the in-app browser (catalog-mercatus.mjs) and merged in.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from './canonicalize.mjs';
import { cedarWeeklyAd } from './cedar.mjs';
import { computeCurated } from './curated.mjs';
import { computeBrands } from './brands.mjs';

// Which stores each area compares — mirrors AREAS/KSTORES in stores.ts.
const AREA_STORES = {
  teaneck: ['ge', 'gl'],
  fivetowns: ['gourmetglatt', 'seasons_law'],
  manhattan: ['six60one', 'kmp'],
  lakewood: ['superstop', 'nutmeg'],
};

const __dirname = dirname(fileURLToPath(import.meta.url));

// Standard My Cloud Grocer department IDs (G&E / Seasons share this scheme).
// Seed these so aisles the homepage mega-menu hides (only load on hover) still
// get crawled — Seasons was missing frozen/cereal/snacks without them.
const STD_DEPTS = [10387, 10395, 10705, 10438, 10364, 10379, 10612, 10450, 10384, 10432, 10397, 10526, 10555];

const HB_STORES = [
  { id: 'ge', name: 'Grand & Essex', origin: 'https://shop.grandandessex.com', region: 'New-Jersey' },
  { id: 'superstop', name: 'SuperStop', origin: 'https://superstopnj.com', region: 'Lakewood' },
  { id: 'nutmeg', name: 'Nutmeg Kosher', origin: 'https://nutmegkoshermarket.com', region: 'Lakewood-NJ' },
  { id: 'seasons_law', name: 'Seasons (Lawrence)', origin: 'https://seasonskosher.com', region: 'Lawrence', seedDepts: STD_DEPTS },
  { id: 'six60one', name: '661', origin: 'https://six60one.com', region: 'New-York-City' },
];

const SHOPIFY_STORES = [{ id: 'kmp', name: 'The Kosher Marketplace', origin: 'https://thekmp.com' }];

// Departments we skip (prepared food / non-grocery — not price comparisons).
const SKIP_DEPT = /donation|takeout|catering|sushi|pizza|floral|flower|gift-?card|holiday-?special|platter|media/i;
const MAX_CATEGORIES = 1200;

// Optional CLI filter: `node catalog.mjs seasons_law` re-crawls just that store
// (merged into the existing catalog.json, other stores untouched).
const ONLY = process.argv[2] || null;

async function discoverDepartments(page, store) {
  await page.goto(`${store.origin}/${store.region}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3200);
  const cats = await page.evaluate(() => {
    const out = new Map();
    for (const a of document.querySelectorAll('a[href*="/category/"]')) {
      const m = (a.getAttribute('href') || '').match(/\/category\/(\d+)(?:\/([^/?#]+))?/);
      if (m && !out.has(m[1])) out.set(m[1], { id: +m[1], slug: m[2] || '' });
    }
    return Array.from(out.values());
  });
  const discovered = cats.filter((c) => !SKIP_DEPT.test(c.slug)).map((c) => c.id);
  // Union with any seeded department IDs (for sites that hide aisles from the nav).
  return Array.from(new Set([...discovered, ...(store.seedDepts || [])]));
}

async function visitCategory(page, store, catId) {
  const products = [];
  let subs = [];
  const handler = async (resp) => {
    if (!resp.url().includes('JsonProductsList')) return;
    try {
      const j = await resp.json();
      if (j.subCategories && j.subCategories.length && !subs.length) {
        subs = j.subCategories.map((s) => s.Id).filter(Boolean);
      }
      for (const p of JSON.parse(j.productsJson || '[]')) if (p && p.N) products.push({ n: p.N, p: p.P_v, lb: !!p.iW });
    } catch {}
  };
  page.on('response', handler);
  await page.goto(`${store.origin}/${store.region}/category/${catId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  page.off('response', handler);
  return { products, subs };
}

async function crawlHb(page, store) {
  const departments = await discoverDepartments(page, store);
  if (!departments.length) {
    console.log(`  ! ${store.id}: no departments discovered`);
    return [];
  }
  const seen = new Set();
  const queue = [...departments];
  const products = new Map();
  let visited = 0;
  while (queue.length && visited < MAX_CATEGORIES) {
    const catId = queue.shift();
    if (seen.has(catId)) continue;
    seen.add(catId);
    visited++;
    let res;
    try {
      res = await visitCategory(page, store, catId);
    } catch {
      continue;
    }
    for (const pr of res.products) {
      if (pr.p == null) continue;
      const key = pr.n.trim().toLowerCase();
      const prev = products.get(key);
      if (!prev || pr.p < prev.p) products.set(key, { n: pr.n.trim(), p: pr.p, lb: pr.lb });
    }
    for (const sub of res.subs) if (!seen.has(sub)) queue.push(sub);
    if (visited % 15 === 0) console.log(`    · ${store.id}: ${visited} cats, ${products.size} products`);
  }
  console.log(`  ✓ ${store.name}: ${visited} categories -> ${products.size} products`);
  return Array.from(products.values());
}

async function crawlShopify(page, store) {
  await page.goto(store.origin + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const items = await page.evaluate(async (origin) => {
    const out = [];
    for (let pg = 1; pg <= 20; pg++) {
      const r = await fetch(`${origin}/products.json?limit=250&page=${pg}`, { headers: { accept: 'application/json' } });
      if (!r.ok) break;
      const j = await r.json();
      const prods = j.products || [];
      if (!prods.length) break;
      for (const p of prods) {
        for (const v of p.variants || []) {
          const size = v.title && v.title !== 'Default Title' ? ` ${v.title}` : '';
          out.push({ n: (p.title + size).trim(), p: parseFloat(v.price) || 0, lb: false });
        }
      }
    }
    return out;
  }, store.origin);
  // dedupe by name, keep cheapest
  const map = new Map();
  for (const it of items) {
    if (!it.p) continue;
    const k = it.n.toLowerCase();
    const prev = map.get(k);
    if (!prev || it.p < prev.p) map.set(k, it);
  }
  console.log(`  ✓ ${store.name}: ${map.size} products (shopify)`);
  return Array.from(map.values());
}

// Compact "last seen" stamp: whole days since epoch. Kept per product so we can
// age out only genuinely-delisted items, never items missing from one bad crawl.
const TODAY = Math.floor(Date.now() / 86_400_000);
const MAX_AGE = 30; // keep an unseen item for 30 days before dropping it

const keyOf = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Strip editorial junk stores leave inside product names — most commonly a trailing
// "- please change" note their catalog staff never removed. Cleaned at crawl time so
// the feed itself is tidy; the app also scrubs it defensively at display.
const cleanName = (n) => {
  const out = String(n).replace(/\s*[-–—]?\s*please\s+change\b\.?\s*$/i, '').trim();
  return out || String(n).trim();
};

// Durable per-store merge — the rule that keeps the feed complete every day:
//   • a GOOD crawl updates price/lb for what it saw and stamps last-seen = today;
//   • items the crawl DIDN'T see are kept (with their last-known price) until they
//     go unseen for MAX_AGE days, then age out — so a real delist clears eventually
//     but one thin crawl never wipes coverage (this is what dropped Seasons before);
//   • an EMPTY crawl (site blocked/errored) is treated as "no information": keep
//     everything untouched and age nothing.
// Net effect: coverage only grows or holds day-to-day; it can't collapse on a bad run.
function mergeStore(existing, crawled) {
  if (!crawled.length) return existing; // blocked/failed → keep last-good as-is
  const out = new Map();
  for (const it of crawled) {
    const n = cleanName(it.n);
    out.set(keyOf(n), { n, p: it.p, lb: it.lb, d: TODAY });
  }
  for (const it of existing) {
    const k = keyOf(it.n);
    if (out.has(k)) continue; // fresh crawl already has it
    const seen = typeof it.d === 'number' ? it.d : TODAY; // grandfather legacy items
    if (TODAY - seen <= MAX_AGE) out.set(k, { ...it, d: seen });
  }
  return Array.from(out.values());
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  // Start from any Mercatus data already pulled via the browser, so we merge not clobber.
  const path = join(__dirname, 'catalog.json');
  const out = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};

  for (const store of HB_STORES) {
    if (ONLY && store.id !== ONLY) continue;
    const existing = out[store.id] || [];
    try {
      const crawled = await crawlHb(page, store);
      out[store.id] = mergeStore(existing, crawled);
      console.log(`    ${store.id}: crawled ${crawled.length}, total after merge ${out[store.id].length}`);
    } catch (e) {
      console.error(`${store.id} failed:`, String(e).slice(0, 160));
      out[store.id] = existing;
    }
    writeFileSync(path, JSON.stringify(out)); // checkpoint after each store
  }
  for (const store of SHOPIFY_STORES) {
    if (ONLY && store.id !== ONLY) continue;
    const existing = out[store.id] || [];
    try {
      const crawled = await crawlShopify(page, store);
      // Union-merge (see mergeStore): a thin/empty crawl never wipes coverage.
      out[store.id] = mergeStore(existing, crawled);
      console.log(`    ${store.id}: crawled ${crawled.length}, total after merge ${out[store.id].length}`);
    } catch (e) {
      console.error(`${store.id} failed:`, String(e).slice(0, 160));
      out[store.id] = existing;
    }
    writeFileSync(path, JSON.stringify(out));
  }

  await browser.close();

  // Merge in the Cloudflare stores (Glatt, Gourmet Glatt) from their committed
  // file — headless CI usually can't reach them, so we keep the last good pull
  // rather than dropping them from the feed. (Refresh that file periodically from
  // a residential IP / the in-app browser.)
  const mercPath = join(__dirname, 'catalog-mercatus.json');
  if (existsSync(mercPath)) {
    try {
      const merc = JSON.parse(readFileSync(mercPath, 'utf8'));
      for (const [k, v] of Object.entries(merc)) if (Array.isArray(v) && v.length) out[k] = v;
    } catch {}
  }
  writeFileSync(path, JSON.stringify(out));

  // Tag every product with a canonical identity key `c` (LLM, cached) so the app
  // can match the same product across stores despite different names. Non-fatal:
  // on any failure the catalog is returned unchanged and the app falls back to
  // its regex matcher.
  try {
    await canonicalize(out);
  } catch (e) {
    console.error('canonicalize skipped:', String(e).slice(0, 160));
  }
  writeFileSync(path, JSON.stringify(out));

  // Cedar publishes only a weekly circular (no online store). Read it so the app's
  // "This week's ad" date/link auto-update weekly. Non-fatal (keeps last-good).
  let weeklyAds;
  try {
    const cedarAd = await cedarWeeklyAd();
    if (cedarAd && cedarAd.effective) weeklyAds = { cedar: cedarAd };
  } catch (e) {
    console.error('cedar weekly ad skipped:', String(e).slice(0, 160));
  }

  // Emit the app feed: { updatedAt, catalog, weeklyAds, curated } at the repo root.
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const feedPath = join(__dirname, '..', 'data.json');
  const curated = computeCurated(out); // verified category prices → keeps the tabs fresh daily
  const brands = computeBrands(out, AREA_STORES); // per-area brand comparison for the drill-down
  writeFileSync(feedPath, JSON.stringify({ updatedAt: stamp, catalog: out, curated, brands, ...(weeklyAds ? { weeklyAds } : {}) }));
  // Compact overlay bundled into the app as the offline floor (no catalog → ~50KB).
  writeFileSync(join(__dirname, '..', 'feed-overlay.json'), JSON.stringify({ updatedAt: stamp, curated, brands }));

  // Also refresh the bundled snapshot the app imports (offline / first-render
  // fallback) so it carries the same products + AI keys as the feed.
  writeFileSync(join(__dirname, '..', 'catalog.json'), JSON.stringify(out));

  const total = Object.entries(out).map(([k, a]) => `${k}:${a.length}`).join('  ');
  console.log(`\nWrote ${path}\n  ${total}\n  feed -> ${feedPath} (updatedAt ${stamp})`);
}

console.log('Crawling full store catalogs (headless hb + shopify)...');
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
