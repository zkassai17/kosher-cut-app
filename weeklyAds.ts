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

// Bundled FALLBACK only — the live date + highlights come from the daily feed
// (scraper reads Cedar's weekly-ads page each run) so this never has to be
// hand-edited. `url` is the always-current circular page.
export const WEEKLY_ADS: Record<string, WeeklyAd> = {
  cedar: {
    effective: '',
    url: 'https://thecedarmarket.com/weekly-ads/',
    highlights: [],
  },
};

// Feed override (from data.json → setWeeklyAds), mirroring the catalog swap. So
// the "This week's ad" date/link/highlights update weekly with no app rebuild.
let FEED_ADS: Record<string, WeeklyAd> = {};
export function setWeeklyAds(ads: Record<string, WeeklyAd> | undefined | null): void {
  if (ads && typeof ads === 'object') FEED_ADS = ads;
}

export const weeklyAdFor = (storeId: string): WeeklyAd | undefined => {
  const feed = FEED_ADS[storeId];
  if (feed && feed.effective) return feed; // prefer the live feed once it has a date
  const bundled = WEEKLY_ADS[storeId];
  return bundled && bundled.effective ? bundled : undefined; // hide the badge until we have a real date
};
