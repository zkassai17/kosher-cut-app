import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { setBrands, setCatalog, setCurated } from './catalog';
import { PRICES_UPDATED } from './prices';
import { fetchRemoteData, loadCachedData } from './remote';
import { setWeeklyAds } from './weeklyAds';

// Exposes the "prices as of" date and bumps `version` whenever fresher data is
// swapped in, so screens re-render with the new catalog.
interface DataState {
  updatedAt: string;
  version: number;
}

const DataContext = createContext<DataState>({ updatedAt: PRICES_UPDATED, version: 0 });

export function DataProvider({ children }: { children: ReactNode }) {
  const [updatedAt, setUpdatedAt] = useState(PRICES_UPDATED);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const apply = (data: { updatedAt?: string; catalog?: any; weeklyAds?: any; curated?: any; brands?: any } | null) => {
      if (!alive || !data) return;
      setCatalog(data.catalog);
      setCurated(data.curated);
      setBrands(data.brands);
      setWeeklyAds(data.weeklyAds);
      if (data.updatedAt) setUpdatedAt(data.updatedAt);
      setVersion((v) => v + 1);
    };
    (async () => {
      apply(await loadCachedData()); // instant: last saved feed
      apply(await fetchRemoteData()); // background: newest feed
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => ({ updatedAt, version }), [updatedAt, version]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  return useContext(DataContext);
}
