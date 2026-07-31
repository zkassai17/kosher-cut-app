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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Standard My Cloud Grocer department IDs (G&E / Seasons share this scheme).
// Seed these so aisles the homepage mega-menu hides (only load on hover) still
// get crawled — Seasons was missing frozen/cereal/snacks without them.
const STD_DEPTS = [10387, 10395, 10705, 10438, 10364, 10379, 10612, 10450, 10384, 10432, 10397, 10526, 10555];

const HB_STORES = [
  { id: 'ge', name: 'Grand & Essex', origin: 'https://shop.grandandessex.com', region: 'New-Jersey' },
  { id: 'superstop', name: 'SuperStop', origin: 'https://superstopnj.com', region: 'Lakewood' },
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
      out[store.id] = crawled.length >= existing.length * 0.5 ? crawled : existing;
      if (out[store.id] === existing) console.log(`    ! ${store.id}: crawl thin (${crawled.length}) — kept existing ${existing.length}`);
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
      // Keep the last-good data if a crawl comes back empty/tiny (CI block/error)
      // so a bad run never wipes a store from the feed.
      out[store.id] = crawled.length >= existing.length * 0.5 ? crawled : existing;
      if (out[store.id] === existing) console.log(`    ! ${store.id}: crawl thin (${crawled.length}) — kept existing ${existing.length}`);
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

  // Emit the app feed: { updatedAt, catalog } at the repo root (data.json).
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const feedPath = join(__dirname, '..', 'data.json');
  writeFileSync(feedPath, JSON.stringify({ updatedAt: stamp, catalog: out }));

  const total = Object.entries(out).map(([k, a]) => `${k}:${a.length}`).join('  ');
  console.log(`\nWrote ${path}\n  ${total}\n  feed -> ${feedPath} (updatedAt ${stamp})`);
}

console.log('Crawling full store catalogs (headless hb + shopify)...');
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
