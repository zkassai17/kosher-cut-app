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
}

// Mutable so a fresh remote feed can replace the bundled snapshot at runtime.
let CATALOG = raw as unknown as Record<string, CatalogProduct[]>;

// Swap in a newer catalog (from the remote daily feed). Ignores empty/bad data.
export function setCatalog(data: Record<string, CatalogProduct[]> | undefined | null): void {
  if (data && typeof data === 'object' && Object.keys(data).length) CATALOG = data;
}

export const hasCatalog = (storeId: string): boolean => (CATALOG[storeId]?.length ?? 0) > 0;

export const catalogSize = (storeId: string): number => CATALOG[storeId]?.length ?? 0;

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

// A looser key for GROUPING the same product across stores. Some stores put the
// size in the name ("Saladmate Caesar 12 Oz"), others don't ("Salad Mate
// Caesar") — so we drop sizes/quantities and all spacing/punctuation, leaving
// the brand+product. Trade-off: two different sizes of the same product group
// together (usually the standard bottle), which is the right call for branded
// packaged goods.
function groupKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bounces?\b/g, 'oz')
    .replace(/\bpounds?\b/g, 'lb')
    .replace(/\b\d+(\.\d+)?\s?(oz|lb|g|kg|ml|l|pk|ct|count|pack|gal|qt|pt|dozen|doz|x|liter|litre|gram)s?\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
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
      if (!terms.every((t) => nn.includes(t))) continue;
      const key = groupKey(prod.n) || nn;
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
