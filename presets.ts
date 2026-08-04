// Pre-built shopping lists for the seasons/occasions people actually cook for.
// Each item references a real { category, itemId } in prices.ts.

export interface BasketItem {
  cat: string;
  id: string;
  qty?: number; // how many to buy — defaults to 1 when absent (older lists/presets)
}

export interface Preset {
  id: string;
  label: string;
  emoji: string;
  items: BasketItem[];
}

export const PRESETS: Preset[] = [
  {
    id: 'shabbos',
    label: 'Shabbos',
    emoji: '🕯️',
    items: [
      { cat: 'chicken', id: 'cut_in_8' },
      { cat: 'chicken', id: 'cutlets' },
      { cat: 'beef', id: 'stew' },
      { cat: 'dairy', id: 'eggs' },
      { cat: 'dairy', id: 'milk' },
      { cat: 'dairy', id: 'yogurt' },
    ],
  },
  {
    id: 'rosh',
    label: 'Rosh Hashana',
    emoji: '🍎',
    items: [
      { cat: 'chicken', id: 'whole_chicken' },
      { cat: 'chicken', id: 'thighs' },
      { cat: 'beef', id: 'brisket' },
      { cat: 'beef', id: 'stew' },
      { cat: 'dairy', id: 'eggs' },
    ],
  },
  {
    id: 'pesach',
    label: 'Pesach',
    emoji: '🍷',
    items: [
      { cat: 'chicken', id: 'whole_chicken' },
      { cat: 'chicken', id: 'cutlets' },
      { cat: 'beef', id: 'brisket' },
      { cat: 'beef', id: 'ground_beef' },
      { cat: 'dairy', id: 'eggs' },
    ],
  },
  {
    id: 'grill',
    label: 'BBQ / grill',
    emoji: '🔥',
    items: [
      { cat: 'beef', id: 'patties' },
      { cat: 'beef', id: 'sliders' },
      { cat: 'chicken', id: 'wings' },
      { cat: 'chicken', id: 'thin_cutlets' },
      { cat: 'chicken', id: 'drumsticks' },
    ],
  },
];
