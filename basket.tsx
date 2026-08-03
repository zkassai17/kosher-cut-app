import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BasketItem, PRESETS } from './presets';
import { useAuth } from './auth';
import { pullUserData, pushUserData } from './sync';

// A named, editable shopping list (Shabbos, Rosh Hashana, …). Each one is
// independent — selecting one shows only its items; adding an item from the
// Prices tab adds to whichever list is ACTIVE. Everything is saved to the
// device so your customizations stick (per-account cloud sync = a later backend).

export interface NamedList {
  id: string;
  label: string;
  emoji: string;
  items: BasketItem[];
}

const STORAGE_KEY = 'kc.lists.v1';
const ACTIVE_KEY = 'kc.activeList.v1';
const REGULARS_KEY = 'kc.regulars.v1';

const seedLists = (): NamedList[] =>
  PRESETS.map((p) => ({ id: p.id, label: p.label, emoji: p.emoji, items: p.items.map((i) => ({ ...i })) }));

interface BasketState {
  lists: NamedList[];
  activeId: string;
  active: NamedList;
  items: BasketItem[]; // the active list's items
  setActive: (id: string) => void;
  has: (cat: string, id: string) => boolean;
  toggle: (cat: string, id: string) => void;
  remove: (cat: string, id: string) => void;
  clear: () => void; // empty the active list
  resetActive: () => void; // restore the active list to its preset defaults
  createList: (label: string, emoji: string) => void; // add a custom list + make it active
  deleteList: (id: string) => void; // remove a custom list
  isPreset: (id: string) => boolean; // preset lists can't be deleted, only reset
  importList: (list: { label: string; emoji: string; items: BasketItem[] }) => void; // from a shared list
  // "Just for this trip" items — added from the List tab, shown now but NOT saved
  // into the list. In-memory only (clear on app restart), per active list.
  tempItems: BasketItem[];
  hasTemp: (cat: string, id: string) => boolean;
  toggleTemp: (cat: string, id: string) => void;
  removeTemp: (cat: string, id: string) => void;
  // "My Regulars" — the products you always buy; we watch where each is cheapest.
  regulars: BasketItem[];
  hasRegular: (cat: string, id: string) => boolean;
  toggleRegular: (cat: string, id: string) => void;
  removeRegular: (cat: string, id: string) => void;
  wipeAll: () => void; // delete-account: reset lists/regulars/temp back to a fresh install
}

