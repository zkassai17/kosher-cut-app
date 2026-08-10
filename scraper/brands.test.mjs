import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProduct, computeBrands, SPECS } from './brands.mjs';

const CC = SPECS.cream_cheese;

test('parses brand + size + variant from a real name', () => {
  const r = parseProduct({ n: 'J & J Cream Cheese Whipped, 8 Oz', p: 5.49 }, CC);
  assert.equal(r.brand, 'J&J');
  assert.equal(r.size, '8 oz');
  assert.equal(r.variant, 'whipped');
  assert.equal(r.confident, true);
});

test('rejects junk (rugelach is not cream cheese)', () => {
  const r = parseProduct({ n: 'Dairy Cream Cheese Chocolate Rugelach', p: 9.99 }, CC);
  assert.equal(r, null);
});

test('known brand without a size is still confident (brand-only match)', () => {
  const r = parseProduct({ n: 'Philadelphia Cream Cheese', p: 5.0 }, CC);
  assert.equal(r.brand, 'Philadelphia');
  assert.equal(r.size, null);
  assert.equal(r.confident, true); // size optional — matched on brand
});

test('long-tail brand is auto-extracted (not lost to "other")', () => {
  const r = parseProduct({ n: 'Chobani Whole Milk Yogurt', p: 1.49 }, SPECS.yogurt);
  assert.equal(r.brand, 'Chobani');
  assert.equal(r.confident, true);
});

test('generic-leading name has no brand → goes to other bucket', () => {
  const r = parseProduct({ n: 'Organic Cream Cheese 8 oz', p: 3.0 }, CC); // "organic" is a descriptor, not a brand
  assert.equal(r.brand, null);
  assert.equal(r.confident, false);
});

test('computeBrands groups same brand+size across stores; from-price; other bucket', () => {
  const catalog = {
    gourmetglatt: [
      { n: 'Philadelphia Cream Cheese 8 Oz', p: 5.59 },
      { n: 'Organic Cream Cheese 8 oz', p: 3.0 }, // generic-leading → no brand → other
    ],
    seasons_law: [{ n: 'Philadelphia Cream Cheese, 8 oz', p: 4.99 }],
  };
  const out = computeBrands(catalog, { fivetowns: ['gourmetglatt', 'seasons_law'] });
  const cc = out.fivetowns.cream_cheese;
  const row = cc.rows.find((r) => r.brand === 'Philadelphia');
  assert.equal(row.prices.gourmetglatt, 5.59);
  assert.equal(row.prices.seasons_law, 4.99);
  assert.equal(row.sizes.gourmetglatt, '8 oz');
  assert.equal(cc.from.seasons_law, 4.99);
  assert.equal(cc.from.gourmetglatt, 5.59);
  assert.ok(cc.other.gourmetglatt.some((o) => o.name.includes('Organic')));
});

test('same brand+variant across stores is ONE row, recording each size for the UI to flag', () => {
  const catalog = {
    a: [{ n: 'Temp Tee Cream Cheese 8 oz', p: 6.19 }],
    b: [{ n: 'Temp Tee Cream Cheese 11.5 oz', p: 7.99 }],
  };
  const out = computeBrands(catalog, { z: ['a', 'b'] });
  const rows = out.z.cream_cheese.rows.filter((r) => r.brand === 'Temp Tee');
  assert.equal(rows.length, 1); // brand-matched into one comparable row
  assert.equal(rows[0].prices.a, 6.19);
  assert.equal(rows[0].prices.b, 7.99);
  assert.equal(rows[0].sizes.a, '8 oz'); // sizes kept so UI can show "sizes may vary"
  assert.equal(rows[0].sizes.b, '11.5 oz');
});

test('brand match works when one store omits the size (the real GG case)', () => {
  const catalog = {
    seasons_law: [{ n: 'J&J Whipped Cream Cheese 8 oz', p: 5.99 }],
    gourmetglatt: [{ n: 'J&J Whipped Cream Cheese', p: 5.49 }], // no size in name
  };
  const out = computeBrands(catalog, { fivetowns: ['seasons_law', 'gourmetglatt'] });
  const row = out.fivetowns.cream_cheese.rows.find((r) => r.brand === 'J&J' && r.variant === 'whipped');
  assert.equal(row.prices.seasons_law, 5.99);
  assert.equal(row.prices.gourmetglatt, 5.49); // both stores present — the whole point
  assert.equal(row.sizes.gourmetglatt, null);
});
