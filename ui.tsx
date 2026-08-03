import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getTheme, Theme } from './theme';
import { makeStyles, Styles } from './styles';

export type ThemeMode = 'auto' | 'light' | 'dark';

interface UI {
  t: Theme;
  s: Styles;
  scheme: 'light' | 'dark';
  themeMode: ThemeMode; // 'auto' follows the phone; 'light'/'dark' override it
  setThemeMode: (m: ThemeMode) => void;
}

const KEY = 'kc.theme.v1';
const UIContext = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const raw = useColorScheme();
  const system: 'light' | 'dark' = raw === 'dark' ? 'dark' : 'light';
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'auto') setThemeModeState(saved);
      } catch {}
      hydrated.current = true;
    })();
  }, []);

  const setThemeMode = useCallback((m: ThemeMode) => {
    setThemeModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  }, []);

  const scheme: 'light' | 'dark' = themeMode === 'auto' ? system : themeMode;
  const value = useMemo<UI>(() => {
    const t = getTheme(scheme);
    return { t, s: makeStyles(t), scheme, themeMode, setThemeMode };
  }, [scheme, themeMode, setThemeMode]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UI {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
