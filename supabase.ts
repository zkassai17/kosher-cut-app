// Supabase client — configured for React Native (AsyncStorage session storage,
// URL polyfill). Null until you fill in supabaseConfig.ts, so the app never
// crashes when accounts aren't set up yet.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_URL, SUPABASE_ANON_KEY, authConfigured } from './supabaseConfig';

export const supabase: SupabaseClient | null = authConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // no browser URL to read the session from on native
      },
    })
  : null;

export { authConfigured };
