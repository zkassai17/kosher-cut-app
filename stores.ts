// Kosher supermarket directory — researched July 2026.
//
// status:
//   'live'      = we already pull real prices from their online store (in the Compare tab)
//   'online'    = they have an online store WITH prices we can add next (verified it exists)
//   'byRequest' = no public online prices (order by phone/email/WhatsApp/Instacart)
//
// Coordinates are approximate store/town locations — good enough for "how far" filtering.

export type PriceStatus = 'live' | 'online' | 'byRequest';

export interface KStore {
  id: string;
  name: string;
  city: string;
  address?: string;
  areaId: string;
  lat: number;
  lng: number;
  status: PriceStatus;
  note?: string;
}

export interface Area {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

// Quick-pick areas (also used as the default map center for each region).
export const AREAS: Area[] = [
  { id: 'teaneck', label: 'Teaneck / Englewood', lat: 40.8976, lng: -74.016 },
  { id: 'fivetowns', label: 'Five Towns (Cedarhurst)', lat: 40.6229, lng: -73.729 },
  { id: 'manhattan', label: 'Manhattan (UWS)', lat: 40.787, lng: -73.9754 },
  { id: 'lakewood', label: 'Lakewood', lat: 40.0978, lng: -74.2176 },
  { id: 'miami', label: 'Miami / South Florida', lat: 25.97, lng: -80.15 },
  { id: 'la', label: 'Los Angeles', lat: 34.05, lng: -118.38 },
  { id: 'baltimore', label: 'Baltimore', lat: 39.37, lng: -76.72 },
];

export const KSTORES: KStore[] = [
  // Bergen County, NJ
  { id: 'ge', name: 'Grand & Essex', city: 'Bergenfield, NJ', areaId: 'teaneck', lat: 40.9182, lng: -73.997, status: 'live' },
  { id: 'gl', name: 'Glatt Express', city: 'Teaneck, NJ', address: '1400 Queen Anne Rd', areaId: 'teaneck', lat: 40.9066, lng: -74.006, status: 'live' },
  { id: 'cedar', name: 'Cedar Market', city: 'Teaneck, NJ', address: '646 Cedar Lane', areaId: 'teaneck', lat: 40.8907, lng: -74.011, status: 'byRequest', note: 'Order by email' },

  // Five Towns / Long Island, NY
  { id: 'gourmetglatt', name: 'Gourmet Glatt', city: 'Cedarhurst, NY', address: '137 Spruce St', areaId: 'fivetowns', lat: 40.6238, lng: -73.7247, status: 'live' },
  { id: 'seasons_law', name: 'Seasons', city: 'Lawrence, NY', address: '330 Central Ave', areaId: 'fivetowns', lat: 40.6178, lng: -73.729, status: 'live' },
  { id: 'kolsave', name: 'KolSave', city: 'Lawrence, NY', address: '11 Lawrence Ln', areaId: 'fivetowns', lat: 40.618, lng: -73.7305, status: 'byRequest', note: 'Instacart / Uber Eats' },

  // Manhattan / NYC
  { id: 'six60one', name: '661', city: 'New York, NY', areaId: 'manhattan', lat: 40.755, lng: -73.99, status: 'live' },
  { id: 'kmp', name: 'The Kosher Marketplace', city: 'Manhattan, NY', address: '2442 Broadway', areaId: 'manhattan', lat: 40.7906, lng: -73.974, status: 'live', note: 'Premium — meat priced by the package (approx per lb)' },

  // Lakewood, NJ
  { id: 'superstop', name: 'SuperStop', city: 'Lakewood, NJ', areaId: 'lakewood', lat: 40.083, lng: -74.209, status: 'online' },
  { id: 'nutmeg', name: 'Nutmeg Kosher', city: 'Lakewood, NJ', address: '485 Locust St', areaId: 'lakewood', lat: 40.073, lng: -74.193, status: 'live' },

  // Miami / South Florida (all My Cloud Grocer — full 3-store comparison)
  { id: 'kingdom', name: 'Kosher Kingdom', city: 'Aventura, FL', areaId: 'miami', lat: 25.958, lng: -80.143, status: 'live' },
  { id: 'koshercentral', name: 'KC Market', city: 'Hollywood, FL', areaId: 'miami', lat: 26.011, lng: -80.163, status: 'live' },
  { id: 'sarahstent', name: "Sarah's Tent", city: 'Aventura, FL', areaId: 'miami', lat: 25.966, lng: -80.144, status: 'live' },

  // Los Angeles (Ariel Glatt is a possible 3rd — its price data is token-gated for now)
  { id: 'westernkosher', name: 'Western Kosher', city: 'Los Angeles, CA', address: '4817 W Pico Blvd', areaId: 'la', lat: 34.048, lng: -118.345, status: 'live' },
  { id: 'koshco', name: 'Koshco', city: 'Los Angeles, CA', areaId: 'la', lat: 34.053, lng: -118.377, status: 'live' },

  // Baltimore
  { id: 'marketmaven', name: 'Market Maven', city: 'Baltimore, MD', areaId: 'baltimore', lat: 39.373, lng: -76.717, status: 'live' },
];

export interface Origin {
  label: string;
  lat: number;
  lng: number;
  source: 'area' | 'gps';
  areaId?: string; // set when picked from an area (not GPS)
}

// Great-circle distance in miles.
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface StoreWithDist extends KStore {
  miles: number;
}

export function storesNear(origin: Origin, maxMiles: number): StoreWithDist[] {
  return KSTORES.map((st) => ({ ...st, miles: milesBetween(origin.lat, origin.lng, st.lat, st.lng) }))
    .filter((st) => st.miles <= maxMiles)
    .sort((a, b) => a.miles - b.miles);
}

// Stores the user has chosen to hide from comparisons (Settings → stores you shop).
let HIDDEN = new Set<string>();
export function setHiddenStores(ids: string[]): void {
  HIDDEN = new Set(ids);
}
export const isStoreHidden = (id: string): boolean => HIDDEN.has(id);

// Every store in the current view's area, nearest first (ignores the hidden set,
// so the Settings toggle can list them all to turn back on).
export function areaStores(origin: Origin, maxMiles: number): StoreWithDist[] {
  return storesNear(origin, maxMiles).filter((n) => (origin.areaId ? n.areaId === origin.areaId : true));
}

// The stores that "belong" to the current view, nearest first. If an area is
// picked (Teaneck, Five Towns, …) we scope to that area only, so a store from a
// different city never bleeds in. With GPS we fall back to nearest-by-distance.
// Stores the user hid in Settings are dropped.
export function areaStoreIds(origin: Origin, maxMiles: number): string[] {
  return areaStores(origin, maxMiles)
    .map((n) => n.id)
    .filter((id) => !HIDDEN.has(id));
}

// The two stores we have live price data for, keyed for distance gating.
export const LIVE_STORE_IDS = ['ge', 'gl'];

export function liveStoresInRange(origin: Origin, maxMiles: number): boolean {
  const live = KSTORES.filter((s) => LIVE_STORE_IDS.includes(s.id));
  return live.every((s) => milesBetween(origin.lat, origin.lng, s.lat, s.lng) <= maxMiles);
}
