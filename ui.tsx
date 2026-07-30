import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { getTheme, Theme } from './theme';
import { makeStyles, Styles } from './styles';

interface UI {
  t: Theme;
  s: Styles;
  scheme: 'light' | 'dark';
}

const UIContext = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const raw = useColorScheme();
  const scheme: 'light' | 'dark' = raw === 'dark' ? 'dark' : 'light';
  const value = useMemo<UI>(() => {
    const t = getTheme(scheme);
    return { t, s: makeStyles(t), scheme };
  }, [scheme]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UI {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
