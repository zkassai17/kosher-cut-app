# Brand-level prices + shop-by-store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add brand-level price comparison (matched cross-store), brand-named deals, and a "1 store vs Split" list toggle to koshercart.

**Architecture:** A new scraper module (`scraper/brands.mjs`) parses the messy catalog into confident brand+size matches per area, baked into the daily feed as a `brands` block. The app reads it via thin `catalog.ts` accessors and renders three UI surfaces. Pure logic (matcher, list-grouping) is unit-tested; UI is verified by `tsc --noEmit` + a 200 bundle + visual check in Expo Go.

**Tech Stack:** Expo/React Native + TypeScript (app), Node ESM `.mjs` (scraper), `node --test` (scraper unit tests). No jest — do NOT add one.

**Verification primitives (used throughout):**
- Typecheck: `cd ~/kosher-cut-app && npx tsc --noEmit` → expect no output (clean).
- Bundle: `curl -s -o /dev/null -w "%{http_code}" "http://localhost:8090/index.bundle?platform=ios&dev=true"` → expect `200`.
- Scraper tests: `cd ~/kosher-cut-app/scraper && node --test` → expect all pass.
- Visual: reload Expo Go on the tunnel, confirm the surface described.

**Area → compared stores (from `stores.ts`):** teaneck=[ge, gl] (+cedar byRequest), fivetowns=[gourmetglatt, seasons_law], manhattan=[six60one, kmp], lakewood=[superstop]. Brand data is richest for fivetowns/teaneck dairy.

---

## File structure

| File | Responsibility | Create/Modify |
|---|---|---|
| `scraper/brands.mjs` | Parse catalog → confident brand+size matches per area/item; export `computeBrands(catalog)` | Create |
| `scraper/brands.test.mjs` | `node --test` unit tests for parsing/matching | Create |
| `scraper/catalog.mjs` | Call `computeBrands`, write `brands` into feed | Modify (feed-write section) |
| `catalog.ts` | `setBrands()` sink + `brandsFor(area,item)` / `brandFromPrice()` readers | Modify |
| `datactx.tsx` | Call `setBrands(data.brands)` in `apply()` | Modify |
| `data.ts` | `groupByStore()` pure helper for the List Split view | Modify |
| `components.tsx` | `BrandTable` (expanded row), extend `CompareRow` to expand; deals brand label | Modify |
| `screens.tsx` | Prices: tappable rows + BrandTable; List: 1-store/Split toggle | Modify |

---

## PHASE 1 — List "1 store vs Split" toggle (independent, no matcher)