const BasketContext = createContext<BasketState | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lists, setLists] = useState<NamedList[]>(seedLists);
  const [activeId, setActiveId] = useState<string>(PRESETS[0].id);
  // "This trip" items, keyed by list id — NOT persisted (fresh each app launch).
  const [tempByList, setTempByList] = useState<Record<string, BasketItem[]>>({});
  const [regulars, setRegulars] = useState<BasketItem[]>([]);
  const hydrated = useRef(false);
  const syncedUser = useRef<string | null>(null); // whose cloud data we've pulled

  // Load saved lists + regulars once on startup.
  useEffect(() => {
    (async () => {
      try {
        const [rawLists, rawActive, rawReg] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ACTIVE_KEY),
          AsyncStorage.getItem(REGULARS_KEY),
        ]);
        if (rawLists) {
          const stored: NamedList[] = JSON.parse(rawLists);
          // Keep saved lists; graft in any preset added since (so new presets show up).
          const byId = new Map(stored.map((l) => [l.id, l]));
          for (const p of PRESETS) {
            if (!byId.has(p.id)) byId.set(p.id, { id: p.id, label: p.label, emoji: p.emoji, items: p.items.map((i) => ({ ...i })) });
          }
          setLists(Array.from(byId.values()));
        }
        if (rawActive) setActiveId(rawActive);
        if (rawReg) setRegulars(JSON.parse(rawReg));
      } catch {}
      hydrated.current = true;
    })();
  }, []);

  // Persist on change (skip the first render before we've loaded).
  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lists)).catch(() => {});
  }, [lists]);
  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(ACTIVE_KEY, activeId).catch(() => {});
  }, [activeId]);
  // ---- Cloud sync (signed-in users) --------------------------------------
  // On sign-in: pull the account's lists/regulars. If the account has none yet,
  // seed it from what's on this device. Remote is the source of truth once signed in.
  useEffect(() => {
    if (!user) {
      syncedUser.current = null;
      return;
    }
    if (syncedUser.current === user.id) return;
    syncedUser.current = user.id;
    let alive = true;
    (async () => {
      const remote = await pullUserData(user.id);
      if (!alive) return;
      if (remote && remote.lists.length) {
        setLists(remote.lists);
        setActiveId(remote.lists[0]?.id ?? PRESETS[0].id);
        setRegulars(remote.regulars);
      } else {
        pushUserData(user.id, lists, regulars); // first sign-in on this account — seed from local
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Push changes up (debounced) once we've pulled this user's data.
  useEffect(() => {
    if (!user || syncedUser.current !== user.id) return;
    const t = setTimeout(() => pushUserData(user.id, lists, regulars), 800);
    return () => clearTimeout(t);
  }, [lists, regulars, user]);

  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(REGULARS_KEY, JSON.stringify(regulars)).catch(() => {});
  }, [regulars]);

  const active = lists.find((l) => l.id === activeId) ?? lists[0];

  const value = useMemo<BasketState>(() => {
    const editActive = (fn: (items: BasketItem[]) => BasketItem[]) =>
      setLists((prev) => prev.map((l) => (l.id === activeId ? { ...l, items: fn(l.items) } : l)));
    return {
      lists,
      activeId,
      active,
      items: active.items,
      setActive: setActiveId,
      has: (cat, id) => active.items.some((i) => i.cat === cat && i.id === id),
      toggle: (cat, id) =>
        editActive((items) =>
          items.some((i) => i.cat === cat && i.id === id)
            ? items.filter((i) => !(i.cat === cat && i.id === id))
            : [...items, { cat, id }],
        ),
      remove: (cat, id) => editActive((items) => items.filter((i) => !(i.cat === cat && i.id === id))),
      clear: () => editActive(() => []),
      resetActive: () => {
        const p = PRESETS.find((x) => x.id === activeId);
        if (p) editActive(() => p.items.map((i) => ({ ...i })));
      },
      createList: (label, emoji) => {
        const id = `custom-${Date.now()}`;
        setLists((prev) => [...prev, { id, label: label.trim() || 'My list', emoji: emoji || '🛒', items: [] }]);
        setActiveId(id);
      },
      deleteList: (id) => {
        if (PRESETS.some((p) => p.id === id)) return; // presets stay
        setLists((prev) => {
          const next = prev.filter((l) => l.id !== id);
          if (activeId === id) setActiveId(next[0]?.id ?? PRESETS[0].id);
          return next;
        });
      },
      isPreset: (id) => PRESETS.some((p) => p.id === id),
      importList: (list) => {
        const id = `custom-${Date.now()}`;
        setLists((prev) => [
          ...prev,
          {
            id,
            label: (list.label || 'Shared list').trim(),
            emoji: list.emoji || '🛒',
            items: (list.items || []).map((i) => ({ cat: i.cat, id: i.id })),
          },
        ]);
        setActiveId(id);
      },
      tempItems: tempByList[activeId] ?? [],
      hasTemp: (cat, id) => (tempByList[activeId] ?? []).some((i) => i.cat === cat && i.id === id),
      toggleTemp: (cat, id) =>
        setTempByList((prev) => {
          const cur = prev[activeId] ?? [];
          const exists = cur.some((i) => i.cat === cat && i.id === id);
          return { ...prev, [activeId]: exists ? cur.filter((i) => !(i.cat === cat && i.id === id)) : [...cur, { cat, id }] };
        }),
      removeTemp: (cat, id) =>
        setTempByList((prev) => ({
          ...prev,
          [activeId]: (prev[activeId] ?? []).filter((i) => !(i.cat === cat && i.id === id)),
        })),
      regulars,
      hasRegular: (cat, id) => regulars.some((i) => i.cat === cat && i.id === id),
      toggleRegular: (cat, id) =>
        setRegulars((prev) =>
          prev.some((i) => i.cat === cat && i.id === id)
            ? prev.filter((i) => !(i.cat === cat && i.id === id))
            : [...prev, { cat, id }],
        ),
      removeRegular: (cat, id) => setRegulars((prev) => prev.filter((i) => !(i.cat === cat && i.id === id))),
      wipeAll: () => {
        setLists(seedLists());
        setActiveId(PRESETS[0].id);
        setTempByList({});
        setRegulars([]);
      },
    };
  }, [lists, activeId, active, tempByList, regulars]);

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketState {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket must be used within BasketProvider');
  return ctx;
}
