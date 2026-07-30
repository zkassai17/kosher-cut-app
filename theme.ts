import { Platform } from 'react-native';

export type Scheme = 'light' | 'dark';

export interface Theme {
  paper: string;
  surface: string;
  surface2: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  lineStrong: string;
  brand: string;
  brandInk: string;
  brandSoft: string;
  gold: string;
  goldBg: string;
  goldLine: string;
  goldStrong: string;
  oxblood: string;
  live: string;
}

const light: Theme = {
  paper: '#F3F1EA',
  surface: '#FBFAF6',
  surface2: '#F7F5EE',
  ink: '#1E231D',
  inkSoft: '#56604F',
  inkFaint: '#8A9382',
  line: '#E1DED3',
  lineStrong: '#CFCBBD',
  brand: '#1E5140',
  brandInk: '#163B2F',
  brandSoft: '#E4EDE7',
  gold: '#9C6E14',
  goldBg: '#F5E8C8',
  goldLine: '#E4CE96',
  goldStrong: '#B8851E',
  oxblood: '#8A3B34',
  live: '#2C7A5B',
};

const dark: Theme = {
  paper: '#12150F',
  surface: '#1A1E16',
  surface2: '#161A13',
  ink: '#ECEAE0',
  inkSoft: '#9AA391',
  inkFaint: '#6E7767',
  line: '#2B3126',
  lineStrong: '#3A4234',
  brand: '#5FB98C',
  brandInk: '#BFE6D2',
  brandSoft: '#1E2C24',
  gold: '#DBAA48',
  goldBg: '#2E280F',
  goldLine: '#4A3F1E',
  goldStrong: '#E7BC5B',
  oxblood: '#CE8478',
  live: '#57C596',
};

export const getTheme = (scheme: string | null | undefined): Theme =>
  scheme === 'dark' ? dark : light;

// A monospace face for prices / labels — the "receipt & scale" signature.
export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

// Manrope — a clean, modern sans (loaded in App.tsx via expo-font).
export const sans = {
  reg: 'Manrope_400Regular',
  med: 'Manrope_500Medium',
  semi: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  xbold: 'Manrope_800ExtraBold',
};
