// Kosher Cut price scraper.
//
// Why Playwright and not fetch/curl: these stores sit behind Cloudflare and only
// serve their price APIs to a real browser session. Playwright drives a real
// Chromium, so the same-origin fetch inside page.evaluate() sails through.
//
// Architecture: each store has a platform adapter that returns a flat list of
// { name, price, perLb } for chicken and for beef. normalize() then maps each
// store's raw products onto a shared canonical cut list. Output: prices.json.
//
// Run:  cd scraper && npm run scrape
//
// Platforms handled:
//   'hb'       - nopCommerce-style SPA (Grand & Essex, SuperStop, Seasons).
//                Category context is server-set on navigation; we capture the
//                JsonProductsList response instead of calling the API blind.
//   'mercatus' - clean /v2/retailers/{r}/branches/{b}/categories/{c}/products.
//                Some tenants inline regularPrice (Glatt Express); others gate
//                price behind a delivery-type selection (Gourmet Glatt) -> those
//                come back price-less and are reported as needing a follow-up.
//   'shopify'  - /collections/{handle}/products.json (variants carry price).

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------------- store configs ---------------- */

const STORES = [
  {
    id: 'ge',
    name: 'Grand & Essex',
    platform: 'hb',
    origin: 'https://shop.grandandessex.com',
    region: 'New-Jersey',
    categoryUrls: {
      chicken: '/New-Jersey/category/10734',
      beef: '/New-Jersey/category/10647',
    },
    // parent category pages we auto-expand into subcategories:
    groups: {
      dairy: '/New-Jersey/category/10438',
      produce: '/New-Jersey/category/10364',
      deli: '/New-Jersey/category/10612',
    },
  },
  {
    id: 'gl',
    name: 'Glatt Express',
    platform: 'mercatus',
    origin: 'https://www.glattexpressonline.com',
    retailer: 1200,
    branch: 1404,
    categories: { chicken: 78256, beef: 78259 },
    seedUrl: '/categories/78256/products',
  },
  {
    id: 'superstop',
    name: 'SuperStop',
    platform: 'hb',
    origin: 'https://superstopnj.com',
    region: 'Lakewood',
    categoryUrls: {
      chicken: '/Lakewood/category/893/chicken',
      beef: '/Lakewood/category/894/beef',
    },
    groups: {
      dairy: '/Lakewood/category/438',
      produce: '/Lakewood/category/364',
      deli: '/Lakewood/category/612',
    },
  },
  {
    id: 'seasons_law',
    name: 'Seasons (Lawrence)',
    platform: 'hb',
    origin: 'https://seasonskosher.com',
    region: 'Lawrence',
    categoryUrls: {
      chicken: '/Lawrence/category/10648',
      beef: '/Lawrence/category/10647',
    },
    groups: { dairy: '/Lawrence/category/10438' },
  },
  {
    id: 'six60one',
    name: '661 (New York City)',
    platform: 'hb',
    origin: 'https://six60one.com',
    region: 'New-York-City',
    categoryUrls: {
      chicken: '/New-York-City/category/14103',
      beef: '/New-York-City/category/14104',
    },
    groups: { dairy: '/New-York-City/category/11438' },
  },
  {
    id: 'gourmetglatt',
    name: 'Gourmet Glatt (Cedarhurst)',
    platform: 'mercatus',
    origin: 'https://www.gourmetglattonline.com',
    retailer: 1058,
    branch: 87,
    categories: { chicken: 123995, beef: 123996 },
    // Gourmet Glatt's product list omits price until a delivery type is chosen.
    categoryNames: {
      chicken: ['Chicken', 'Showcase', 'PRIVATE 1', 'Chap A Nosh Deli'],
      beef: ['Beef', 'Showcase', 'PRIVATE 1'],
    },
    seedUrl: '/categories/123995/products',
  },
  {
    id: 'kmp',
    name: 'The Kosher Marketplace',
    platform: 'shopify',
    origin: 'https://thekmp.com',
    collections: { chicken: 'poultry', beef: 'beef' },
  },
];

/* ---------------- canonical cuts + matchers ---------------- */

