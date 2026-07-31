// Product-identity canonicalizer.
//
// The hard part of a price-compare app is that the SAME physical product is
// named differently at every store ("Salad Mate Saladmate Dressing Caesar" vs
// "Saladmate Caesar Dressing, 12 Oz"). Regex matching only gets us so far. Here
// we ask an LLM — ONCE per unique name, cached forever — to turn each messy name
// into a normalized {brand, product} identity. Two products with the same
// identity are the same thing and get the same canonical key `c`.
//
// Design notes:
//  • CACHED by raw name in canon-cache.json → we only pay for NEW names. After
//    the first fill, daily cost is pennies (the catalog barely changes).
//  • NON-FATAL: if no API key or the API errors, we return the catalog unchanged
//    (no `c` field) and the app falls back to its regex matcher. Can't break the feed.
//  • The LLM does the semantic cleanup (dedupe brand, fix typos, light==lite, keep
//    distinguishing qualifiers like lite/whole/skim/organic/flavor/pack). We then
//    anagram-normalize its `product` so residual word-order differences still collide.
//
// Env:
//   LLM_PROVIDER   anthropic (default) | openai | mock
//   ANTHROPIC_API_KEY / OPENAI_API_KEY
//   LLM_MODEL      override model id
//   CANON_MAX_NEW  cap new names canonicalized per run (default 60000)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, 'canon-cache.json');

const PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
const MAX_NEW = parseInt(process.env.CANON_MAX_NEW || '60000', 10);
const BATCH = 40;
const CONCURRENCY = 6;

const SYSTEM = `You normalize kosher-grocery product names so the SAME physical product sold at different stores maps to the SAME identity.

For each numbered product name, output its brand and a normalized "product" description.

RULES
- brand: the manufacturer/brand in lowercase, with any duplicated brand words removed. If the name has no real brand (loose produce, butcher meat, store-made), use "".
- product: a lowercase canonical description of WHAT the item is. INCLUDE every quality that changes the product or its price: flavor/variety, fat level (whole / 2% / 1% / skim), lite/light/diet/zero/sugar-free/no-sugar, organic, decaf, and pack count (e.g. "4 pack"). Treat "light" and "lite" as the same word: write "lite". Fix obvious typos (e.g. "balsmic" -> "balsamic"). Remove the brand, any size/weight/volume (oz, lb, g, kg, ml, l, gallon, quart, dozen), and marketing fluff (fresh, premium, new, delicious, the).
- Two GENUINELY different products must get different "product" strings: regular vs lite, whole vs skim, one flavor vs another, single vs multi-pack. Never merge those.
- Keep it minimal but complete. Same product, different wording -> identical brand AND product.

OUTPUT: ONLY a JSON array, one object per input, in order: [{"i":0,"brand":"...","product":"..."}, ...]. No prose.`;

const EXAMPLES = [
  ['Saladmate Caesar Dressing, 12 Oz', { brand: 'salad mate', product: 'caesar dressing' }],
  ['Salad Mate Saladmate Dressing Caesar', { brand: 'salad mate', product: 'caesar dressing' }],
  ['Saladmate Caesar Dressing Lite, 12 Oz', { brand: 'salad mate', product: 'caesar dressing lite' }],
  ['General Mills Chocolate Cheerios Cereal', { brand: 'general mills', product: 'chocolate cheerios' }],
  ['Kelloggs Original Corn Flakes', { brand: 'kelloggs', product: 'corn flakes' }],
  ['Tuscanini Whole Milk 1.89 L', { brand: 'tuscanini', product: 'whole milk' }],
  ['Fresh & Healthy Skim Milk Half Gallon', { brand: 'fresh & healthy', product: 'skim milk' }],
  ['Family Pack Ground Beef', { brand: '', product: 'ground beef family pack' }],
];

const FEW_SHOT_USER = EXAMPLES.map((e, i) => `${i}. ${e[0]}`).join('\n');
const FEW_SHOT_ASSISTANT = JSON.stringify(EXAMPLES.map((e, i) => ({ i, ...e[1] })));

// ---- LLM call (provider-agnostic) ----------------------------------------

async function callAnthropic(userText) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const model = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [
        { role: 'user', content: FEW_SHOT_USER },
        { role: 'assistant', content: FEW_SHOT_ASSISTANT },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.content?.[0]?.text || '';
}

async function callOpenAI(userText) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: FEW_SHOT_USER },
        { role: 'assistant', content: FEW_SHOT_ASSISTANT },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

