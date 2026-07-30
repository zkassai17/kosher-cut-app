import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import * as Location from 'expo-location';

import { AREAS, Area, milesBetween, Origin } from './stores';

interface LocationState {
  origin: Origin;
  maxMiles: number;
  gpsStatus: 'idle' | 'loading' | 'error';
  setArea: (a: Area) => void;
  setMaxMiles: (m: number) => void;
  useMyLocation: () => Promise<void>;
  setAddress: (addr: string) => Promise<boolean>;
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

const defaultArea = AREAS[0];
const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<Origin>({
    label: defaultArea.label,
    lat: defaultArea.lat,
    lng: defaultArea.lng,
    source: 'area',
    areaId: defaultArea.id,
  });
  const [maxMiles, setMaxMiles] = useState(15);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const value = useMemo<LocationState>(
    () => ({
      origin,
      maxMiles,
      gpsStatus,
      setArea: (a) => setOrigin({ label: a.label, lat: a.lat, lng: a.lng, source: 'area', areaId: a.id }),
      setMaxMiles,
      useMyLocation: async () => {
        try {
          setGpsStatus('loading');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            setGpsStatus('error');
            return;
          }
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const { latitude, longitude } = pos.coords;
          const nearest = nearestArea(latitude, longitude);
          setOrigin({
            label: `My location · near ${nearest.label.split(' (')[0].split(' /')[0]}`,
            lat: latitude,
            lng: longitude,
            source: 'gps',
            areaId: nearest.id,
          });
          setGpsStatus('idle');
        } catch {
          setGpsStatus('error');
        }
      },
      setAddress: async (addr) => {
        const query = addr.trim();
        if (!query) return false;
        try {
          setGpsStatus('loading');
          // expo-location's built-in geocoder (iOS CoreLocation) — no API key.
          const results = await Location.geocodeAsync(query);
          if (!results.length) {
            setGpsStatus('error');
            return false;
          }
          const { latitude, longitude } = results[0];
          const nearest = nearestArea(latitude, longitude);
          setOrigin({ label: query, lat: latitude, lng: longitude, source: 'gps', areaId: nearest.id });
          setGpsStatus('idle');
          return true;
        } catch {
          setGpsStatus('error');
          return false;
        }
      },
    }),
    [origin, maxMiles, gpsStatus],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