const CANON = {
  chicken: [
    ['whole_chicken', 'Whole chicken', /(whole|broiler)/i, /cut in|nugget|breaded|ground|roasted/i],
    ['cut_in_8', 'Chicken, cut in 8', /cut in 8|cut-in-8|eighths|1\/8/i],
    ['drumsticks', 'Drumsticks', /drumstick|chicken drums?\b|\bdrums\b/i],
    ['legs', 'Chicken legs', /chicken legs?\b/i, /skinless|garlic|marinat/i],
    ['thighs', 'Chicken thighs', /thigh/i, /boneless|pargi/i],
    ['cutlets', 'Chicken cutlets', /cutlets?\b/i, /thin|dark|breaded|nugget/i],
    ['thin_cutlets', 'Thin cutlets', /thin.*cutlet/i],
    ['pargiyot', 'Baby chicken (pargiyot)', /pargi|baby chicken|boneless.*thigh/i],
    ['wings', 'Wings', /\bwings?\b/i, /breaded|party/i],
    ['ground_chicken', 'Ground chicken', /ground chicken/i],
  ],
  beef: [
    ['ground_beef', 'Ground beef', /(ground beef|chopped meat|ground lean)/i, /patties|burger|slider|extra lean/i],
    ['extra_lean', 'Extra lean ground', /extra lean/i],
    ['patties', 'Beef patties', /patties/i],
    ['sliders', 'Sliders / mini burgers', /slider|mini burger/i],
    ['stew', 'Beef stew (cholent)', /stew|ch[ou]lent/i],
    ['london_broil', 'Minute steak / London broil', /london broil|minute (steak|roast|fillet)/i],
    ['rib_steak', 'Rib steak', /rib steak/i, /club|boneless/i],
    ['flanken', 'Flanken', /flanken/i, /boneless|ends/i],
    ['brisket', 'Brisket', /brisket/i],
  ],
  dairy: [
    ['eggs', 'Eggs', /large eggs|eggs.*12|dozen/i, /liquid|white|beater|18|jumbo|substitut|roll|wrap|nog|scotch/i],
    ['milk', 'Milk', /milk/i, /almond|oat|coconut|soy|cashew|choc|alternativ|shake|condensed|powder|buttermilk|coffee/i],
    ['butter', 'Butter', /butter/i, /peanut|almond|spread|margarine|buttery|cocoa|apple|body|cookie/i],
    ['cream_cheese', 'Cream cheese', /cream cheese/i, /dip|whip.*spread/i],
    ['cottage_cheese', 'Cottage cheese', /cottage cheese/i, null],
    ['american_cheese', 'American cheese', /american.*(cheese|single)|american slice/i, /dip/i],
    ['shredded_cheese', 'Shredded cheese', /shredded/i, /coconut|hash|potato|lettuce/i],
    ['sourcream', 'Sour cream', /sour cream/i, /free|ice cream|dip|onion/i],
    ['yogurt', 'Yogurt', /yogurt/i, /drink|smoothie|bar|dip|covered/i],
  ],
  produce: [
    ['bananas', 'Bananas', /banana/i, /chip|bread|dried|split/i],
    ['apples', 'Gala apples', /apple/i, /sauce|juice|pineapple|cider|chip|dried|candy|caramel/i],
    ['potatoes', 'Idaho potatoes', /potato/i, /sweet|yam|chip|salad|knish|kugel|starch|pancake|bag/i],
  ],
  deli: [
    ['pastrami', 'Sliced pastrami', /pastrami/i, /mini|turkey/i],
    ['bologna', 'Beef bologna', /bologna/i, /turkey|chicken/i],
    ['hotdogs', 'Beef hot dogs', /hot dog|frank/i, /turkey|chicken|knock|roll|bun/i],
    ['cornedbeef', 'Corned beef', /corned beef/i, /mini|hash/i],
  ],
};

// Given a store's raw [{name, price}] for a category, pick the cheapest product
// that matches each canonical cut (skipping products the exclude pattern rejects).
function normalize(raw, category) {
  const result = {};
  for (const [id, , include, exclude] of CANON[category]) {
    const matches = raw.filter(
      (p) => p.price > 0 && include.test(p.name) && !(exclude && exclude.test(p.name)),
    );
    if (matches.length) {
      matches.sort((a, b) => a.price - b.price);
      result[id] = matches[0].price;
    }
  }
  return result;
}

/* ---------------- platform adapters ---------------- */

async function scrapeMercatus(page, store, category) {
  const catId = store.categories[category];
  const names = store.categoryNames?.[category];
  await page.goto(store.origin + store.seedUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000); // let Cloudflare JS challenge + app settle
  return page.evaluate(
    async ({ retailer, branch, catId, names }) => {
      let u = `/v2/retailers/${retailer}/branches/${branch}/categories/${catId}/products?appId=4&languageId=2&from=0&size=120&minScore=0`;
      if (names) for (const n of names) u += `&names=${encodeURIComponent(n)}`;
      const r = await fetch(u, { headers: { accept: 'application/json' } });
      const j = await r.json();
      return (j.products || []).map((p) => ({
        name: (p.names && p.names['2'] && p.names['2'].short) || p.localName || '',
        price: p.regularPrice ?? (p.branch && p.branch.regularPrice) ?? p.price ?? 0,
        perLb: !!p.isWeighable,
      }));
    },
    { retailer: store.retailer, branch: store.branch, catId, names },
  );
}

