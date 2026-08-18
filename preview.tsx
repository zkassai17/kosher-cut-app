// User-chosen "preview" items shown on every Store card (Stores tab). Pinning the
// SAME items across all stores turns the card into a quick apples-to-apples
// comparison ("who's cheapest on the things I actually buy"). Defaults to a
// sensible staple set; persisted locally.

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Pick {
  cat: string;
  id: string;
}

// Common staples people compare — the "great default".
export const DEFAULT_PICKS: Pick[] = [
  { cat: 'dairy', id: 'milk' },
  { cat: 'chicken', id: 'cutlets' },
  { cat: 'beef', id: 'ground_beef' },
];

export const MAX_PICKS = 5;
const KEY = 'kc.preview.picks.v1';

interface PreviewState {
  picks: Pick[];
  toggle: (cat: string, id: string) => void;
  has: (cat: string, id: string) => boolean;
  reset: () => void;
}

const PreviewContext = createContext<PreviewState | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [picks, setPicks] = useState<Pick[]>(DEFAULT_PICKS);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setPicks(parsed);
        }
      } catch {
        /* keep defaults */
      }
    })();
  }, []);

  const persist = (next: Pick[]) => {
    setPicks(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<PreviewState>(
    () => ({
      picks,
      has: (cat, id) => picks.some((p) => p.cat === cat && p.id === id),
      toggle: (cat, id) => {
        const exists = picks.some((p) => p.cat === cat && p.id === id);
        if (exists) persist(picks.filter((p) => !(p.cat === cat && p.id === id)));
        else if (picks.length < MAX_PICKS) persist([...picks, { cat, id }]);
      },
      reset: () => persist(DEFAULT_PICKS),
    }),
    [picks]
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewState {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider');
  return ctx;
}