Ships value first. Uses existing `basketTotals()` output (`cheapest`, `splitTotal`, `splitSavings`, and each line's `cheapestIdx`).

### Task 1: `groupByStore()` pure helper in `data.ts`

**Files:**
- Modify: `data.ts` (add after `basketTotals`)

- [ ] **Step 1: Add the helper.** Groups priced lines under the store that's cheapest for each line, with per-store subtotals. Reuses `BasketLine` + `StoreId` names already exported.

```ts
export interface StoreGroup {
  storeId: string;
  lines: { line: BasketLine; unitPrice: number }[];
  subtotal: number; // sum(unitPrice * qty)
}

// Split plan: put each list item under its cheapest store. Lines with no price
// anywhere are returned separately so the UI can show them as "not found".
export function groupByStore(result: BasketResult, storeIds: string[]): {
  groups: StoreGroup[];
  unpriced: BasketLine[];
} {
  const byStore = new Map<string, StoreGroup>();
  const unpriced: BasketLine[] = [];
  for (const line of result.lines) {
    if (line.cheapestIdx < 0) { unpriced.push(line); continue; }
    const storeId = storeIds[line.cheapestIdx];
    const unitPrice = line.prices[line.cheapestIdx] as number;
    if (!byStore.has(storeId)) byStore.set(storeId, { storeId, lines: [], subtotal: 0 });
    const g = byStore.get(storeId)!;
    g.lines.push({ line, unitPrice });
    g.subtotal += unitPrice * line.qty;
  }
  const groups = [...byStore.values()].sort((a, b) => b.subtotal - a.subtotal);
  return { groups, unpriced };
}
```

- [ ] **Step 2: Typecheck.** Run the typecheck primitive. Expected: clean.

- [ ] **Step 3: Sanity-test the pure helper with `node --test`.** Create `scraper/../` is wrong location; instead add a temporary check via a throwaway ts is overkill. Skip a formal unit test here (helper is trivial and TS-only with no runner); it is covered by the visual check in Task 2 and by typecheck. Proceed.

- [ ] **Step 4: Commit.**
```bash
git add data.ts && git commit -m "feat(list): groupByStore helper for split-by-store view"
```

### Task 2: List toggle UI in `screens.tsx`

**Files:**
- Modify: `screens.tsx` (ListScreen) — add a 2-option segmented toggle above the list; Modify: `components.tsx` if a small `SegToggle` is needed (reuse existing pill styling).

- [ ] **Step 1: Add local state + toggle.** In `ListScreen`, add `const [mode, setMode] = useState<'one'|'split'>('one');`. Render a two-button segmented control ("1 store" | "Split") styled like the existing pills. Read `import { groupByStore } from './data'`.

- [ ] **Step 2: Render Split mode.** When `mode==='split'`, compute `const { groups, unpriced } = groupByStore(basketResult, storeIds);` and render each group as a store header with `STORE_ABBR[storeId]` + subtotal (`money(subtotal)`), then its lines (label, qty, unit price). Show overall `splitSavings` line ("Split saves $X vs one store") when `> 0`. Keep the existing "1 store" view for `mode==='one'` unchanged.

- [ ] **Step 3: Typecheck + bundle.** Run typecheck (clean) and bundle (200).

- [ ] **Step 4: Visual.** Reload Expo Go → List tab → toggle shows; Split groups items under stores with subtotals; toggling back to "1 store" restores the current view.

- [ ] **Step 5: Commit.**
```bash
git add screens.tsx components.tsx && git commit -m "feat(list): 1-store vs Split-by-store toggle"
```

---

## PHASE 2 — Brand matcher + Prices drill-down (the core)

### Task 3: Brand parser in `scraper/brands.mjs` (TDD)

**Files:**
- Create: `scraper/brands.mjs`
- Create: `scraper/brands.test.mjs`

- [ ] **Step 1: Write failing tests** in `scraper/brands.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProduct, SIZE_RE } from './brands.mjs';

test('parses brand + size from a real name', () => {
  const r = parseProduct({ n: 'J & J Cream Cheese Whipped, 8 Oz', p: 5.49 }, CREAM_CHEESE_SPEC);
  assert.equal(r.brand, 'J&J');
  assert.equal(r.size, '8 oz');
  assert.equal(r.variant, 'whipped');
});

test('rejects junk (rugelach)', () => {
  const r = parseProduct({ n: 'Dairy Cream Cheese Chocolate Rugelach', p: 9.99 }, CREAM_CHEESE_SPEC);
  assert.equal(r, null);
});

test('unknown brand → low confidence (goes to other)', () => {
  const r = parseProduct({ n: 'Store Cream Cheese 8 oz', p: 3.0 }, CREAM_CHEESE_SPEC);
  assert.equal(r.confident, false);
});
```
(Define `CREAM_CHEESE_SPEC` at top of the test by importing from brands.mjs once it exists.)

- [ ] **Step 2: Run tests, verify they FAIL.** `cd scraper && node --test` → FAIL (module/exports missing).

- [ ] **Step 3: Implement `scraper/brands.mjs`.**

```js
// Parse messy catalog product names into { brand, size, variant, confident }.
// Ported from the audit matchers used in curated.mjs; brand canon is the
// "big brands people buy" (design decision C).
export const SIZE_RE = /(\d+(?:\.\d+)?)\s*(oz|lb|ct|pk|gal|qt)\b/i;

// Per-item spec: accept/reject terms, brand aliases, variant tags.
export const SPECS = {
  cream_cheese: {
    accept: ['cream cheese'],
    reject: ['rugelach', 'croissant', 'frosting', 'cake', 'danish', 'babka', 'spread dip'],
    brands: { 'philadelphia': 'Philadelphia', 'philly': 'Philadelphia', 'j&j': 'J&J', 'j & j': 'J&J',
      'temp tee': 'Temp Tee', 'temptee': 'Temp Tee', 'breakstone': "Breakstone's",
      'norman': "Norman's", 'givat': 'Givat', 'kraft': 'Kraft', 'mehadrin': 'Mehadrin', 'tofutti': 'Tofutti' },
    variants: ['whipped', 'parve', 'reduced fat', 'light', 'chives', 'onion'],
  },
  sourcream: { accept: ['sour cream'], reject: ['dip', 'onion dip'],
    brands: { 'breakstone': "Breakstone's", 'friendship': 'Friendship', 'tuscan': 'Tuscan',
      'norman': "Norman's", 'axelrod': 'Axelrod', 'daisy': 'Daisy' }, variants: ['light', 'reduced fat'] },
  // ...cottage_cheese, american_cheese, yogurt, milk, eggs added the same way.
};

const norm = (s) => (s || '').toLowerCase();

export function parseProduct(product, spec) {
  const name = norm(product.n);
  if (!spec.accept.some((a) => name.includes(a))) return null;
  if (spec.reject.some((r) => name.includes(r))) return null;      // junk
  const sizeM = name.match(SIZE_RE);
  const size = sizeM ? `${sizeM[1]} ${sizeM[2].toLowerCase()}` : null;
  let brand = null;
  for (const [alias, canon] of Object.entries(spec.brands)) {
    if (name.includes(alias)) { brand = canon; break; }
  }
  const variant = spec.variants.find((v) => name.includes(v)) || null;
  const confident = !!(brand && size);                            // matched only when brand + size known
  return { brand, size, variant, price: product.p, name: product.n, confident };
}
```

- [ ] **Step 4: Run tests, verify PASS.** `cd scraper && node --test` → all pass. (Adjust reject/brand lists until the three tests pass.)

- [ ] **Step 5: Commit.**
```bash
git add scraper/brands.mjs scraper/brands.test.mjs && git commit -m "feat(scraper): brand+size parser with confidence + junk filtering"
```

### Task 4: `computeBrands()` — group across stores (TDD)

**Files:**
- Modify: `scraper/brands.mjs`
- Modify: `scraper/brands.test.mjs`

- [ ] **Step 1: Add failing test** for grouping the same brand+size across two stores into one row with both prices, and a "from" per store, and unmatched → `other`.

```js
import { computeBrands } from './brands.mjs';
test('groups same brand+size across stores; from-price; other bucket', () => {
  const catalog = {
    gourmetglatt: [ { n: 'Philadelphia Cream Cheese 8 Oz', p: 5.59 }, { n: 'Store Brand Cream Cheese 8 oz', p: 3.0 } ],
    seasons_law: [ { n: 'Philadelphia Cream Cheese, 8 oz', p: 4.99 } ],
  };
  const out = computeBrands(catalog, { fivetowns: ['gourmetglatt', 'seasons_law'] });
  const cc = out.fivetowns.cream_cheese;
  const row = cc.rows.find((r) => r.brand === 'Philadelphia' && r.size === '8 oz');
  assert.equal(row.prices.gourmetglatt, 5.59);
  assert.equal(row.prices.seasons_law, 4.99);
  assert.equal(cc.from.seasons_law, 4.99);
  assert.ok(cc.other.gourmetglatt.some((o) => o.name.includes('Store Brand')));
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement `computeBrands`.**

```js
export function computeBrands(catalog, areaStores) {
  const out = {};
  for (const [area, storeIds] of Object.entries(areaStores)) {
    out[area] = {};
    for (const [itemId, spec] of Object.entries(SPECS)) {
      const rowMap = new Map();        // key: brand|size|variant → { brand,size,variant,prices:{} }
      const other = {};                // storeId → [{name,price}]
      const from = {};                 // storeId → min confident price
      for (const storeId of storeIds) {
        for (const product of (catalog[storeId] || [])) {
          const p = parseProduct(product, spec);
          if (!p) continue;
          if (!p.confident) {
            (other[storeId] ||= []).push({ name: p.name, price: p.price });
            continue;
          }
          const key = `${p.brand}|${p.size}|${p.variant || ''}`;
          if (!rowMap.has(key)) rowMap.set(key, { brand: p.brand, size: p.size, variant: p.variant, prices: {} });
          const row = rowMap.get(key);
          // keep the cheapest instance of this exact product at this store
          if (row.prices[storeId] == null || p.price < row.prices[storeId]) row.prices[storeId] = p.price;
          if (from[storeId] == null || p.price < from[storeId]) from[storeId] = p.price;
        }
      }
      const rows = [...rowMap.values()].sort((a, b) => a.brand.localeCompare(b.brand));
      if (rows.length || Object.keys(other).length) out[area][itemId] = { from, rows, other };
    }
  }
  return out;
}
```

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit.**
```bash
git add scraper/brands.mjs scraper/brands.test.mjs && git commit -m "feat(scraper): computeBrands groups matches cross-store with from-price + other bucket"
```

### Task 5: Wire `brands` into the feed

**Files:**
- Modify: `scraper/catalog.mjs` (the feed-write block that already writes `curated`)

- [ ] **Step 1: Import + compute.** Add `import { computeBrands } from './brands.mjs';`. Near the existing `const curated = computeCurated(out);`, add the area→store map (mirror `stores.ts`) and `const brands = computeBrands(out, AREA_STORES);`.

```js
const AREA_STORES = {
  teaneck: ['ge', 'gl'], fivetowns: ['gourmetglatt', 'seasons_law'],
  manhattan: ['six60one', 'kmp'], lakewood: ['superstop'],
};
```

- [ ] **Step 2: Add to feed JSON.** Extend the `writeFileSync(feedPath, JSON.stringify({ ... }))` to include `brands`.

- [ ] **Step 3: Run the scraper feed-write path once locally** (or a minimal harness) and confirm `data.json` gains a `brands` key: `node -e "console.log(Object.keys(require('./data.json').brands||{}))"` from repo root → expect area ids.

- [ ] **Step 4: Commit.**
```bash
git add scraper/catalog.mjs && git commit -m "feat(scraper): bake brands block into the daily feed"
```

### Task 6: App readers in `catalog.ts` + `datactx.tsx`

**Files:**
- Modify: `catalog.ts`, `datactx.tsx`

- [ ] **Step 1: Add `catalog.ts` accessors** (parallel to `CURATED`/`setCurated`):

```ts
export interface BrandRow { brand: string; size: string | null; variant: string | null; prices: Record<string, number>; }
export interface BrandItem { from: Record<string, number>; rows: BrandRow[]; other: Record<string, { name: string; price: number }[]>; }
let BRANDS: Record<string, Record<string, BrandItem>> = {};
export function setBrands(data: any) { BRANDS = data && typeof data === 'object' ? data : {}; }
export function brandsFor(area: string, itemId: string): BrandItem | undefined { return BRANDS[area]?.[itemId]; }
export function brandFromPrice(area: string, itemId: string, storeId: string): number | undefined {
  const v = BRANDS[area]?.[itemId]?.from?.[storeId]; return typeof v === 'number' ? v : undefined;
}
```

- [ ] **Step 2: Wire `datactx.tsx`.** Add `setBrands` to the import from `./catalog` and call `setBrands(data.brands)` inside `apply()`, and add `brands?: any` to the `apply` data type.

- [ ] **Step 3: Typecheck.** Clean.

- [ ] **Step 4: Commit.**
```bash
git add catalog.ts datactx.tsx && git commit -m "feat(app): read brands feed via setBrands/brandsFor"
```

### Task 7: Prices drill-down UI

**Files:**
- Modify: `components.tsx` (add `BrandTable`; make `CompareRow` expandable), `screens.tsx` (PricesScreen passes `area` + renders expansion)

- [ ] **Step 1: Collapsed "from" price.** In the row used by PricesScreen, when `brandsFor(area, itemId)` exists, show each store's `from[storeId]` prefixed "from " and keep the BEST highlight computed on those from-prices. Fall back to today's generic `livePriceOf` number when no brand item exists.

- [ ] **Step 2: Expandable row.** Add `expanded` state keyed by itemId in PricesScreen; tapping a row toggles it. When expanded, render `<BrandTable item={brandsFor(area, itemId)} storeIds={storeIds} />`.

- [ ] **Step 3: `BrandTable` component.** For each `row` in `item.rows`: render brand + size, and each store's `prices[storeId]` (or "—"), cheapest highlighted (reuse `PricePill` states). Below, a muted "Other brands here" per store from `item.other` (capped ~6), never cross-compared.

- [ ] **Step 4: Typecheck + bundle + visual.** Dairy tab (Five Towns): rows show "from" prices; tapping Cream cheese expands the brand table with Temp Tee/J&J/Philadelphia etc.; "—" where absent; Other brands listed quietly. No visibly-wrong matches.

- [ ] **Step 5: Commit.**
```bash
git add components.tsx screens.tsx && git commit -m "feat(prices): tap an item to see matched brand comparison + other brands"
```

---

## PHASE 3 — Deals name the brand (small; rides on Phase 2)

### Task 8: Brand-aware deals

**Files:**
- Modify: `data.ts` (`areaDeals`) or the Deals renderer in `screens.tsx`/`components.tsx`

- [ ] **Step 1: Enrich deal label.** For each area deal, look up `brandsFor(area, itemId)`; if a confident row is the cheapest at the winning store, append `${brand}${size ? ' ' + size : ''}` to the deal's cut label (e.g. "Breakstone's Sour Cream 16 oz — save $2.80 at Gourmet"). If no confident brand, keep today's generic wording.

- [ ] **Step 2: Typecheck + bundle + visual.** Deals tab shows brand + size where matched; unmatched deals unchanged.

- [ ] **Step 3: Commit.**
```bash
git add data.ts screens.tsx components.tsx && git commit -m "feat(deals): name the brand + size behind each deal when confidently matched"
```

---

## Self-review notes
- **Spec coverage:** brand drill-down (Tasks 3–7), matched cross-store + Other-brands catch-all (Task 4/7), "from" collapsed row (Task 7 Step 1), deals brand (Task 8), List 1-store/Split (Tasks 1–2), scraper-computed feed (Task 5), generic fallback (Task 7 Step 1). Account brand-learning intentionally absent (v2).
- **No placeholders:** Task 1 Step 3 explicitly declines a formal unit test (no TS test runner) and states the real verification instead — that's a deliberate decision, not a TODO.
- **Type consistency:** `BrandItem`/`BrandRow`/`from`/`rows`/`other` names identical across scraper feed (Task 4), reader (Task 6), and UI (Task 7). `groupByStore`/`StoreGroup` consistent across Task 1–2.
- **SPECS coverage:** Task 3 ships cream_cheese + sourcream; the remaining dairy items (cottage_cheese, american_cheese, yogurt, milk, eggs) follow the identical spec shape and should be filled in during Task 3 Step 3 before moving on — each just needs accept/reject/brands.