async function scrapeHb(page, store, category) {
  const captured = [];
  const handler = async (resp) => {
    if (resp.url().includes('JsonProductsList')) {
      try {
        const j = await resp.json();
        const arr = JSON.parse(j.productsJson || '[]');
        for (const p of arr) captured.push({ name: p.N, price: p.P_v, perLb: !!p.iW });
      } catch {}
    }
  };
  page.on('response', handler);
  await page.goto(store.origin + store.categoryUrls[category], { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  page.off('response', handler);
  return captured;
}

// Shopify: pull the whole catalog once (same-origin, so navigate there first),
// then let normalize()'s name matchers pick out chicken vs beef.
// hb "group" categories (dairy/produce/deli) are parents of subcategories.
// Navigate the parent, read its subCategories, then capture each sub's products.
async function scrapeHbGroup(page, store, parentPath) {
  let parent = null;
  const h1 = async (r) => {
    if (r.url().includes('JsonProductsList')) {
      try {
        const j = await r.json();
        if (j.subCategories && j.subCategories.length) parent = j;
      } catch {}
    }
  };
  page.on('response', h1);
  await page.goto(store.origin + parentPath, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  page.off('response', h1);

  const subs = (parent && parent.subCategories) || [];
  const all = [];
  for (const sub of subs.slice(0, 40)) {
    const cap = [];
    const h2 = async (r) => {
      if (r.url().includes('JsonProductsList')) {
        try {
          const j = await r.json();
          for (const p of JSON.parse(j.productsJson || '[]')) cap.push({ name: p.N, price: p.P_v, perLb: !!p.iW });
        } catch {}
      }
    };
    page.on('response', h2);
    await page.goto(`${store.origin}/${store.region}/category/${sub.Id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    page.off('response', h2);
    all.push(...cap);
  }
  return all;
}

async function scrapeShopify(page, store) {
  await page.goto(store.origin + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return page.evaluate(async (origin) => {
    const out = [];
    for (let pg = 1; pg <= 8; pg++) {
      const r = await fetch(`${origin}/products.json?limit=250&page=${pg}`, { headers: { accept: 'application/json' } });
      if (!r.ok) break;
      const j = await r.json();
      const prods = j.products || [];
      if (!prods.length) break;
      for (const p of prods) {
        const v = (p.variants || [])[0] || {};
        out.push({ name: p.title, price: parseFloat(v.price) || 0, perLb: /lb|pound/i.test(p.title + ' ' + (v.title || '')) });
      }
    }
    return out;
  }, store.origin);
}

const ADAPTERS = { hb: scrapeHb, mercatus: scrapeMercatus, shopify: scrapeShopify };

/* ---------------- run ---------------- */

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const out = { stores: {}, report: [] };

  for (const store of STORES) {
    const adapter = ADAPTERS[store.platform];
    const entry = { chicken: {}, beef: {}, dairy: {}, produce: {}, deli: {} };
    let rawChicken = 0, rawBeef = 0;
    try {
      let c, b;
      if (store.platform === 'shopify') {
        c = b = await adapter(page, store);
      } else {
        c = await adapter(page, store, 'chicken');
        b = await adapter(page, store, 'beef');
      }
      rawChicken = c.length; rawBeef = b.length;
      entry.chicken = normalize(c, 'chicken');
      entry.beef = normalize(b, 'beef');
    } catch (e) {
      out.report.push(`${store.id}: ERROR ${String(e).slice(0, 120)}`);
    }

    // dairy / produce / deli via subcategory expansion (hb stores)
    if (store.groups) {
      for (const [cat, path] of Object.entries(store.groups)) {
        try {
          const raw = await scrapeHbGroup(page, store, path);
          entry[cat] = normalize(raw, cat);
          console.log(`    · ${store.id}.${cat}: raw ${raw.length} -> ${Object.keys(entry[cat]).length} priced`);
        } catch (e) {
          out.report.push(`${store.id}.${cat}: ERROR ${String(e).slice(0, 100)}`);
        }
      }
    }
    out.stores[store.id] = entry;
    const priced = Object.keys(entry.chicken).length + Object.keys(entry.beef).length;
    const line = `${store.name} [${store.platform}] — raw ${rawChicken}c/${rawBeef}b -> ${priced} canonical cuts priced`;
    out.report.push(line);
    console.log('  ✓', line);
  }

  await browser.close();
  const path = join(__dirname, 'prices.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log('\nWrote', path);
  console.log(out.report.join('\n'));
}

console.log('Scraping kosher store prices (real browser, ~20-40s per store)...');
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
