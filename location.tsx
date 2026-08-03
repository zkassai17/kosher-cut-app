import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AREAS, Area, milesBetween, Origin, setHiddenStores } from './stores';

interface LocationState {
  origin: Origin;
  maxMiles: number;
  autoLocate: boolean; // true = use device GPS automatically on launch
  hiddenStores: string[]; // stores the user has toggled off in Settings
  gpsStatus: 'idle' | 'loading' | 'error';
  setArea: (a: Area) => void;
  setMaxMiles: (m: number) => void;
  setAutoLocate: (on: boolean) => void;
  toggleStore: (id: string) => void;
  useMyLocation: () => Promise<void>;
  setAddress: (addr: string) => Promise<boolean>;
  reset: () => void; // delete-account: back to default area, 15 mi, no hidden stores
}

// Nearest area to a lat/lng — used so a typed address / GPS still gets a clean
// area-scoped comparison while keeping the exact coords for distances.
function nearestArea(lat: number, lng: number): Area {
  let nearest = AREAS[0];
  let best = Infinity;
  for (const a of AREAS) {
    const d = milesBetween(lat, lng, a.lat, a.lng);
    if (d < best) {
      best = d;
      nearest = a;
    }
  }
  return nearest;
}

// Short, header-friendly area name: "Five Towns (Cedarhurst)" -> "Five Towns".
const shortAreaName = (a: Area): string => a.label.split(' (')[0].split(' /')[0].trim();

const defaultArea = AREAS[0];
const defaultOrigin: Origin = {
  label: defaultArea.label,
  lat: defaultArea.lat,
  lng: defaultArea.lng,
  source: 'area',
  areaId: defaultArea.id,
};

const PREFS_KEY = 'kc.loc.v1';
const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<Origin>(defaultOrigin);
  const [maxMiles, setMaxMiles] = useState(15);
  const [autoLocate, setAutoLocateState] = useState(false);
  const [hiddenStores, setHiddenState] = useState<string[]>([]);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const hydrated = useRef(false);

  const runGps = useCallback(async () => {
    try {
      setGpsStatus('loading');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('error');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const nearest = nearestArea(latitude, longitude);
      // Header shows the clean area name (the ◉ pin already signals "your location").
      setOrigin({ label: shortAreaName(nearest), lat: latitude, lng: longitude, source: 'gps', areaId: nearest.id });
      setGpsStatus('idle');
    } catch {
      setGpsStatus('error');
    }
  }, []);

  // Load saved prefs once on launch (and auto-locate if that's the saved mode).
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (typeof p.maxMiles === 'number') setMaxMiles(p.maxMiles);
          if (typeof p.autoLocate === 'boolean') setAutoLocateState(p.autoLocate);
          if (Array.isArray(p.hiddenStores)) {
            setHiddenState(p.hiddenStores);
            setHiddenStores(p.hiddenStores);
          }
          if (p.autoLocate) runGps();
          else if (p.origin && p.origin.label) setOrigin(p.origin);
        }
      } catch {}
      hydrated.current = true;
    })();
  }, [runGps]);

  // Persist prefs on change (after the first load, so we don't clobber saved data).
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ origin, maxMiles, autoLocate, hiddenStores })).catch(() => {});
  }, [origin, maxMiles, autoLocate, hiddenStores]);

  const toggleStore = useCallback((id: string) => {
    setHiddenState((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setHiddenStores(next); // keep the pure areaStoreIds() filter in sync
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setOrigin(defaultOrigin);
    setMaxMiles(15);
    setAutoLocateState(false);
    setHiddenState([]);
    setHiddenStores([]);
  }, []);

  const setArea = useCallback((a: Area) => {
    setAutoLocateState(false); // choosing a fixed area turns off auto-locate
    setOrigin({ label: a.label, lat: a.lat, lng: a.lng, source: 'area', areaId: a.id });
  }, []);

  const setAutoLocate = useCallback(
    (on: boolean) => {
      setAutoLocateState(on);
      if (on) runGps();
    },
    [runGps],
  );

  const setAddress = useCallback(async (addr: string): Promise<boolean> => {
    const query = addr.trim();
    if (!query) return false;
    try {
      setGpsStatus('loading');
      const results = await Location.geocodeAsync(query); // iOS CoreLocation, no API key
      if (!results.length) {
        setGpsStatus('error');
        return false;
      }
      const { latitude, longitude } = results[0];
      const nearest = nearestArea(latitude, longitude);
      setAutoLocateState(false);
      setOrigin({ label: query, lat: latitude, lng: longitude, source: 'gps', areaId: nearest.id });
      setGpsStatus('idle');
      return true;
    } catch {
      setGpsStatus('error');
      return false;
    }
  }, []);

  const value = useMemo<LocationState>(
    () => ({ origin, maxMiles, autoLocate, hiddenStores, gpsStatus, setArea, setMaxMiles, setAutoLocate, toggleStore, useMyLocation: runGps, setAddress, reset }),
    [origin, maxMiles, autoLocate, hiddenStores, gpsStatus, setArea, setAutoLocate, toggleStore, runGps, setAddress, reset],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
