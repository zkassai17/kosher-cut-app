// Full-store-catalog search — every product a store carries (not just the
// curated cuts), so you can search "salad mate dressing" and find where it's
// cheapest. Data comes from scraper/catalog.mjs → catalog.json.
//
// Shape: { storeId: [{ n: name, p: price, lb: soldPerLb }] }

import raw from './catalog.json';

export interface CatalogProduct {
  n: string;
  p: number;
  lb: boolean;
  c?: string; // canonical identity key (LLM, from the daily feed) — matches the same product across stores
}

// Mutable so a fresh remote feed can replace the bundled snapshot at runtime.
let CATALOG = raw as unknown as Record<string, CatalogProduct[]>;

// name -> canonical key, so list/regulars pricing (which holds a product NAME
// from one store) can match that product at another store by identity.
let KEY_INDEX = new Map<string, string>();
function buildKeyIndex(): void {
  KEY_INDEX = new Map();
  for (const arr of Object.values(CATALOG)) for (const p of arr) if (p.c) KEY_INDEX.set(p.n, p.c);
}
buildKeyIndex();

// Canonical grouping key: prefer the LLM identity `c` from the feed; fall back to
// the regex matcher for any product the canonicalizer hasn't tagged yet.
const keyOfProduct = (p: CatalogProduct): string => p.c || groupKey(p.n);
const keyForName = (name: string): string => KEY_INDEX.get(name) || groupKey(name);

// Swap in a newer catalog (from the remote daily feed). Ignores empty/bad data.
export function setCatalog(data: Record<string, CatalogProduct[]> | undefined | null): void {
  if (data && typeof data === 'object' && Object.keys(data).length) {
    CATALOG = data;
    buildKeyIndex();
  }
}

export const hasCatalog = (storeId: string): boolean => (CATALOG[storeId]?.length ?? 0) > 0;

export const catalogSize = (storeId: string): number => CATALOG[storeId]?.length ?? 0;

// Price of a catalog product (by name) at one store — for lists that hold any
// searched product, not just the curated cuts.
export function catalogPriceOf(storeId: string, name: string): number | null {
  const key = keyForName(name);
  if (!key) return null;
  let best: number | null = null;
  for (const prod of CATALOG[storeId] ?? []) {
    if (keyOfProduct(prod) === key && prod.p != null) best = best == null ? prod.p : Math.min(best, prod.p);
  }
  return best;
}

// Is this catalog product sold by weight (per lb) anywhere in the given stores?
export function catalogIsLb(name: string, storeIds: string[]): boolean {
  const key = keyForName(name);
  for (const sid of storeIds) for (const prod of CATALOG[sid] ?? []) if (keyOfProduct(prod) === key) return prod.lb;
  return false;
}

// Normalize a product name for TERM MATCHING (search): lowercase, unify oz/lb,
// keep word boundaries so query terms can be substring-tested.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bounces?\b/g, 'oz')
    .replace(/\bpounds?\b/g, 'lb')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Filler words that stores use inconsistently — dropped so the same product
// matches across stores regardless of wording ("Black Cherry Flavored Greek
// Yogurt" vs "Greek Yogurt Black Cherry").
// Words stores use inconsistently — dropped so the same product matches across
// stores. We deliberately do NOT drop distinguishing words like whole/skim/zero/
// sugar/flip/original (those separate genuinely different products).
const FILLER = new Set([
  'greek', 'yogurt', 'yoghurt', 'flavored', 'flavor', 'blended', 'blend', 'style',
  'the', 'of', 'with', 'a', 'an', 'and', 'low', 'fat', 'nonfat', 'non', 'reduced',
  'dressing', 'nf', 'on', 'bottom',
  // Generic category/marketing noise stores add inconsistently — dropping these
  // pairs "Apple Jacks" with "Apple Jacks Cereal" and "Corn Flakes" with "Original
  // Corn Flakes". We deliberately do NOT add distinguishing words (organic, gluten,
  // free, whole, skim, mini, chocolate, vanilla, white, light/lite) — those separate
  // genuinely different products and different price points.
  'cereal', 'original', 'classic',
]);

// Some stores double the brand inside a name — Mercatus emits "Salad Mate
// Saladmate Dressing Caesar" (brand field + brand-in-name), which the plain
// anagram key sees as different from G&E's "Saladmate Caesar Dressing". Drop a
// token when its letters are already covered by the OTHER tokens of the SAME name
// (shortest first), so "salad"+"mate" collapse into the "saladmate" also present.
// Scoped to one product's own tokens, so it only removes real in-name redundancy.
function dedupeTokens(toks: string[]): string[] {
  const order = toks.map((_, i) => i).sort((a, b) => toks[a].length - toks[b].length);
  const dropped = new Set<number>();
  for (const i of order) {
    let others = '';
    for (let j = 0; j < toks.length; j++) if (j !== i && !dropped.has(j)) others += toks[j];
    if (toks[i] && others.includes(toks[i])) dropped.add(i);
  }
  return toks.filter((_, i) => !dropped.has(i));
}

