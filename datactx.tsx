import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { setBrands, setCatalog, setCurated, setCuratedSizes } from './catalog';
import { PRICES_UPDATED } from './prices';
import { fetchRemoteData, loadCachedData } from './remote';
import { setWeeklyAds } from './weeklyAds';
// Compact bundled floor (curated prices + brand comparison), ~50KB. Guarantees
// the tabs/drill-down have data offline and before the remote feed loads; a
// fresher remote feed overrides it. Emitted by the scraper alongside data.json.
import overlay from './feed-overlay.json';

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
    const apply = (data: { updatedAt?: string; catalog?: any; weeklyAds?: any; curated?: any; curatedSizes?: any; brands?: any } | null) => {
      if (!alive || !data) return;
      if (data.catalog) setCatalog(data.catalog);
      // Only override the overlay fields when the incoming feed actually carries
      // them — so an older remote feed (no brands yet) can't wipe the bundled floor.
      if (data.curated) setCurated(data.curated);
      if (data.curatedSizes) setCuratedSizes(data.curatedSizes);
      if (data.brands) setBrands(data.brands);
      setWeeklyAds(data.weeklyAds);
      if (data.updatedAt) setUpdatedAt(data.updatedAt);
      setVersion((v) => v + 1);
    };
    apply(overlay); // bundled floor: curated + brands available immediately
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
