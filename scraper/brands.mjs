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
    accept: ['sour cream'],
    reject: ['dip', 'coffee cake', 'noodle'],
    brands: {
      breakstone: "Breakstone's", friendship: 'Friendship', tuscan: 'Tuscan',
      norman: "Norman's", axelrod: 'Axelrod', daisy: 'Daisy', mehadrin: 'Mehadrin', givat: 'Givat',
    },
    variants: ['light', 'reduced fat', 'nonfat', 'low fat'],
  },
  cottage_cheese: {
    accept: ['cottage cheese'],
    reject: ['dip'],
    brands: {
      breakstone: "Breakstone's", friendship: 'Friendship', axelrod: 'Axelrod',
      norman: "Norman's", mehadrin: 'Mehadrin', 'muller': 'Muller', daisy: 'Daisy',
    },
    variants: ['low fat', 'nonfat', 'whipped', 'small curd', 'pineapple'],
  },
  american_cheese: {
    accept: ['american cheese', 'american slice', 'american singles'],
    reject: ['sandwich', 'burger'],
    brands: {
      haolam: 'Haolam', "ha'olam": 'Haolam', migdal: 'Migdal', miller: "Miller's",
      norman: "Norman's", "j&j": 'J&J', 'j & j': 'J&J', 'les petites': 'Les Petites', kraft: 'Kraft',
    },
    variants: ['white', 'yellow', 'low fat', 'nonfat'],
  },
  yogurt: {
    accept: ['yogurt', 'yoghurt'],
    reject: ['drink', 'smoothie', 'bar', 'covered', 'raisins', 'pretzel'],
    brands: {
      chobani: 'Chobani', 'dannon': 'Dannon', norman: "Norman's", "yo crunch": 'YoCrunch',
      mehadrin: 'Mehadrin', 'la yogurt': 'La Yogurt', fage: 'Fage', 'oikos': 'Oikos', 'stonyfield': 'Stonyfield',
    },
    variants: ['greek', 'nonfat', 'low fat', 'vanilla', 'plain', 'strawberry'],
  },
  milk: {
    accept: ['milk'],
    reject: ['chocolate milk', 'coconut', 'almond', 'oat', 'soy', 'condensed', 'evaporated', 'powder', 'shake'],
    brands: {
      tuscan: 'Tuscan', 'golden flow': 'Golden Flow', mehadrin: 'Mehadrin', ahava: 'Ahava',
      'pride of the farm': 'Pride of the Farm', lactaid: 'Lactaid', norman: "Norman's",
    },
    variants: ['whole', 'skim', '1%', '2%', 'reduced fat', 'lactose free'],
  },
  eggs: {
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

// Parse one catalog product against an item spec.
// → null when it isn't this item / is junk.
// → { brand, size, variant, price, name, confident } otherwise.
export function parseProduct(product, spec) {
  const name = norm(product.n);
  if (!spec.accept.some((a) => name.includes(a))) return null;
  if (spec.reject.some((r) => name.includes(r))) return null; // junk / wrong product
  const sizeM = name.match(SIZE_RE);
  const size = sizeM ? `${sizeM[1]} ${sizeM[2].toLowerCase()}` : null;
  let brand = null;
  for (const [alias, canon] of Object.entries(spec.brands)) {
    if (name.includes(alias)) {
      brand = canon;
      break;
    }
  }
  const variant = spec.variants.find((v) => name.includes(v)) || null;
  const confident = !!(brand && size); // matched only when brand AND size are known
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
          const key = `${p.brand}|${p.size}|${p.variant || ''}`;
          let row = rowMap.get(key);
          if (!row) {
            row = { brand: p.brand, size: p.size, variant: p.variant, prices: {} };
            rowMap.set(key, row);
          }
          // keep the cheapest instance of this exact product at this store
          if (row.prices[storeId] == null || p.price < row.prices[storeId]) row.prices[storeId] = p.price;
          if (from[storeId] == null || p.price < from[storeId]) from[storeId] = p.price;
        }
      }
      // Cap each store's "other" list so the feed stays compact.
      for (const sid of Object.keys(other)) {
        other[sid] = other[sid].sort((a, b) => a.price - b.price).slice(0, 8);
      }
      const rows = [...rowMap.values()].sort((a, b) => a.brand.localeCompare(b.brand) || (a.size || '').localeCompare(b.size || ''));
      if (rows.length || Object.keys(other).length) out[area][itemId] = { from, rows, other };
    }
  }
  return out;
}