// Mock provider (for testing the pipeline with no API key): reuse a simple
// heuristic so we can prove the plumbing end-to-end offline.
function callMock(names) {
  return names.map((n, i) => {
    const clean = n
      .toLowerCase()
      .replace(/\blight\b/g, 'lite')
      .replace(/\b\d+(\.\d+)?\s?(oz|lb|g|kg|ml|l|gal|qt|pt|dozen|liter|gram|ounce|pound)s?\b/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const toks = clean.split(' ');
    return { i, brand: toks.slice(0, 2).join(' '), product: toks.slice(2).join(' ') || clean };
  });
}

function parseJsonArray(text) {
  const a = text.indexOf('[');
  const b = text.lastIndexOf(']');
  if (a < 0 || b < 0) throw new Error('no JSON array in response');
  return JSON.parse(text.slice(a, b + 1));
}

// ---- key derivation -------------------------------------------------------

const KEY_FILLER = new Set(['the', 'of', 'with', 'a', 'an', 'and', 'dressing']);

// Anagram-normalize the LLM's product string so residual word-order/spacing
// differences still collide, then prefix the brand. This is the stored `c`.
export function identityKey(brand, product) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !KEY_FILLER.has(t));
  const b = norm(brand).join('');
  const p = norm(product).sort().join('');
  if (!b && !p) return '';
  return `${b}|${p}`;
}

// ---- batching with a small concurrency pool -------------------------------

async function runBatches(batches, worker) {
  const results = new Array(batches.length);
  let next = 0;
  async function pump() {
    while (next < batches.length) {
      const idx = next++;
      try {
        results[idx] = await worker(batches[idx], idx);
      } catch (e) {
        console.error(`  canon batch ${idx} failed: ${String(e).slice(0, 140)}`);
        results[idx] = null; // leave those names uncached; try again next run
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, pump));
  return results;
}

// ---- public API -----------------------------------------------------------

// Adds a canonical key `c` to every product in `catalog` (in place-ish, returns
// the same object). Uses + updates the on-disk cache. Never throws — on any
// failure it simply leaves some/all products without `c`.
export async function canonicalize(catalog) {
  let cache = {};
  if (existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    } catch {}
  }

  // Every unique product name in the catalog.
  const allNames = new Set();
  for (const arr of Object.values(catalog)) for (const p of arr) if (p?.n) allNames.add(p.n);

  const todo = [...allNames].filter((n) => !(n in cache));
  console.log(`\nCanonicalize: ${allNames.size} unique names, ${cache && Object.keys(cache).length} cached, ${todo.length} new`);

  if (todo.length && PROVIDER !== 'off') {
    const slice = todo.slice(0, MAX_NEW);
    if (slice.length < todo.length) console.log(`  (capping at ${MAX_NEW} new this run; ${todo.length - slice.length} deferred to next run)`);

    const batches = [];
    for (let i = 0; i < slice.length; i += BATCH) batches.push(slice.slice(i, i + BATCH));

    const worker = async (names) => {
      let parsed;
      if (PROVIDER === 'mock') {
        parsed = callMock(names);
      } else {
        const userText = names.map((n, i) => `${i}. ${n}`).join('\n');
        const text = PROVIDER === 'openai' ? await callOpenAI(userText) : await callAnthropic(userText);
        parsed = parseJsonArray(text);
      }
      for (const row of parsed) {
        const name = names[row.i];
        if (name == null) continue;
        cache[name] = identityKey(row.brand, row.product);
      }
    };

    // Bail out cleanly if the very first batch fails (e.g. bad/missing key) so we
    // don't hammer the API 1000× with the same error.
    try {
      await worker(batches[0]);
    } catch (e) {
      console.error(`  canonicalization disabled this run: ${String(e).slice(0, 160)}`);
      writeFileSync(CACHE_PATH, JSON.stringify(cache));
      return applyKeys(catalog, cache);
    }
    await runBatches(batches.slice(1), worker);
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
  }

  return applyKeys(catalog, cache);
}

function applyKeys(catalog, cache) {
  let tagged = 0;
  for (const arr of Object.values(catalog)) {
    for (const p of arr) {
      const c = cache[p.n];
      if (c) {
        p.c = c;
        tagged++;
      }
    }
  }
  const total = Object.values(catalog).reduce((s, a) => s + a.length, 0);
  console.log(`  tagged ${tagged}/${total} products with a canonical key`);
  return catalog;
}
