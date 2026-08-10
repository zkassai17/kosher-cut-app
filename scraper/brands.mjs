// Turn messy catalog product names into clean, confident brand+size matches.
// Feeds the app's Prices brand drill-down and brand-named Deals.
//
// The core promise: only a product we can confidently identify (known BRAND +
// parsed SIZE) becomes a matched, cross-store comparison. Everything else drops
// into a per-store "other" bucket — never a guessed comparison. Junk (pastries,
// dips, etc.) is rejected outright.

export const SIZE_RE = /(\d+(?:\.\d+)?)\s*(oz|lb|ct|pk|gal|qt)\b/i;

// Per curated item: what counts (accept), what's junk (reject), the brand canon
// ("big brands people buy" — design decision C, with spelling aliases), and
// variant tags that are part of a product's identity (regular ≠ whipped).
export const SPECS = {
  cream_cheese: {
    maxPrice: 13,
    accept: ['cream cheese'],
    reject: ['rugelach', 'croissant', 'frosting', 'cake', 'danish', 'babka', 'rilled', 'stuffed', 'sandwich'],
    brands: {
      philadelphia: 'Philadelphia', philly: 'Philadelphia', 'j&j': 'J&J', 'j & j': 'J&J',
      'temp tee': 'Temp Tee', temptee: 'Temp Tee', 'temp-tee': 'Temp Tee', breakstone: "Breakstone's",
      norman: "Norman's", givat: 'Givat', kraft: 'Kraft', mehadrin: 'Mehadrin', tofutti: 'Tofutti', friendship: 'Friendship',
    },
    variants: ['whipped', 'parve', 'reduced fat', 'light', 'chives', 'onion', 'scallion'],
  },
  sourcream: {
    maxPrice: 10,
    accept: ['sour cream'],
    reject: ['dip', 'coffee cake', 'noodle'],
    brands: {
      breakstone: "Breakstone's", friendship: 'Friendship', tuscan: 'Tuscan',
      norman: "Norman's", axelrod: 'Axelrod', daisy: 'Daisy', mehadrin: 'Mehadrin', givat: 'Givat',
    },
    variants: ['light', 'reduced fat', 'nonfat', 'low fat'],
  },
  cottage_cheese: {
    maxPrice: 12,
    accept: ['cottage cheese'],
    reject: ['dip'],
    brands: {
      breakstone: "Breakstone's", friendship: 'Friendship', axelrod: 'Axelrod',
      norman: "Norman's", mehadrin: 'Mehadrin', 'muller': 'Muller', daisy: 'Daisy',
    },
    variants: ['low fat', 'nonfat', 'whipped', 'small curd', 'pineapple'],
  },
  american_cheese: {
    maxPrice: 16,
    accept: ['american cheese', 'american slice', 'american singles'],
    reject: ['sandwich', 'burger'],
    brands: {
      haolam: 'Haolam', "ha'olam": 'Haolam', migdal: 'Migdal', miller: "Miller's",
      norman: "Norman's", "j&j": 'J&J', 'j & j': 'J&J', 'les petites': 'Les Petites', kraft: 'Kraft',
    },
    variants: ['white', 'yellow', 'low fat', 'nonfat'],
  },
  yogurt: {
    maxPrice: 12,
    accept: ['yogurt', 'yoghurt'],
    reject: ['drink', 'smoothie', 'bar', 'covered', 'raisins', 'pretzel'],
    brands: {
      chobani: 'Chobani', 'dannon': 'Dannon', norman: "Norman's", "yo crunch": 'YoCrunch',
      mehadrin: 'Mehadrin', 'la yogurt': 'La Yogurt', fage: 'Fage', 'oikos': 'Oikos', 'stonyfield': 'Stonyfield',
    },
    variants: ['greek', 'nonfat', 'low fat', 'vanilla', 'plain', 'strawberry'],
  },
  milk: {
    maxPrice: 10,
    core: 'milk', // must actually END in "milk" — not "milk chocolate" / "whole milk yogurt"
    accept: ['milk'],
    // "milk" shows up in candy ("Klik Creamy Milk"), flavored drinks, nut milks,
    // cheese ("whole milk ricotta"), soap, creamers. Keep only drinking cow's milk.
    reject: [
      'chocolate', 'cocoa', 'candy', 'bar', 'wafer', 'chip', 'soap', 'honey', 'cereal', 'cookie', 'snack', 'treat',
      'powder', 'shake', 'milky', 'buttermilk', 'coconut', 'almond', 'oat', 'soy', 'rice', 'cashew', 'walnut', 'pistachio', 'nut', 'goat',
      'condensed', 'evaporated', 'creamer', 'creamy', 'coffee', 'ice cream', 'pudding', 'formula', 'spread', 'straw', 'magic', 'drink',
      'nesquik', 'strawberry', 'vanilla', 'minor', 'stick', 'biscuit', 'cornflake', 'kariot', 'crisp', 'coated', 'pillow', 'lait', 'split', 'swiss',
      'ricotta', 'mozzarella', 'cheese', 'milked', 'silk', 'oatly', 'califia', 'lactose free milk',
    ],
    // Brands that make candy/cheese/non-dairy, never drinking milk.
    blockBrands: ['Klik', 'Schmerling', "Schmerling's", 'Nestle', 'Elmhurst', 'Galbani', 'Ripple', 'Tofutti', 'Vered', 'Paskesz', 'Nesquik', 'Silk', 'Oatly', 'Califia', 'Cherub'],
    brands: {
      tuscan: 'Tuscan', 'golden flow': 'Golden Flow', mehadrin: 'Mehadrin', ahava: 'Ahava',
      'pride of the farm': 'Pride of the Farm', lactaid: 'Lactaid', norman: "Norman's",
    },
    variants: ['whole', 'skim', '1%', '2%', 'reduced fat', 'lactose free'],
  },
  eggs: {
    maxPrice: 12,
    accept: ['eggs'],
    reject: ['egg roll', 'egg noodle', 'salad', 'substitute', 'whites only', 'liquid'],
    brands: {
      'wilder': 'Wilder', 'eggland': "Eggland's", 'nest fresh': 'NestFresh',
      'gold hen': 'Gold Hen', mehadrin: 'Mehadrin',
    },
    variants: ['large', 'extra large', 'jumbo', 'organic', 'brown', 'cage free'],
  },
};