// A looser key for GROUPING the same product across stores. We drop weight/
// volume sizes (stores name them inconsistently), punctuation, and filler words,
// then SORT the remaining tokens — so word order/wording don't matter ("Chobani
// Black Cherry ..." matches at both stores). BUT we KEEP the multipack count
// (a 4-pack must not merge with a single cup — that caused fake savings).
function groupKey(s: string): string {
  const lower = s
    .toLowerCase()
    .replace(/\bounces?\b/g, 'oz')
    .replace(/\bpounds?\b/g, 'lb')
    .replace(/\blight\b/g, 'lite') // "Caesar Light" == "Caesar Lite" (same product, two spellings)
    .replace(/\bnot only\b/g, ' '); // brand flourish ("Not Only Cole Slaw" == "Cole Slaw")
  const pack = lower.match(/\b(\d+)\s?-?\s?(ct|pk|pack|counts?|packs)\b/);
  const packTok = pack ? `pk${pack[1]}` : '';
  const cleaned = lower
    .replace(/\b\d+(\.\d+)?\s?(oz|lb|g|kg|ml|l|gal|qt|pt|dozen|doz|liter|litre|gram)s?\b/g, ' ')
    .replace(/\b\d+\s?-?\s?(ct|pk|pack|counts?|packs)\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\s?x\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ');
  const toks = dedupeTokens(cleaned.split(/\s+/).filter((tok) => tok && !FILLER.has(tok)));
  // Sort the CHARACTERS of the joined tokens (an "anagram" key). This ignores
  // word order AND word spacing, so "Saladmate Balsamic" == "Salad Mate Balsamic"
  // and "Greek Yogurt Black Cherry" == "Black Cherry Flavored Greek Yogurt", and
  // apostrophe/spelling variants ("Kellogg's" == "Kelloggs") merge too.
  return toks.join('').split('').sort().join('') + packTok;
}

// Bounded Levenshtein — true if `a` can become `b` in ≤ max edits. Early-exits
// so it's cheap; used only as a fallback when a term doesn't match exactly.
function editWithin(a: string, b: string, max: number): boolean {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return false;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[lb] <= max;
}

// Does a search term match a normalized product name — as a substring, or (typo
// tolerance) close to one of the name's words?
function termMatches(term: string, normName: string): boolean {
  if (normName.includes(term)) return true;
  // Space-insensitive: a one-word search ("saladmate") matches a two-word name
  // ("Salad Mate ...") and vice-versa.
  if (term.length >= 5 && normName.replace(/ /g, '').includes(term)) return true;
  if (term.length < 4) return false; // too short to fuzzy safely
  const max = term.length >= 7 ? 2 : 1;
  for (const w of normName.split(' ')) {
    if (w.length >= 3 && editWithin(term, w, max)) return true;
  }
  return false;
}

export interface CatalogHit {
  name: string; // display name
  lb: boolean;
  prices: { storeId: string; price: number }[]; // stores that carry it, cheapest first
}

// Search the catalog across the given stores. Products with the same normalized
// name at multiple stores are grouped into one comparable row.
export function searchCatalog(query: string, storeIds: string[], limit = 40): CatalogHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const terms = q.split(' ').filter(Boolean);

  const groups = new Map<string, CatalogHit>();
  for (const sid of storeIds) {
    for (const prod of CATALOG[sid] ?? []) {
      if (prod.p == null) continue;
      const nn = norm(prod.n);
      if (!terms.every((t) => termMatches(t, nn))) continue;
      const key = keyOfProduct(prod) || nn;
      const g = groups.get(key);
      if (g) {
        const existing = g.prices.find((x) => x.storeId === sid);
        if (existing) existing.price = Math.min(existing.price, prod.p);
        else g.prices.push({ storeId: sid, price: prod.p });
        // Prefer the most descriptive display name (usually the one with a size).
        if (prod.n.trim().length > g.name.length) g.name = prod.n.trim();
      } else {
        groups.set(key, { name: prod.n.trim(), lb: prod.lb, prices: [{ storeId: sid, price: prod.p }] });
      }
    }
  }

  const hits = Array.from(groups.values());
  for (const h of hits) h.prices.sort((a, b) => a.price - b.price);
  // Multi-store (comparable) hits first, then cheapest.
  hits.sort((a, b) => b.prices.length - a.prices.length || a.prices[0].price - b.prices[0].price);
  return hits.slice(0, limit);
}
