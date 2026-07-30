import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BasketItem, PRESETS } from './presets';

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
}

const BasketContext = createContext<BasketState | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useState<NamedList[]>(seedLists);
  const [activeId, setActiveId] = useState<string>(PRESETS[0].id);
  const hydrated = useRef(false);

  // Load saved lists once on startup.
  useEffect(() => {
    (async () => {
      try {
        const [rawLists, rawActive] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ACTIVE_KEY),
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
    };
  }, [lists, activeId, active]);

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketState {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket must be used within BasketProvider');
  return ctx;
}