const norm = (s) => (s || '').toLowerCase();

// True when the product's core noun is `core` (e.g. milk): strip trailing
// size/fat/packaging words and require the last real word to be `core`. This is
// how we tell "Golden Flow Whole Milk" (real) from "Whole Milk Mozzarella",
// "Whole Milk Yogurt", or "Milk Chocolate" (the word milk is just a modifier).
const TAIL_STRIP = new Set([
  'whole', 'skim', 'lowfat', 'low', 'fat', 'reduced', 'fatfree', 'lactose', 'free', 'half', 'gallon', 'gal', 'quart', 'qt',
  'oz', 'fl', 'pt', 'pint', 'pasteurized', 'organic', 'vitamin', 'd', 'a', 'of', 'the', 'container', 'carton', 'jug', 'bottle',
  'plus', 'ultra', 'filtered', 'grass', 'fed', 'natural', 'kosher', 'chalav', 'yisroel', 'cholov', '1', '2', '',
]);
function coreNounIs(name, core) {
  let w = norm(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+(\.\d+)?\s*(oz|lb|gal|gallon|qt|quart|ct|pk|fl|%|pt|pint)/g, ' ')
    .replace(/[^a-z& ]/g, ' ');
  const words = w.split(/\s+/).filter(Boolean);
  while (words.length && TAIL_STRIP.has(words[words.length - 1])) words.pop();
  return words[words.length - 1] === core;
}

// Words that are never a brand — item terms, variants, sizes, descriptors. Used
// by extractBrand to find where the brand ends.
const STOP = new Set([
  'cream', 'cheese', 'sour', 'cottage', 'american', 'yogurt', 'yoghurt', 'milk', 'egg', 'eggs',
  'spread', 'slice', 'sliced', 'slices', 'single', 'singles', 'whip', 'whipped', 'block', 'bar', 'cup', 'cups', 'stick', 'sticks', 'tub',
  'parve', 'pareve', 'dairy', 'nonfat', 'non', 'fat', 'lowfat', 'low', 'reduced', 'light', 'lite', 'whole', 'skim', 'fatfree', 'skimmed',
  'organic', 'plain', 'greek', 'original', 'natural', 'fresh', 'kosher', 'pasteurized', 'imitation', 'free', 'gluten', 'the', 'of', 'and', 'with', 'in',
  'extra', 'mini', 'kids', 'kid', 'family', 'value', 'style', 'classic', 'simply', 'farm', 'farms', 'pack', 'count', 'large', 'small', 'curd', 'white', 'yellow',
  'chalav', 'yisroel', 'cholov', 'vanilla', 'strawberry', 'coffee', 'berry', 'blueberry', 'peach', 'banana', 'chocolate', 'flavored', 'chive', 'chives', 'onion', 'scallion',
]);

// Multi-word brands to keep intact (checked as a phrase before single-token fallback).
const MULTIWORD = [
  'good culture', 'temp tee', 'golden flow', 'pride of the farm', 'bowl & basket', 'la yogurt', 'kite hill', 'les petites', 'so delicious',
];

