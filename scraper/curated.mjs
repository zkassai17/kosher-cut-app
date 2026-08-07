// Compute the curated category comparison prices (Chicken/Beef/Dairy) from the
// freshly-crawled catalog, so the app's category tabs stay current instead of
// drifting from a hand-typed table. For each curated cut we take the CHEAPEST
// product at a store whose name matches the right cut (accept terms), isn't a
// wrong/prepared variant (reject terms), and — for dairy — is the standard size.
//
// Only items with a confident match are emitted; anything omitted (e.g. butter,
// or a store that names a cut oddly) falls back to the bundled hand-typed table
// in prices.ts. So this can only ADD freshness/coverage, never break a comparison.

const MEAT_REJECT = ['organic','marinated','grilled','breaded','bbq','honey','teriyaki','stuffed','soup',
 'schnitzel','cooked','roasted','smoked','pulled','deli','kebab','skewer','nugget','popper','franks',
 'salami','bologna','hot dog','hotdog','sausage','mock','veggie','turkey','duck','pastrami','corned',
 'spiced','glazed','shawarma','cutlet cube','sauce','spread','jerky','chips','dumpling','wrap','pie',
 'meatball','meatloaf','cigars','shabbos','prime','grass-fed','grass fed','dry rub','dry-rub'];
const woPrime = MEAT_REJECT.filter((r) => r !== 'prime');
const ALT = ['almond','oat','soy','coconut','cashew','rice milk','hemp','pea protein','non dairy','non-dairy','vegan','tofu'];

