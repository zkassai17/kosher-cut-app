// Store-vs-store comparison rows, derived from the per-category price table in
// prices.ts. A row shows each store's price for an item — or null ("—") when a
// store doesn't list it yet.

import { CATEGORIES, itemMeta, money, priceOf, PRICES, Unit, unitSuffix } from './prices';
import { catalogIsLb, catalogPriceOf } from './catalog';

export { money, unitSuffix };

export type StoreId = 'ge' | 'gl';

export const STORE_SHORT: Record<StoreId, string> = {
  ge: 'Grand & Essex',
  gl: 'Glatt Express',
};

export interface Cut {
  cut: string;
  ge: number | null;
  gl: number | null;
  unit: Unit;
}

// Build the Bergen (G&E vs Glatt) rows for any category.
export function rowsFor(catKey: string): Cut[] {
  const category = CATEGORIES.find((c) => c.key === catKey);
  if (!category) return [];
  const rows: Cut[] = [];
  for (const it of category.items) {
    const ge = priceOf('ge', catKey, it.id);
    const gl = priceOf('gl', catKey, it.id);
    if (ge != null || gl != null) rows.push({ cut: it.label, ge, gl, unit: category.unit });
  }
  return rows;
}

export const CHICKEN: Cut[] = rowsFor('chicken');
export const BEEF: Cut[] = rowsFor('beef');

// Short labels for the store price pills.
export const STORE_ABBR: Record<string, string> = {
  ge: 'G&E',
  gl: 'Glatt',
  superstop: 'SuperStop',
  gourmetglatt: 'Gourmet',
  seasons_law: 'Seasons',
  six60one: '661',
  kmp: 'KMP',
};

export const storeHasData = (storeId: string): boolean =>
  !!PRICES[storeId] && CATEGORIES.some((c) => Object.keys(PRICES[storeId][c.key] ?? {}).length > 0);

// Does this store list anything in a specific category? (so a store only shows
// on the tabs it actually has prices for — e.g. KMP appears in Dairy, not Meat.)
export const storeHasCategoryData = (storeId: string, catKey: string): boolean =>
  Object.keys(PRICES[storeId]?.[catKey] ?? {}).length > 0;

export interface CompItem {
  item: string;
  id: string;
  cat: string;
  unit: Unit;
  prices: (number | null)[]; // parallel to the storeIds passed in
}

// Compare a category across an arbitrary set of stores (the ones near you).
export function compRows(catKey: string, storeIds: string[]): CompItem[] {
  const cat = CATEGORIES.find((c) => c.key === catKey);
  if (!cat) return [];
  return cat.items
    .map((it) => ({
      item: it.label,
      id: it.id,
      cat: catKey,
      unit: cat.unit,
      prices: storeIds.map((sid) => priceOf(sid, catKey, it.id)),
    }))
    .filter((r) => r.prices.some((p) => p != null));
}

/* ---------- Shopping list / basket math ---------- */

export interface BasketLine {
  cat: string;
  id: string;
  label: string;
  unit: Unit;
  qty: number; // how many to buy (>=1)
  prices: (number | null)[]; // parallel to storeIds — UNIT price at each store
  cheapestIdx: number; // index of the cheapest store, or -1 if unpriced here
}

export interface StoreTotal {
  storeId: string;
  total: number; // sum of the items this store prices
  have: number; // how many of the list's items it prices
  missing: number; // how many it doesn't
}

export interface BasketResult {
  lines: BasketLine[];
  totals: StoreTotal[]; // complete baskets first, then cheapest total
  cheapest: StoreTotal | null; // best single-store option
  splitTotal: number; // buying each item at its cheapest store
  splitSavings: number; // vs the cheapest COMPLETE single store
  itemCount: number;
}

// Total a shopping list at each store, plus the "split across stores" optimum.
export function basketTotals(items: { cat: string; id: string; qty?: number }[], storeIds: string[]): BasketResult {
  const lines: BasketLine[] = items.map(({ cat, id, qty }) => {
    // Catalog products (any searched item) are stored as { cat: 'catalog', id: name }
    // and priced by matching the name across the full store catalogs.
    const isCatalog = cat === 'catalog';
    const prices = storeIds.map((sid) => (isCatalog ? catalogPriceOf(sid, id) : priceOf(sid, cat, id)));
    const meta = isCatalog ? null : itemMeta(cat, id);
    const valid = prices.filter((p): p is number => p != null);
    const min = valid.length ? Math.min(...valid) : null;
    return {
      cat,
      id,
      label: meta?.label ?? id,
      unit: isCatalog ? (catalogIsLb(id, storeIds) ? 'lb' : 'ea') : meta?.unit ?? 'lb',
      qty: Math.max(1, Math.round(qty ?? 1)),
      prices,
      cheapestIdx: min != null ? prices.indexOf(min) : -1,
    };
  });

  const totals: StoreTotal[] = storeIds
    .map((sid, i) => {
      let total = 0;
      let have = 0;
      for (const ln of lines) {
        const p = ln.prices[i];
        if (p != null) {
          total += p * ln.qty; // quantity-aware: 2 challahs count twice
          have++;
        }
      }
      return { storeId: sid, total, have, missing: lines.length - have };
    })
    .filter((t) => t.have > 0)
    .sort((a, b) => a.missing - b.missing || a.total - b.total);

  const cheapest = totals[0] ?? null;

  const splitTotal = lines.reduce((sum, ln) => {
    const valid = ln.prices.filter((p): p is number => p != null);
    return sum + (valid.length ? Math.min(...valid) * ln.qty : 0);
  }, 0);

  // Only claim savings against a store that actually carries the WHOLE list.
  const complete = totals.find((t) => t.missing === 0);
  const splitSavings = complete ? Math.max(0, complete.total - splitTotal) : 0;

  return { lines, totals, cheapest, splitTotal, splitSavings, itemCount: lines.length };
}