const TITLE = (s) => s.replace(/\w[\w'&]*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

// Acronym/odd-case brands that TITLE would mangle — normalized after extraction.
const GLOBAL_ALIASES = { 'j&j': 'J&J', 'j & j': 'J&J', jj: 'J&J', 'b&b': 'B&B' };

// Pull the brand out of a messy product name: a known multi-word brand, else the
// leading token(s) before the first item/descriptor/size word. Returns null when
// the name starts with a non-brand word (generic/unbranded).
function extractBrand(rawName) {
  const lower = norm(rawName);
  for (const mw of MULTIWORD) if (lower.includes(mw)) return TITLE(mw);
  for (const w of rawName.replace(/[,]/g, ' ').split(/\s+/)) {
    const lw = w.toLowerCase().replace(/[^a-z0-9%&']/g, '');
    if (!lw) continue;
    if (STOP.has(lw) || /\d/.test(lw) || lw.length === 1) return null; // starts generic → unbranded
    return GLOBAL_ALIASES[lw] || TITLE(w.replace(/[.,]/g, '')); // first real token is the brand
  }
  return null;
}

// Parse one catalog product against an item spec.
// → null when it isn't this item / is junk.
// → { brand, size, variant, price, name, confident } otherwise.
export function parseProduct(product, spec) {
  const name = norm(product.n);
  if (!spec.accept.some((a) => name.includes(a))) return null;
  if (spec.reject.some((r) => name.includes(r))) return null; // junk / wrong product
  if (spec.core && !coreNounIs(product.n, spec.core)) return null; // "milk" is just a modifier here
  if (spec.maxPrice && product.p > spec.maxPrice) return null; // bulk / catering size — not a shopper comparison
  const sizeM = name.match(SIZE_RE);
  const size = sizeM ? `${sizeM[1]} ${sizeM[2].toLowerCase()}` : null;
  // Known alias first (canonical spelling + cross-store normalization), else
  // auto-extract the brand so long-tail brands still become comparison rows.
  let brand = null;
  for (const [alias, canon] of Object.entries(spec.brands)) {
    if (name.includes(alias)) {
      brand = canon;
      break;
    }
  }
  if (!brand) brand = extractBrand(product.n);
  if (brand && spec.blockBrands && spec.blockBrands.some((b) => b.toLowerCase() === brand.toLowerCase())) return null; // non-milk brand
  const variant = spec.variants.find((v) => name.includes(v)) || null;
  // Match on BRAND (+ regular/whipped variant). Size is often missing from a
  // store's product names, so we don't require it — we record it when present
  // and the UI flags when two stores' sizes differ. Unknown brand → not matched.
  const confident = !!brand;
  return { brand, size, variant, price: product.p, name: product.n, confident };
}

// Build the per-area brand comparison from a full catalog.
// areaStores: { areaId: [storeId, ...] }
// → { areaId: { itemId: { from, rows, other } } }
export function computeBrands(catalog, areaStores) {
  const out = {};
  for (const [area, storeIds] of Object.entries(areaStores)) {
    out[area] = {};
    for (const [itemId, spec] of Object.entries(SPECS)) {
      const rowMap = new Map(); // "brand|size|variant" → { brand, size, variant, prices }
      const other = {}; // storeId → [{ name, price }]
      const from = {}; // storeId → cheapest confident price
      for (const storeId of storeIds) {
        for (const product of catalog[storeId] || []) {
          const p = parseProduct(product, spec);
          if (!p) continue;
          if (!p.confident) {
            (other[storeId] ||= []).push({ name: p.name, price: p.price });
            continue;
          }
          const key = `${p.brand}|${p.variant || ''}`;
          let row = rowMap.get(key);
          if (!row) {
            row = { brand: p.brand, variant: p.variant, prices: {}, sizes: {} };
            rowMap.set(key, row);
          }
          // keep the cheapest instance of this brand+variant at this store, and
          // remember that instance's size (may be null) so the UI can show it.
          if (row.prices[storeId] == null || p.price < row.prices[storeId]) {
            row.prices[storeId] = p.price;
            row.sizes[storeId] = p.size;
          }
          if (from[storeId] == null || p.price < from[storeId]) from[storeId] = p.price;
        }
      }
      // Cap each store's "other" list so the feed stays compact.
      for (const sid of Object.keys(other)) {
        other[sid] = other[sid].sort((a, b) => a.price - b.price).slice(0, 8);
      }
      // Flag a row where a straight price comparison could mislead: two stores
      // list different known sizes, or their prices diverge enough (>1.8x) to
      // smell like a size difference. The app shows a "sizes differ" note and
      // does not crown a cheaper winner on these.
      for (const row of rowMap.values()) {
        const sizes = new Set(Object.values(row.sizes).filter(Boolean));
        const prices = Object.values(row.prices);
        const ratio = prices.length > 1 ? Math.max(...prices) / Math.min(...prices) : 1;
        row.sizeWarn = sizes.size > 1 || ratio > 1.8;
      }
      // Rows priced at more stores lead (real head-to-heads first), then by brand.
      const nStores = (r) => Object.keys(r.prices).length;
      const rows = [...rowMap.values()].sort(
        (a, b) => nStores(b) - nStores(a) || a.brand.localeCompare(b.brand) || (a.variant || '').localeCompare(b.variant || '')
      );
      if (rows.length || Object.keys(other).length) out[area][itemId] = { from, rows, other };
    }
  }
  return out;
}
