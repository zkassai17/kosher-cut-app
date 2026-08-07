// Per-store, per-category, per-item prices — the table the app reads.
//
// Meat (chicken/beef) is priced per lb. Dairy/deli are per item (ea). Produce is
// per lb. Meat + Glatt data come from the scraper / live-session pulls; Grand &
// Essex non-meat is being backfilled (shows "—" until pulled).
//
// Shape: PRICES[storeId][categoryKey][itemId] = price.

export type Unit = 'lb' | 'ea';
export interface Item { id: string; label: string }
export interface Category {
  key: string;
  label: string;
  emoji: string;
  unit: Unit;
  items: Item[];
}

const CHICKEN_ITEMS: Item[] = [
  { id: 'whole_chicken', label: 'Whole chicken' },
  { id: 'cut_in_8', label: 'Chicken, cut in 8' },
  { id: 'drumsticks', label: 'Drumsticks' },
  { id: 'legs', label: 'Chicken legs' },
  { id: 'thighs', label: 'Chicken thighs' },
  { id: 'cutlets', label: 'Chicken cutlets' },
  { id: 'thin_cutlets', label: 'Thin cutlets' },
  { id: 'pargiyot', label: 'Baby chicken (pargiyot)' },
  { id: 'wings', label: 'Chicken wings' },
  { id: 'ground_chicken', label: 'Ground chicken' },
];

const BEEF_ITEMS: Item[] = [
  { id: 'ground_beef', label: 'Ground beef' },
  { id: 'extra_lean', label: 'Extra lean ground' },
  { id: 'patties', label: 'Beef patties' },
  { id: 'sliders', label: 'Sliders / mini burgers' },
  { id: 'stew', label: 'Beef stew (cholent)' },
  { id: 'london_broil', label: 'Minute steak / London broil' },
  { id: 'rib_steak', label: 'Rib steak' },
  { id: 'flanken', label: 'Flanken' },
  { id: 'brisket', label: 'Brisket (1st cut)' },
];

const DAIRY_ITEMS: Item[] = [
  { id: 'eggs', label: 'Eggs (dozen)' },
  { id: 'milk', label: 'Milk (½ gal)' },
  { id: 'butter', label: 'Butter' },
  { id: 'cream_cheese', label: 'Cream cheese' },
  { id: 'cottage_cheese', label: 'Cottage cheese' },
  { id: 'american_cheese', label: 'American cheese' },
  { id: 'shredded_cheese', label: 'Shredded cheese' },
  { id: 'sourcream', label: 'Sour cream' },
  { id: 'yogurt', label: 'Yogurt' },
];

const PRODUCE_ITEMS: Item[] = [
  { id: 'bananas', label: 'Bananas' },
  { id: 'apples', label: 'Gala apples' },
  { id: 'potatoes', label: 'Idaho potatoes' },
];

const DELI_ITEMS: Item[] = [
  { id: 'pastrami', label: 'Sliced pastrami' },
  { id: 'bologna', label: 'Beef bologna' },
  { id: 'hotdogs', label: 'Beef hot dogs' },
  { id: 'cornedbeef', label: 'Corned beef' },
];

export const CATEGORIES: Category[] = [
  { key: 'chicken', label: 'Chicken', emoji: '🍗', unit: 'lb', items: CHICKEN_ITEMS },
  { key: 'beef', label: 'Beef', emoji: '🥩', unit: 'lb', items: BEEF_ITEMS },
  { key: 'dairy', label: 'Dairy', emoji: '🧀', unit: 'ea', items: DAIRY_ITEMS },
];
// Produce/Deli item lists kept for later; not shown right now.
void PRODUCE_ITEMS;
void DELI_ITEMS;

type PriceMap = Record<string, number>;
export type StorePrices = Record<string, PriceMap>; // categoryKey -> {itemId: price}

