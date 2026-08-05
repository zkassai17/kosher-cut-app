// Tiny personal profile — just a display name for now, saved on-device but keyed
// PER ACCOUNT, so a different sign-in doesn't inherit the previous user's name.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './auth';

interface ProfileState {
  name: string;
  setName: (n: string) => void;
}

// Name is stored under a per-account key so accounts stay isolated on a shared device.
const keyFor = (userId?: string) => `kc.profile.${userId ?? 'guest'}.v1`;
const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [name, setNameState] = useState('');

  // Load (or clear) the name whenever the signed-in account changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(keyFor(user?.id));
        if (!alive) return;
        setNameState(raw ? JSON.parse(raw).name ?? '' : '');
      } catch {
        if (alive) setNameState('');
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const setName = useCallback(
    (n: string) => {
      setNameState(n);
      AsyncStorage.setItem(keyFor(user?.id), JSON.stringify({ name: n })).catch(() => {});
    },
    [user?.id],
  );

  const value = useMemo(() => ({ name, setName }), [name, setName]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
