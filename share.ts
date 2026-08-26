// Share a shopping list with family — no backend. We send a plain, readable
// text list (so anyone can just read what to buy) with a compact code appended
// that the app can import back into a real list.

import { BasketItem } from './presets';
import { CATEGORIES } from './prices';

export interface SharedList {
  label: string;
  emoji: string;
  items: BasketItem[];
}

const PREFIX = 'kc1:';

// Compact, URL-safe payload (no base64 needed — Hermes lacks btoa).
export function encodeList(l: SharedList): string {
  const payload = { l: l.label, e: l.emoji, i: l.items.map((x) => [x.cat, x.id]) };
  return PREFIX + encodeURIComponent(JSON.stringify(payload));
}

export function decodeList(text: string): SharedList | null {
  const m = text.match(/kc1:([^\s]+)/);
  if (!m) return null;
  try {
    const o = JSON.parse(decodeURIComponent(m[1]));
    if (!o || !Array.isArray(o.i)) return null;
    return {
      label: typeof o.l === 'string' ? o.l : 'Shared list',
      emoji: typeof o.e === 'string' ? o.e : '🛒',
      items: o.i
        .filter((a: unknown) => Array.isArray(a) && a.length === 2)
        .map((a: [string, string]) => ({ cat: a[0], id: a[1] })),
    };
  } catch {
    return null;
  }
}

// --- Plain-text list import -------------------------------------------------
// Let people paste or type a normal shopping list (one item per line, or
// comma-separated) and pull in whatever koshercart tracks — no share code
// needed. Common shorthand maps to a specific item; anything we don't track is
// reported back so the person knows what didn't come in.

const ALIASES: Record<string, { cat: string; id: string }> = {
  chicken: { cat: 'chicken', id: 'cutlets' },
  'chicken breast': { cat: 'chicken', id: 'cutlets' },
  cutlet: { cat: 'chicken', id: 'cutlets' },
  'chicken cutlet': { cat: 'chicken', id: 'cutlets' },
  wings: { cat: 'chicken', id: 'wings' },
  drumsticks: { cat: 'chicken', id: 'drumsticks' },
  'whole chicken': { cat: 'chicken', id: 'whole_chicken' },
  'ground chicken': { cat: 'chicken', id: 'ground_chicken' },
  pargiyot: { cat: 'chicken', id: 'pargiyot' },
  steak: { cat: 'beef', id: 'rib_steak' },
  'minute steak': { cat: 'beef', id: 'london_broil' },
  'london broil': { cat: 'beef', id: 'london_broil' },
  'ground beef': { cat: 'beef', id: 'ground_beef' },
  'chopped meat': { cat: 'beef', id: 'ground_beef' },
  beef: { cat: 'beef', id: 'ground_beef' },
  burgers: { cat: 'beef', id: 'patties' },
  hamburgers: { cat: 'beef', id: 'patties' },
  patties: { cat: 'beef', id: 'patties' },
  sliders: { cat: 'beef', id: 'sliders' },
  brisket: { cat: 'beef', id: 'brisket' },
  flanken: { cat: 'beef', id: 'flanken' },
  'stew meat': { cat: 'beef', id: 'stew' },
  cholent: { cat: 'beef', id: 'stew' },
  'hot dogs': { cat: 'beef', id: 'hotdogs' },
  hotdogs: { cat: 'beef', id: 'hotdogs' },
  franks: { cat: 'beef', id: 'hotdogs' },
  egg: { cat: 'dairy', id: 'eggs' },
  eggs: { cat: 'dairy', id: 'eggs' },
  milk: { cat: 'dairy', id: 'milk' },
  butter: { cat: 'dairy', id: 'butter' },
  'cream cheese': { cat: 'dairy', id: 'cream_cheese' },
  'cottage cheese': { cat: 'dairy', id: 'cottage_cheese' },
  'american cheese': { cat: 'dairy', id: 'american_cheese' },
  cheese: { cat: 'dairy', id: 'american_cheese' },
  'shredded cheese': { cat: 'dairy', id: 'shredded_cheese' },
  mozzarella: { cat: 'dairy', id: 'shredded_cheese' },
  'sour cream': { cat: 'dairy', id: 'sourcream' },
  yogurt: { cat: 'dairy', id: 'yogurt' },
  yogurts: { cat: 'dairy', id: 'yogurt' },
  ketchup: { cat: 'pantry', id: 'ketchup' },
  mayo: { cat: 'pantry', id: 'mayonnaise' },
  mayonnaise: { cat: 'pantry', id: 'mayonnaise' },
  croutons: { cat: 'pantry', id: 'croutons' },
  pasta: { cat: 'pantry', id: 'pasta' },
  spaghetti: { cat: 'pantry', id: 'pasta' },
  noodles: { cat: 'pantry', id: 'pasta' },
  'olive oil': { cat: 'pantry', id: 'olive_oil' },
  oil: { cat: 'pantry', id: 'olive_oil' },
  tuna: { cat: 'pantry', id: 'tuna' },
  flour: { cat: 'pantry', id: 'flour' },
  rice: { cat: 'pantry', id: 'rice' },
  honey: { cat: 'pantry', id: 'honey' },
  chips: { cat: 'snacks', id: 'potato_chips' },
  'potato chips': { cat: 'snacks', id: 'potato_chips' },
  'tortilla chips': { cat: 'snacks', id: 'tortilla_chips' },
  pretzels: { cat: 'snacks', id: 'pretzels' },
  pretzel: { cat: 'snacks', id: 'pretzels' },
  popcorn: { cat: 'snacks', id: 'popcorn' },
  cookies: { cat: 'snacks', id: 'cookies' },
  cookie: { cat: 'snacks', id: 'cookies' },
  crackers: { cat: 'snacks', id: 'crackers' },
  cereal: { cat: 'snacks', id: 'cereal' },
  bissli: { cat: 'snacks', id: 'bissli' },
  bamba: { cat: 'snacks', id: 'bamba' },
  'rice cakes': { cat: 'snacks', id: 'rice_cakes' },
};