export const PRICES: Record<string, StorePrices> = {
  ge: {
    chicken: {
      whole_chicken: 3.99, cut_in_8: 4.49, drumsticks: 5.99, legs: 4.99, thighs: 5.49,
      cutlets: 8.99, thin_cutlets: 11.99, pargiyot: 9.99, wings: 3.99, ground_chicken: 8.99,
    },
    beef: {
      ground_beef: 9.99, extra_lean: 11.49, patties: 11.49, sliders: 12.49, stew: 14.99,
      london_broil: 27.99, rib_steak: 29.99, flanken: 32.99, brisket: 20.99,
    },
    dairy: {
      eggs: 1.79, milk: 3.99, butter: 2.89, sourcream: 1.89,
      cream_cheese: 3.89, cottage_cheese: 3.99, american_cheese: 6.19, shredded_cheese: 2.79, yogurt: 0.79,
    },
    produce: { bananas: 1.19, apples: 2.29, potatoes: 0.99 },
    deli: { pastrami: 6.29, bologna: 6.09, hotdogs: 8.99, cornedbeef: 10.99 },
  },
  gl: {
    chicken: {
      whole_chicken: 3.89, cut_in_8: 4.79, drumsticks: 6.49, legs: 4.99, thighs: 6.09,
      cutlets: 9.69, thin_cutlets: 10.99, pargiyot: 9.89, wings: 3.49, ground_chicken: 8.99,
    },
    beef: {
      ground_beef: 8.99, extra_lean: 12.49, patties: 12.99, sliders: 11.99, stew: 14.99,
      london_broil: 25.99, rib_steak: 31.49, flanken: 30.99, brisket: 18.99,
    },
    dairy: {
      eggs: 1.79, milk: 3.99, butter: 3.99, sourcream: 3.29,
      cream_cheese: 4.19, cottage_cheese: 4.19, american_cheese: 4.99, shredded_cheese: 3.79, yogurt: 1.09,
    },
    produce: { bananas: 0.99, apples: 1.99, potatoes: 0.99 },
    deli: { pastrami: 8.69, bologna: 6.29, hotdogs: 11.49, cornedbeef: 9.99 },
  },
  superstop: {
    chicken: {
      whole_chicken: 4.49, drumsticks: 4.99, legs: 3.99, thighs: 5.49, cutlets: 8.99,
      thin_cutlets: 10.49, wings: 3.99, ground_chicken: 9.49,
    },
    beef: {
      ground_beef: 16.49, sliders: 21.49, stew: 17.49, london_broil: 22.79, rib_steak: 37.79,
      flanken: 37.79, brisket: 21.49,
    },
    dairy: {
      eggs: 1.79, butter: 6.09, sourcream: 4.09,
      cream_cheese: 3.29, cottage_cheese: 3.25, american_cheese: 5.29, shredded_cheese: 4.79, yogurt: 0.75,
    },
    produce: { bananas: 0.89, apples: 2.19, potatoes: 1.09 },
    deli: { pastrami: 8.99, bologna: 8.49, hotdogs: 6.99, cornedbeef: 9.49 },
  },
  // Gourmet Glatt — Cedarhurst (Five Towns), scraped via Mercatus branch.regularPrice
  gourmetglatt: {
    chicken: {
      whole_chicken: 4.19, drumsticks: 4.69, legs: 3.99, thighs: 4.19, cutlets: 8.49,
      thin_cutlets: 11.99, pargiyot: 9.19, wings: 2.79, ground_chicken: 9.29,
    },
    beef: {
      ground_beef: 9.49, extra_lean: 13.49, patties: 11.49, sliders: 12.99, stew: 14.49,
      london_broil: 19.99, rib_steak: 33.99, flanken: 25.99, brisket: 19.49,
    },
    dairy: {
      eggs: 2.99, butter: 2.99, cream_cheese: 4.49, cottage_cheese: 1.69,
      american_cheese: 4.69, shredded_cheese: 3.99, sourcream: 1.89, yogurt: 0.79,
    },
    produce: {}, deli: {},
  },
  // Seasons — Lawrence (Five Towns), My Cloud Grocer (full scrape)
  seasons_law: {
    chicken: {
      whole_chicken: 3.79, cut_in_8: 3.99, drumsticks: 4.39, legs: 3.49, thighs: 2.99,
      cutlets: 7.99, thin_cutlets: 9.49, pargiyot: 9.49, wings: 1.99, ground_chicken: 4.99,
    },
    beef: {
      ground_beef: 10.99, extra_lean: 14.99, patties: 14.99, stew: 7.99,
      london_broil: 18.49, rib_steak: 33.99, flanken: 19.99, brisket: 20.99,
    },
    dairy: {
      eggs: 1.99, butter: 2.99, cream_cheese: 3.99, cottage_cheese: 1.69,
      american_cheese: 5.49, shredded_cheese: 3.99, sourcream: 1.99,
    },
    produce: {}, deli: {},
  },
  // 661 — New York City, My Cloud Grocer (full scrape)
  six60one: {
    chicken: {
      whole_chicken: 4.49, cut_in_8: 4.49, drumsticks: 4.99, legs: 3.59, thighs: 3.99,
      cutlets: 9.99, thin_cutlets: 12.99, pargiyot: 9.99, wings: 2.49, ground_chicken: 9.99,
    },
    beef: {
      ground_beef: 9.99, extra_lean: 11.99, patties: 11.99, sliders: 11.99, stew: 14.99,
      london_broil: 16.99, rib_steak: 34.99, flanken: 14.99, brisket: 14.99,
    },
    dairy: {
      eggs: 1.49, milk: 3.79, butter: 3.59, cream_cheese: 4.29, cottage_cheese: 4.49,
      american_cheese: 6.49, shredded_cheese: 4.49, sourcream: 3.49, yogurt: 0.79,
    },
    produce: {}, deli: {},
  },
  // The Kosher Marketplace — Manhattan (Shopify). Premium marketplace. Meat is
  // sold per PACKAGE (no weights listed); cut items are ~1 lb so shown as an
  // approximate per-lb — KMP runs premium, so it's usually the priciest. Whole
  // items (turkey, whole brisket, leg quarters) are excluded (clearly multi-lb).
  kmp: {
    chicken: {
      whole_chicken: 6.49, cut_in_8: 6.49, legs: 6.99,
      drumsticks: 6.99, thighs: 13.99, cutlets: 14.99, thin_cutlets: 15.99,
      wings: 7.99, ground_chicken: 13.99,
    },
    beef: {
      ground_beef: 16.99, patties: 16.99, sliders: 16.99, stew: 29.99,
      rib_steak: 32.99, flanken: 37.99,
    },
    dairy: {
      eggs: 6.99, cream_cheese: 3.99, cottage_cheese: 8.99, american_cheese: 10.99,
      shredded_cheese: 7.99, sourcream: 6.99, yogurt: 7.99,
    },
    produce: {}, deli: {},
  },
};