// key: 'category|itemId' -> { accept, reject, lb, sizes? }
const SPECS = {
  'chicken|whole_chicken': { accept: ['whole chicken'], reject: ['cut','eighth','quarter','half','8', ...MEAT_REJECT], lb: true },
  'chicken|cut_in_8':      { accept: ['cut in eight','cut in 8','eighths','1/8'], reject: MEAT_REJECT, lb: true },
  'chicken|drumsticks':    { accept: ['drumstick'], reject: ['skinless', ...MEAT_REJECT], lb: true },
  'chicken|legs':          { accept: ['leg quarter','chicken legs','whole leg'], reject: ['drumstick','thigh', ...MEAT_REJECT], lb: true },
  'chicken|thighs':        { accept: ['chicken thigh','thighs'], reject: ['boneless','skinless','pargiyot', ...MEAT_REJECT], lb: true },
  'chicken|cutlets':       { accept: ['chicken cutlet','cutlets'], reject: ['thin','strip','cube','pargiyot','breast on', ...MEAT_REJECT], lb: true },
  'chicken|thin_cutlets':  { accept: ['thin sl cutlet','thin cutlet','thin sliced cutlet','thin chicken cutlet'], reject: ['veal','beef', ...MEAT_REJECT], lb: true },
  'chicken|pargiyot':      { accept: ['pargiyot','pargit','baby chicken'], reject: MEAT_REJECT, lb: true },
  'chicken|wings':         { accept: ['chicken wing'], reject: MEAT_REJECT, lb: true },
  'chicken|ground_chicken':{ accept: ['ground chicken','ground dark meat chicken','ground white meat chicken'], reject: ['patties', ...MEAT_REJECT], lb: true },
  'beef|ground_beef':      { accept: ['ground beef'], reject: ['extra lean','patties','burger','veal','lamb', ...MEAT_REJECT], lb: true },
  'beef|extra_lean':       { accept: ['extra lean ground','ground beef extra lean','lean ground beef'], reject: ['patties', ...MEAT_REJECT], lb: true },
  'beef|patties':          { accept: ['beef patties','ground beef patties','hamburger','beef burger'], reject: ['veal','lamb','chicken','cowboy','stuffed', ...MEAT_REJECT], lb: true },
  'beef|sliders':          { accept: ['beef slider'], reject: ['salmon','kani','bun','shell','bag','taco','chick', ...MEAT_REJECT], lb: true },
  'beef|stew':             { accept: ['beef stew','stew meat','chulent meat','cholent meat'], reject: ['bone','barley','kit','mix','and bone', ...MEAT_REJECT], lb: true },
  'beef|london_broil':     { accept: ['london broil'], reject: ['turkey','split','minute', ...woPrime], lb: true },
  'beef|rib_steak':        { accept: ['rib steak'], reject: ['thin','eye','boneless','roast','short','chicken','mock','lamb','veal','flat', ...MEAT_REJECT], lb: true },
  'beef|flanken':          { accept: ['flanken'], reject: ['boneless','roast','end','tip','ground', ...MEAT_REJECT], lb: true },
  'beef|brisket':          { accept: ['1st cut brisket','1 st cut brisket'], reject: ['corned','2nd','second','veal','pastrami','whole','deckle','smoked','pulled','krisp','chips', ...MEAT_REJECT], lb: true },
  // Dairy (per item). Only where the standard size is in the name — otherwise omit (falls back).
  'dairy|eggs':            { accept: ['egg'], reject: ['liquid','white','hard boil','quail','duck','scotch','powder','substitute','beater','organic','free range','pasture','plant','vegan','chocolate','candy','salad','roll','noodle'], sizes: ['dozen','12 ct','12ct','1 doz','12 count','12 large','grade a'] },
  'dairy|milk':            { accept: ['milk'], reject: [...ALT,'buttermilk','condensed','evapor','powder','choc','vanilla','strawberry','ricotta','cheese','cream','latte','coffee','cappuccino','shake','nesquik','fairlife','lactaid','organic','goat','stonyfield','horizon','cornflake','cereal','klik','kariot','snack','pillow'], sizes: [' 64 oz','1/2 gal','half gal','1/2 gallon'] },
  'dairy|cream_cheese':    { accept: ['cream cheese'], reject: ['whipped','tofu','vegan','chive','strawberry','scallion','vegetable','light','low fat','flavored','onion','garden','berry','honey','maple','jalapeno', ...ALT], sizes: ['8 oz'] },
  'dairy|cottage_cheese':  { accept: ['cottage cheese'], reject: ['vegan','tofu', ...ALT], sizes: ['16 oz'] },
  'dairy|sourcream':       { accept: ['sour cream'], reject: ['light','low fat','reduced', ...ALT], sizes: ['16 oz'] },
  'dairy|shredded_cheese': { accept: ['shredded'], reject: ['soy','vegan','parmesan','cheddar','taco','pizza blend','american'], sizes: ['8 oz'] },
  'dairy|american_cheese': { accept: ['american cheese'], reject: ['soy','vegan', ...ALT], sizes: ['12 ','loaf','108','120','96','ct'] },
  'dairy|yogurt':          { accept: ['yogurt'], reject: ['drink','smoothie','tube','frozen','bar','pretzel','covered','granola', ...ALT], sizes: ['5.3 oz','6 oz','5 oz','5.3oz','6oz'] },
};

function bestPrice(products, spec) {
  let best = null;
  for (const p of products) {
    const n = (p.n || '').toLowerCase();
    const pr = typeof p.p === 'number' ? p.p : parseFloat(p.p);
    if (!(pr > 0)) continue;
    if (spec.lb && !p.lb) continue;
    if (!spec.accept.some((a) => n.includes(a))) continue;
    if (spec.reject.some((r) => n.includes(r))) continue;
    if (spec.sizes && !spec.sizes.some((s) => n.includes(s))) continue;
    if (best == null || pr < best) best = pr;
  }
  return best == null ? null : Math.round(best * 100) / 100;
}

// catalog: { storeId: [{ n, p, lb }] }  ->  { storeId: { chicken:{}, beef:{}, dairy:{} } }
export function computeCurated(catalog) {
  const out = {};
  for (const [store, products] of Object.entries(catalog || {})) {
    if (!Array.isArray(products) || !products.length) continue;
    const store_out = { chicken: {}, beef: {}, dairy: {} };
    for (const [key, spec] of Object.entries(SPECS)) {
      const [cat, item] = key.split('|');
      const price = bestPrice(products, spec);
      if (price != null) store_out[cat][item] = price;
    }
    out[store] = store_out;
  }
  return out;
}
