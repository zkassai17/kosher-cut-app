// Remote price feed — lets the app pull fresh prices from the web (published
// daily by the scraper) instead of only the copy baked into the app.
//
// Flow: on launch we (1) load the last cached feed instantly, then (2) fetch the
// latest in the background and cache it. If there's no feed URL yet, or the
// network fails, the app silently keeps using the bundled data. Nothing breaks
// offline — the built-in snapshot is always the floor.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { CatalogProduct } from './catalog';
import { WeeklyAd } from './weeklyAds';

// Published daily by the GitHub Actions scraper. Until the repo is pushed &
// Actions runs, this 404s and the app quietly uses the bundled data — safe.
export const REMOTE_DATA_URL = 'https://raw.githubusercontent.com/zkassai17/kosher-cut-app/main/data.json';

const CACHE_KEY = 'kc.remoteData.v1';

export interface RemoteData {
  updatedAt: string; // e.g. "Jul 30, 2026"
  catalog?: Record<string, CatalogProduct[]>;
  weeklyAds?: Record<string, WeeklyAd>; // per-store circular (date/link/highlights), refreshed weekly by the scraper
}

export async function loadCachedData(): Promise<RemoteData | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RemoteData) : null;
  } catch {
    return null;
  }
}

export async function fetchRemoteData(): Promise<RemoteData | null> {
  if (!REMOTE_DATA_URL) return null;
  try {
    const r = await fetch(REMOTE_DATA_URL, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as RemoteData;
    if (!j || (!j.catalog && !j.updatedAt)) return null;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(j));
    return j;
  } catch {
    return null;
  }
}