export const unitOf = (categoryKey: string): Unit =>
  CATEGORIES.find((c) => c.key === categoryKey)?.unit ?? 'lb';

export const money = (n: number): string => `$${n.toFixed(2)}`;
export const unitSuffix = (u: Unit): string => (u === 'lb' ? '/lb' : '');

// When the price table was last refreshed (hand-copied from the scraper run).
// Shown to the user so stale data is honest, not hidden.
export const PRICES_UPDATED = 'Jul 30, 2026';

// Look up an item's display label + unit from its category + id.
export function itemMeta(cat: string, id: string): { label: string; unit: Unit } | null {
  const c = CATEGORIES.find((x) => x.key === cat);
  const it = c?.items.find((i) => i.id === id);
  return c && it ? { label: it.label, unit: c.unit } : null;
}

// Stores that price meat BY THE PACKAGE, not per pound (premium butchers). Their
// meat price is shown for reference (tagged "pkg") but never mixed into a per-lb
// comparison — a $13.99 package isn't $13.99/lb. Only affects lb categories.
const PACKAGE_PRICED = new Set(['kmp']);
export const isPackagePriced = (storeId: string, cat: string): boolean =>
  PACKAGE_PRICED.has(storeId) && unitOf(cat) === 'lb';

export function priceOf(storeId: string, cat: string, item: string): number | null {
  return PRICES[storeId]?.[cat]?.[item] ?? null;
}

// Cheapest listed item at a store (across all categories) — for Nearby/Home hints.
export function cheapestAt(storeId: string): { label: string; price: number; unit: Unit } | null {
  const sp = PRICES[storeId];
  if (!sp) return null;
  let best: { label: string; price: number; unit: Unit } | null = null;
  for (const cat of CATEGORIES) {
    const map = sp[cat.key];
    if (!map) continue;
    for (const it of cat.items) {
      const p = map[it.id];
      if (p != null && (!best || p < best.price)) best = { label: it.label, price: p, unit: cat.unit };
    }
  }
  return best;
}

export interface StoreRank {
  storeId: string;
  itemLabel: string;
  price: number;
  unit: Unit;
  itemCount: number;
}

// For a category, each store's cheapest item + how many items it lists, ranked cheapest-first.
export function rankForCategory(catKey: string, storeIds: string[]): StoreRank[] {
  const cat = CATEGORIES.find((c) => c.key === catKey);
  if (!cat) return [];
  const rows: StoreRank[] = [];
  for (const sid of storeIds) {
    const map = PRICES[sid]?.[catKey];
    if (!map) continue;
    let best: { itemLabel: string; price: number } | null = null;
    let count = 0;
    for (const it of cat.items) {
      const p = map[it.id];
      if (p == null) continue;
      count++;
      if (!best || p < best.price) best = { itemLabel: it.label, price: p };
    }
    if (best) rows.push({ storeId: sid, itemLabel: best.itemLabel, price: best.price, unit: cat.unit, itemCount: count });
  }
  return rows.sort((a, b) => a.price - b.price);
}

export interface CategoryLow {
  catKey: string;
  catLabel: string;
  emoji: string;
  itemLabel: string;
  price: number;
  unit: Unit;
}

// Each category's cheapest item at a store, sorted cheapest-first.
export function categoryLows(storeId: string): CategoryLow[] {
  const sp = PRICES[storeId];
  if (!sp) return [];
  const rows: CategoryLow[] = [];
  for (const cat of CATEGORIES) {
    const map = sp[cat.key];
    if (!map) continue;
    let best: { itemLabel: string; price: number } | null = null;
    for (const it of cat.items) {
      const p = map[it.id];
      if (p != null && (!best || p < best.price)) best = { itemLabel: it.label, price: p };
    }
    if (best) {
      rows.push({
        catKey: cat.key,
        catLabel: cat.label,
        emoji: cat.emoji,
        itemLabel: best.itemLabel,
        price: best.price,
        unit: cat.unit,
      });
    }
  }
  return rows.sort((a, b) => a.price - b.price);
}

export const hasPrices = (storeId: string): boolean =>
  !!PRICES[storeId] && CATEGORIES.some((c) => Object.keys(PRICES[storeId][c.key] ?? {}).length > 0);
