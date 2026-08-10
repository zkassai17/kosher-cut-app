# Brand-level prices + shop-by-store — Design Spec

**Date:** 2026-08-10
**Status:** Approved (design), pending implementation plan
**Author:** Zachary Kassai (koshercart), with Claude

---

## Problem / motivation

koshercart today compares one **generic** price per item per store (e.g. `cream_cheese: $4.49`), hand-typed in `prices.ts`. But people shop by **brand** — they want Philadelphia, J&J, Temp Tee, etc., not "cream cheese" in the abstract. Feedback from the collaborator test (2026-08-10):

1. Tapping a category item (e.g. "Cream cheese") should reveal the **brands** and their prices.
2. **Deals** should say *which brand* is giving that price.
3. The **List** should be organized **by store** so the shopper knows what to buy where.
4. *(v2)* An account could learn a user's preferred brands and surface them automatically.

Good news confirmed while scoping: the daily **scraper catalog already contains brand-level products per store** (real names like "Philadelphia Cream Cheese 8 Oz", "J & J Cream Cheese Whipped 8 Oz", with price and per-lb flag). The generic tab does not — so brand data comes from the catalog, not the hand-typed table.

The catch: catalog names are **messy** — varying sizes (8/11.5/12 oz), variants (whipped, parve, reduced-fat, flavored), inconsistent spellings across stores ("J & J" vs "J&J"), and outright non-matches ("Cream Cheese Chocolate Rugelach" is a pastry). The core engineering is **cleaning + matching**, not UI.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Which brands to show | **C — the big brands people buy** (Philadelphia, J&J, Temp Tee, Norman's, Breakstone's, Givat, etc.), size shown, junk filtered |
| Comparison model | **Option 1 — matched cross-store** (same brand+size lined up across stores) + a safe "Other brands" catch-all for low-confidence matches |
| Collapsed row (before tap) | **A — "from" price** (lowest brand price at each store), tap to expand full brand table |
| List layout | **A — "1 store (easiest)" vs "Split (cheapest)" toggle**; Split groups items by store with per-store subtotals |
| Account brand-learning | **Deferred to v2** |

**Non-negotiable:** accuracy is core. A wrong comparison is worse than none. The matcher only presents a side-by-side when confident; everything else falls into "Other brands" or the generic fallback. Never guess a price or a match.

---

## Architecture

### Data sources (today)
- **Curated tabs** (`prices.ts` → Chicken/Beef/Dairy): hand-typed generic price per item per store, with a daily `curated` overlay from the scraper (`catalog.ts` `curatedPriceOf`, falling back to the hand-typed value).
- **Catalog** (`data.json` → `catalog[storeId]`): a per-store list of products `{ n: name, p: price, lb: perLb, d: dept, c: canonicalKey }`. 7 stores: `ge, superstop, six60one, gl, gourmetglatt, seasons_law, kmp`. This is the brand-data source.
- Comparison is **area-scoped** (e.g. Five Towns compares `gourmetglatt` vs `seasons_law`).
- `basketTotals()` already computes each line's `cheapestIdx` — the hook the List "Split" view needs.

### New component: the brand matcher
A single module that turns messy catalog names into clean, matched brand rows.

**Runs in the scraper** (`scraper/`), once daily, alongside the existing `computeCurated()`. Output is baked into the feed (`data.json`) as a new `brands` block. The app only renders it — keeps the app fast and the parsing/matching logic centralized (mirrors the curated pipeline). *(Alternative considered: compute live in-app on tap. Rejected for v1 to keep app logic thin and matching consistent, but the structure should not preclude it.)*

**Per curated item** (extends the existing `SPECS` in `scraper/curated.mjs`), the matcher defines:
- **accept / reject** term lists (what counts as this item; e.g. reject "rugelach", "croissant", "frosting").
- **brand canon** — a list of known brands + spelling aliases ("J & J" → "J&J").
- **size parsing + normalization** — extract oz/size; only match same normalized size.
- **variant tags** — whipped / parve / reduced-fat / flavored, kept as part of identity (Philadelphia regular 8oz ≠ Philadelphia whipped 8oz).

