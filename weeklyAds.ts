// Store weekly circulars ("this week's ad"). Shown on the store's own card in
// the Stores tab — NOT mixed into the cross-store price comparison — so it's a
// neutral per-store feature, not a promotion. Any store that publishes a
// circular can appear here.
//
// `highlights` are a hand-verified sample; `url` links to the store's full,
// always-current circular. Prices are the STORE'S sale prices for the dates
// shown (kept as display strings to handle "2/$5", "89¢/lb", etc.).

export interface AdItem {
  name: string;
  price: string;
}

export interface WeeklyAd {
  effective: string;
  url: string;
  highlights: AdItem[];
}

export const WEEKLY_ADS: Record<string, WeeklyAd> = {
  cedar: {
    effective: 'July 26–31',
    url: 'https://thecedarmarket.com/weekly-ads/',
    highlights: [
      { name: 'Chicken Cutlets (family pack)', price: '$7.49/lb' },
      { name: 'Whole Chicken, spatchcock split', price: '$3.49/lb' },
      { name: 'Chicken Legs (super family pack)', price: '$2.79/lb' },
      { name: 'Extra Lean Ground Shoulder', price: '$9.49/lb' },
      { name: "Norman's Whipped Cream Cheese, 8oz", price: '2 / $7' },
      { name: 'Heinz Ketchup, 38oz', price: '2 / $4' },
      { name: 'Wesson Canola Oil, 1 gal', price: '$12.99' },
      { name: "Aaron's Kosher Salami, 16oz", price: '$13.99' },
      { name: 'Sweet Vidalia Onions', price: '89¢/lb' },
      { name: 'Clementines, 3 lb bag', price: '$3.99' },
    ],
  },
};

export const weeklyAdFor = (storeId: string): WeeklyAd | undefined => WEEKLY_ADS[storeId];
