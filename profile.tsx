// Tiny personal profile — just a display name for now, saved on-device. Kept
// separate from location so the account page can greet the user by name.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProfileState {
  name: string;
  setName: (n: string) => void;
}

const KEY = 'kc.profile.v1';
const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState('');
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (typeof p.name === 'string') setNameState(p.name);
        }
      } catch {}
      hydrated.current = true;
    })();
  }, []);

  const setName = useCallback((n: string) => {
    setNameState(n);
    AsyncStorage.setItem(KEY, JSON.stringify({ name: n })).catch(() => {});
  }, []);

  const value = useMemo(() => ({ name, setName }), [name, setName]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