**Matching algorithm (per item, per area):**
1. For each store, pull catalog products passing accept/reject.
2. Parse each into `{ brand, size, variant, price }`; drop unparseable/unknown-brand ones into that store's **Other brands** bucket.
3. Group confident products by `(brand, normalizedSize, variant)` across stores → a **matched row** carrying each store's price (or `null`/"—" where absent).
4. Restrict to the **big-brand canon** (decision C); keep the rest available under Other brands.
5. Compute each store's **"from" price** = the min price among that store's confident products (fallback: generic curated/hand-typed price if the store has no catalog data for the item).

**Feed shape (illustrative):**
```jsonc
"brands": {
  "<area>": {
    "<itemId>": {
      "from": { "gourmetglatt": 5.59, "seasons_law": 4.49 },
      "rows": [
        { "brand": "Temp Tee", "size": "8 oz", "variant": null,
          "prices": { "gourmetglatt": 6.19, "seasons_law": 5.99 } }
      ],
      "other": {
        "gourmetglatt": [ { "name": "Kite Hill DF Plain", "price": 10.49 } ]
      }
    }
  }
}
```

### App rendering
- `catalog.ts`: add a `setBrands(data.brands)` sink + `brandsFor(area, itemId)` reader (parallel to `setCurated`/`curatedPriceOf`); `datactx.tsx` `apply()` calls `setBrands`.
- No brand data for an item/store → render today's generic number (graceful fallback).

---

## Feature designs

### 1. Prices tab — brand drill-down
- **Collapsed row:** `Cream cheese — Gourmet from $5.59 · Seasons from $4.49`, BEST highlight retained. "from" makes clear it's a starting price; the collapsed cheapest may be different brands per store.
- **Expanded (tap):** the matched brand table — one row per big brand, size shown, each store's price, cheapest highlighted, "—" where absent.
- **Other brands:** a quiet section at the bottom of the expanded view, per store, for unmatched/less-common products (never cross-compared).
- Only the Dairy tab has rich brand data today; Chicken/Beef may have fewer confident matches — that's fine, they fall back to generic rows.

### 2. Deals tab
- Deal computation is unchanged in spirit but sourced from matched brand rows: a deal names **brand + size**, e.g. "Breakstone's Sour Cream 16 oz — save $2.80 at Gourmet."
- If a category's deal has no confident brand match, fall back to today's generic deal wording (no brand).

### 3. List tab — "1 store vs Split" toggle
- **Toggle** at the top: **1 store (easiest)** | **Split (cheapest)**.
- **1 store:** unchanged — the cheapest single-store total, one trip.
- **Split:** items grouped under each item's cheapest store, each store showing a **subtotal**, plus the overall **split savings** vs the best single store (already computed as `splitSavings`).
- Uses existing `basketTotals()` `cheapestIdx`; no new math, pure presentation.
- If splitting saves ~nothing, the user simply stays on "1 store" (graceful — no forced multi-store).

---

## Build order
1. **List "1 store vs Split" toggle** — independent, no matcher, ships value immediately.
2. **Brand matcher + Prices drill-down** — the core; strict matching first (few matches, zero wrong), loosen carefully.
3. **Deals brand labels** — small, rides on the matcher output.

---

## Risks & mitigations
- **False matches** (the big one) → strict confidence; unmatched → "Other brands"; start conservative. A wrong comparison violates the core promise.
- **Size mismatch** → normalize + only match equal sizes; always show size so the user can sanity-check.
- **Coverage gaps** (stores/items without catalog data) → generic fallback; never a blank/broken row.
- **Feed size growth** from the `brands` block → keep it compact (big brands only; Other brands capped per store).

## Out of scope (v2)
- Account-based brand learning / personalization.
- Brand data for categories beyond what the catalog supports.

## Success criteria
- Tapping a Dairy item shows a trustworthy brand-by-brand comparison across the area's stores, with sizes, cheapest highlighted, and zero visibly-wrong matches.
- Deals name the brand where one is confidently matched.
- The List offers a clear one-store total and a grouped split-by-store plan with per-store subtotals.
