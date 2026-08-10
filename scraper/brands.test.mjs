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

test('known brand without a size is not confident', () => {
  const r = parseProduct({ n: 'Philadelphia Cream Cheese', p: 5.0 }, CC);
  assert.equal(r.brand, 'Philadelphia');
  assert.equal(r.size, null);
  assert.equal(r.confident, false);
});

test('unknown brand → not confident (goes to other bucket)', () => {
  const r = parseProduct({ n: 'Store Brand Cream Cheese 8 oz', p: 3.0 }, CC);
  assert.equal(r.brand, null);
  assert.equal(r.confident, false);
});

test('computeBrands groups same brand+size across stores; from-price; other bucket', () => {
  const catalog = {
    gourmetglatt: [
      { n: 'Philadelphia Cream Cheese 8 Oz', p: 5.59 },
      { n: 'Store Brand Cream Cheese 8 oz', p: 3.0 }, // unknown brand → other
    ],
    seasons_law: [{ n: 'Philadelphia Cream Cheese, 8 oz', p: 4.99 }],
  };
  const out = computeBrands(catalog, { fivetowns: ['gourmetglatt', 'seasons_law'] });
  const cc = out.fivetowns.cream_cheese;
  const row = cc.rows.find((r) => r.brand === 'Philadelphia' && r.size === '8 oz');
  assert.equal(row.prices.gourmetglatt, 5.59);
  assert.equal(row.prices.seasons_law, 4.99);
  assert.equal(cc.from.seasons_law, 4.99);
  assert.equal(cc.from.gourmetglatt, 5.59);
  assert.ok(cc.other.gourmetglatt.some((o) => o.name.includes('Store Brand')));
});

test('does not match a different size as the same row', () => {
  const catalog = {
    a: [{ n: 'Temp Tee Cream Cheese 8 oz', p: 6.19 }],
    b: [{ n: 'Temp Tee Cream Cheese 11.5 oz', p: 7.99 }],
  };
  const out = computeBrands(catalog, { z: ['a', 'b'] });
  const rows = out.z.cream_cheese.rows.filter((r) => r.brand === 'Temp Tee');
  assert.equal(rows.length, 2); // 8 oz and 11.5 oz are separate rows, not a false match
});
