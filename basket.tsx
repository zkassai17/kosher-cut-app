import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BasketItem, PRESETS } from './presets';
import { useAuth } from './auth';
import { pullUserData, pushUserData } from './sync';
import { animateNext } from './anim';

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
const CHECKED_KEY = 'kc.checked.v1'; // "got it" marks, per list — device-local, not synced
const OWNER_KEY = 'kc.owner.v1'; // which account the on-device lists belong to (isolation)
const REMOVED_KEY = 'kc.removedPresets.v1'; // preset lists the user deleted — kept out of the re-seed graft

const itemKey = (cat: string, id: string) => `${cat}:${id}`;

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
  setQty: (cat: string, id: string, n: number) => void; // set a saved item's quantity (n<1 removes)
  clear: () => void; // empty the active list
  resetActive: () => void; // restore the active list to its preset defaults
  createList: (label: string, emoji: string) => void; // add a custom list + make it active
  renameList: (id: string, label: string, emoji: string) => void; // rename + re-emoji any list
  deleteList: (id: string) => void; // remove a custom list
  isPreset: (id: string) => boolean; // preset lists can't be deleted, only reset
  importList: (list: { label: string; emoji: string; items: BasketItem[] }) => void; // from a shared list
  // "Just for this trip" items — added from the List tab, shown now but NOT saved
  // into the list. In-memory only (clear on app restart), per active list.
  tempItems: BasketItem[];
  hasTemp: (cat: string, id: string) => boolean;
  toggleTemp: (cat: string, id: string) => void;
  removeTemp: (cat: string, id: string) => void;
  setTempQty: (cat: string, id: string, n: number) => void; // qty for a this-trip item (n<1 removes)
  // "Got it" shopping checkmarks — per active list, saved on THIS device only (a
  // shopping trip is device-local, never synced). clearChecks starts a new trip.
  isGot: (cat: string, id: string) => boolean;
  toggleGot: (cat: string, id: string) => void;
  clearChecks: () => void;
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
  // "Got it" marks per list — device-local (a shopping trip isn't cloud state).
  const [checkedByList, setCheckedByList] = useState<Record<string, string[]>>({});
  const hydrated = useRef(false);
  const syncedUser = useRef<string | null>(null); // whose cloud pull we've STARTED
  const pulledUser = useRef<string | null>(null); // whose cloud pull has FINISHED (safe to push)
  const ownerRef = useRef<string | null>(null); // account the on-device data belongs to
  const removedPresets = useRef<Set<string>>(new Set()); // presets the user deleted — don't re-graft them
  const setOwner = (id: string) => {
    ownerRef.current = id;
    AsyncStorage.setItem(OWNER_KEY, id).catch(() => {});
  };

  // Load saved lists + regulars once on startup.
  useEffect(() => {
    (async () => {
      try {
        const [rawLists, rawActive, rawReg, rawChecked, rawOwner, rawRemoved] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ACTIVE_KEY),
          AsyncStorage.getItem(REGULARS_KEY),
          AsyncStorage.getItem(CHECKED_KEY),
          AsyncStorage.getItem(OWNER_KEY),
          AsyncStorage.getItem(REMOVED_KEY),
        ]);
        if (rawOwner) ownerRef.current = rawOwner;
        if (rawRemoved) removedPresets.current = new Set(JSON.parse(rawRemoved));
        if (rawChecked) setCheckedByList(JSON.parse(rawChecked));
        if (rawLists) {
          const stored: NamedList[] = JSON.parse(rawLists);
          // Keep saved lists; graft in any preset added since (so new presets show up) —
          // but never re-add a preset the user deliberately deleted.
          const byId = new Map(stored.map((l) => [l.id, l]));
          for (const p of PRESETS) {
            if (!byId.has(p.id) && !removedPresets.current.has(p.id))
              byId.set(p.id, { id: p.id, label: p.label, emoji: p.emoji, items: p.items.map((i) => ({ ...i })) });
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
      pulledUser.current = null;
      return;
    }
    if (syncedUser.current === user.id) return;
    syncedUser.current = user.id;
    // Is this a DIFFERENT account than the on-device data belongs to? (owner is
    // null only before anyone has ever signed in on this device.)
    const switchingAccount = ownerRef.current != null && ownerRef.current !== user.id;
    let alive = true;
    (async () => {
      const remote = await pullUserData(user.id);
      if (!alive) return;
      if (remote && remote.lists.length) {
        // This account has cloud data — load it (and drop the previous trip's checks).
        setLists(remote.lists);
        setActiveId(remote.lists[0]?.id ?? PRESETS[0].id);
        setRegulars(remote.regulars);
        if (switchingAccount) setCheckedByList({});
      } else if (switchingAccount) {
        // A different account with no cloud data yet → start FRESH. Never inherit the
        // previous account's lists just because they're still on this device.
        const fresh = seedLists();
        setLists(fresh);
        setActiveId(PRESETS[0].id);
        setRegulars([]);
        setCheckedByList({});
        pushUserData(user.id, fresh, []);
      } else {
        // First-ever sign-in on this device — seed the account from whatever's local.
        pushUserData(user.id, lists, regulars);
      }
      setOwner(user.id); // the on-device data now belongs to this account
      // Only NOW is it safe to push local edits — before this, a fast local change
      // could have overwritten the cloud copy we were still fetching.
      pulledUser.current = user.id;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Push changes up (debounced) — but ONLY after this user's pull has finished,
  // so we never clobber their synced data with whatever was on this device first.
  useEffect(() => {
    if (!user || pulledUser.current !== user.id) return;
    const t = setTimeout(() => pushUserData(user.id, lists, regulars), 800);
    return () => clearTimeout(t);
  }, [lists, regulars, user]);

  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(REGULARS_KEY, JSON.stringify(regulars)).catch(() => {});
  }, [regulars]);
  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(CHECKED_KEY, JSON.stringify(checkedByList)).catch(() => {});
  }, [checkedByList]);

  const active = lists.find((l) => l.id === activeId) ?? lists[0];

  const value = useMemo<BasketState>(() => {
    const editActive = (fn: (items: BasketItem[]) => BasketItem[]) =>
      setLists((prev) => prev.map((l) => (l.id === activeId ? { ...l, items: fn(l.items) } : l)));
    // Drop a "got it" mark when its item leaves the active list, so a later re-add
    // doesn't come back pre-checked.
    const dropCheck = (cat: string, id: string) =>
      setCheckedByList((prev) => {
        const cur = prev[activeId] ?? [];
        return cur.includes(itemKey(cat, id)) ? { ...prev, [activeId]: cur.filter((k) => k !== itemKey(cat, id)) } : prev;
      });
    return {
      lists,
      activeId,
      active,
      items: active.items,
      setActive: setActiveId,
      has: (cat, id) => active.items.some((i) => i.cat === cat && i.id === id),
      toggle: (cat, id) => {
        animateNext();
        editActive((items) =>
          items.some((i) => i.cat === cat && i.id === id)
            ? items.filter((i) => !(i.cat === cat && i.id === id))
            : [...items, { cat, id }],
        );
      },
      remove: (cat, id) => {
        animateNext();
        dropCheck(cat, id);
        editActive((items) => items.filter((i) => !(i.cat === cat && i.id === id)));
      },
      setQty: (cat, id, n) => {
        const q = Math.round(n);
        if (q < 1) {
          animateNext();
          dropCheck(cat, id);
          editActive((items) => items.filter((i) => !(i.cat === cat && i.id === id)));
          return;
        }
        editActive((items) => items.map((i) => (i.cat === cat && i.id === id ? { ...i, qty: Math.min(99, q) } : i)));
      },
      clear: () => editActive(() => []),
      resetActive: () => {
        const p = PRESETS.find((x) => x.id === activeId);
        if (p) {
          animateNext();
          editActive(() => p.items.map((i) => ({ ...i })));
          setCheckedByList((prev) => ({ ...prev, [activeId]: [] })); // fresh trip
        }
      },
      createList: (label, emoji) => {
        const id = `custom-${Date.now()}`;
        setLists((prev) => [...prev, { id, label: label.trim() || 'My list', emoji: emoji || '🛒', items: [] }]);
        setActiveId(id);
      },
      renameList: (id, label, emoji) =>
        setLists((prev) => prev.map((l) => (l.id === id ? { ...l, label: label.trim() || l.label, emoji: emoji || l.emoji } : l))),
      deleteList: (id) => {
        // Any list can be removed now, including presets — if you don't want a
        // Shabbos or Pesach list, delete it. We remember deleted presets so they
        // aren't re-added on the next launch. Always keep at least one list.
        setLists((prev) => {
          if (prev.length <= 1) return prev;
          const next = prev.filter((l) => l.id !== id);
          if (next.length === prev.length) return prev; // id not found
          if (PRESETS.some((p) => p.id === id)) {
            removedPresets.current.add(id);
            AsyncStorage.setItem(REMOVED_KEY, JSON.stringify([...removedPresets.current])).catch(() => {});
          }
          if (activeId === id) setActiveId(next[0].id);
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
      removeTemp: (cat, id) => {
        animateNext();
        dropCheck(cat, id);
        setTempByList((prev) => ({
          ...prev,
          [activeId]: (prev[activeId] ?? []).filter((i) => !(i.cat === cat && i.id === id)),
        }));
      },
      setTempQty: (cat, id, n) => {
        const q = Math.round(n);
        if (q < 1) {
          animateNext();
          dropCheck(cat, id);
          setTempByList((prev) => ({ ...prev, [activeId]: (prev[activeId] ?? []).filter((i) => !(i.cat === cat && i.id === id)) }));
          return;
        }
        setTempByList((prev) => ({
          ...prev,
          [activeId]: (prev[activeId] ?? []).map((i) => (i.cat === cat && i.id === id ? { ...i, qty: Math.min(99, q) } : i)),
        }));
      },
      isGot: (cat, id) => (checkedByList[activeId] ?? []).includes(itemKey(cat, id)),
      toggleGot: (cat, id) => {
        animateNext();
        setCheckedByList((prev) => {
          const cur = prev[activeId] ?? [];
          const k = itemKey(cat, id);
          return { ...prev, [activeId]: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] };
        });
      },
      clearChecks: () => {
        animateNext();
        setCheckedByList((prev) => ({ ...prev, [activeId]: [] }));
      },
      regulars,
      hasRegular: (cat, id) => regulars.some((i) => i.cat === cat && i.id === id),
      toggleRegular: (cat, id) => {
        animateNext();
        setRegulars((prev) =>
          prev.some((i) => i.cat === cat && i.id === id)
            ? prev.filter((i) => !(i.cat === cat && i.id === id))
            : [...prev, { cat, id }],
        );
      },
      removeRegular: (cat, id) => {
        animateNext();
        setRegulars((prev) => prev.filter((i) => !(i.cat === cat && i.id === id)));
      },
      wipeAll: () => {
        removedPresets.current = new Set();
        AsyncStorage.removeItem(REMOVED_KEY).catch(() => {});
        setLists(seedLists());
        setActiveId(PRESETS[0].id);
        setTempByList({});
        setRegulars([]);
        setCheckedByList({});
      },
    };
  }, [lists, activeId, active, tempByList, regulars, checkedByList]);

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketState {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket must be used within BasketProvider');
  return ctx;
}