// Categories that have at least one priced row somewhere — i.e. worth a tab.
export const LIVE_CATEGORIES = CATEGORIES.filter((c) => rowsFor(c.key).length > 0);

/* ---------- Area-aware deals (for the Deals tab) ---------- */
// A deal = an item where the cheapest store beats the next-cheapest store in
// THIS area, by that gap. Computed across every category for the given stores.

export interface AreaDeal {
  cut: string;
  save: number; // how much cheaper the winner is vs the next store
  store: string; // abbreviated name of the cheapest store
  price: number; // the cheapest price
  unit: Unit;
}

export function areaDeals(storeIds: string[]): AreaDeal[] {
  const out: AreaDeal[] = [];
  for (const cat of CATEGORIES) {
    for (const it of cat.items) {
      const priced = storeIds
        .map((sid) => ({ sid, p: priceOf(sid, cat.key, it.id) }))
        .filter((x): x is { sid: string; p: number } => x.p != null)
        .sort((a, b) => a.p - b.p);
      if (priced.length < 2 || priced[1].p === priced[0].p) continue; // need a real gap
      out.push({
        cut: it.label,
        save: priced[1].p - priced[0].p,
        store: STORE_ABBR[priced[0].sid] ?? priced[0].sid,
        price: priced[0].p,
        unit: cat.unit,
      });
    }
  }
  return out.sort((a, b) => b.save - a.save);
}

// The single cheapest item in each category for this area — the "what's cheap
// here right now" chips.
export function areaCheapest(storeIds: string[]): Chip[] {
  const chips: Chip[] = [];
  for (const cat of CATEGORIES) {
    let best: Chip | null = null;
    for (const it of cat.items) {
      for (const sid of storeIds) {
        const p = priceOf(sid, cat.key, it.id);
        if (p != null && (!best || p < best.price)) {
          best = { name: it.label, price: p, store: STORE_ABBR[sid] ?? sid, unit: cat.unit };
        }
      }
    }
    if (best) chips.push(best);
  }
  return chips;
}

export type Winner = 'ge' | 'gl' | 'tie';

export function winnerOf(c: Cut): Winner {
  if (c.ge == null && c.gl == null) return 'tie';
  if (c.ge == null) return 'gl';
  if (c.gl == null) return 'ge';
  return c.ge === c.gl ? 'tie' : c.ge < c.gl ? 'ge' : 'gl';
}

// A row is a real head-to-head only when both stores list the item.
export const bothPriced = (c: Cut): boolean => c.ge != null && c.gl != null;

export function tally() {
  let ge = 0, gl = 0, tie = 0;
  for (const c of [...CHICKEN, ...BEEF]) {
    if (!bothPriced(c)) continue;
    const w = winnerOf(c);
    if (w === 'ge') ge++;
    else if (w === 'gl') gl++;
    else tie++;
  }
  return { ge, gl, tie, total: ge + gl + tie };
}

export interface Saving {
  cut: string;
  save: number;
  store: string;
  price: number;
}

export function biggestSavings(): Saving[] {
  return [...CHICKEN, ...BEEF]
    .filter(bothPriced)
    .map((c) => {
      const w = winnerOf(c);
      if (w === 'tie') return null;
      return {
        cut: c.cut,
        save: Math.abs((c.ge as number) - (c.gl as number)),
        store: STORE_SHORT[w],
        price: Math.min(c.ge as number, c.gl as number),
      };
    })
    .filter((x): x is Saving => x !== null)
    .sort((a, b) => b.save - a.save);
}

export interface Chip {
  name: string;
  price: number;
  store: string;
  unit?: Unit;
}

const POPULAR = ['Whole chicken', 'Chicken, cut in 8', 'Ground beef', 'Drumsticks'];
export const CHEAPEST: Chip[] = POPULAR.map((name) => {
  const c = [...CHICKEN, ...BEEF].find((x) => x.cut === name);
  if (!c || !bothPriced(c)) return null;
  const w = winnerOf(c);
  return {
    name,
    price: Math.min(c.ge as number, c.gl as number),
    store: w === 'gl' ? 'Glatt Express' : 'Grand & Essex',
  };
}).filter((c): c is Chip => c !== null);