// label/alias → {cat,id}, built once from the live item set + the shorthand above.
let ITEM_INDEX: Map<string, BasketItem> | null = null;
function itemIndex(): Map<string, BasketItem> {
  if (ITEM_INDEX) return ITEM_INDEX;
  const idx = new Map<string, BasketItem>();
  const put = (key: string, cat: string, id: string) => {
    const k = key.toLowerCase().trim();
    if (k.length >= 2 && !idx.has(k)) idx.set(k, { cat, id });
  };
  for (const c of CATEGORIES) {
    for (const it of c.items) {
      put(it.label, c.key, it.id);
      // drop parentheticals/sizes so "Milk (½ gal)" also matches "milk"
      put(it.label.replace(/\(.*?\)/g, '').replace(/[½¼\d.]+\s*(gal|oz|lb|dozen)/gi, '').trim(), c.key, it.id);
    }
  }
  for (const [k, v] of Object.entries(ALIASES)) put(k, v.cat, v.id);
  ITEM_INDEX = idx;
  return idx;
}

export interface ParsedTextList {
  items: BasketItem[];
  matched: string[]; // human labels we added
  unmatched: string[]; // lines we couldn't place
}

// Turn a free-typed / pasted shopping list into real items. Ignores blank lines,
// bullets, quantities, prices, and the koshercart invite/URL boilerplate.
export function parseTextList(text: string): ParsedTextList {
  const idx = itemIndex();
  const labelFor = (bi: BasketItem): string => {
    const cat = CATEGORIES.find((c) => c.key === bi.cat);
    return cat?.items.find((i) => i.id === bi.id)?.label ?? bi.id;
  };
  const items: BasketItem[] = [];
  const matched: string[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/[\n,;]+/)) {
    const original = rawLine.trim();
    if (!original) continue;
    // skip koshercart's own share/invite boilerplate lines
    if (/koshercart|get the app|https?:\/\/|import a list|shopping list|kc1:|📲|🏪|—\s*have/i.test(original)) continue;
    let line = original
      .toLowerCase()
      .replace(/^[-*•▪◦•.\)\]\[\s\d]+/, '') // leading bullets / numbering
      .replace(/\b\d+\s*(x|lbs?|oz|dozen|doz|pk|packs?|cts?|cans?|bunch)\b/g, '') // quantities
      .replace(/\bx\s*\d+\b/g, '')
      .replace(/\$\s*\d[\d.]*/g, '') // prices
      .replace(/\s+/g, ' ')
      .trim();
    if (line.length < 2) continue;
    let hit = idx.get(line);
    if (!hit) {
      // fuzzy: the line contains a known key, or a key contains the line
      let best = '';
      for (const k of idx.keys()) {
        if (k.length < 3) continue;
        if (line === k || line.includes(k) || (line.length >= 4 && k.includes(line))) {
          if (k.length > best.length) best = k; // prefer the most specific match
        }
      }
      if (best) hit = idx.get(best);
    }
    if (hit) {
      const key = `${hit.cat}/${hit.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(hit);
        matched.push(labelFor(hit));
      }
    } else {
      unmatched.push(original);
    }
  }
  return { items, matched, unmatched };
}

// Where friends without the app can get it. Swap in the App Store / Play links
// at launch — the invite line drives installs.
export const APP_URL = 'https://zkassai17.github.io/kosher-cut-app/';

// The message that gets shared (iMessage/WhatsApp/email) — a clean, readable
// shopping list anyone can follow, led by which store to go to. When `code` is
// provided (an encodeList payload), friends who already have koshercart can
// import it; everyone else gets a link to get the app.
export function shareText(opts: {
  label: string;
  emoji: string;
  storeLine?: string; // e.g. "Cheapest at Grand & Essex — about $38.75"
  itemLabels: string[];
  code?: string; // encodeList(...) payload, so the app can import the list
}): string {
  const { label, emoji, storeLine, itemLabels, code } = opts;
  const lines = itemLabels.length ? itemLabels.map((n) => `• ${n}`).join('\n') : '(no items yet)';
  const store = storeLine ? `🏪 ${storeLine}\n\n` : '';
  const invite = `\n\n📲 Sent with koshercart — compare kosher grocery prices near you.\nGet the app: ${APP_URL}`;
  const importCode = code ? `\n\n— have koshercart? open it → Import a list → paste this —\n${code}` : '';
  return `${emoji} ${label} — shopping list\n\n${store}${lines}${invite}${importCode}`;
}
