// Auth state for the whole app — wraps Supabase email/password sign-in/up/out.
// When Supabase isn't configured yet, `configured` is false and the UI shows a
// friendly "coming soon" instead of trying to authenticate.

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

import { supabase, authConfigured } from './supabase';

// Finish any auth session that was pending when the app was backgrounded.
WebBrowser.maybeCompleteAuthSession();

// Pull Supabase's returned tokens out of the redirect URL (they come back in the
// fragment on native). URLSearchParams is available via the url polyfill.
function tokensFromUrl(url: string): { access_token?: string; refresh_token?: string; error?: string } {
  const hash = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
  const p = new URLSearchParams(hash);
  return {
    access_token: p.get('access_token') ?? undefined,
    refresh_token: p.get('refresh_token') ?? undefined,
    error: p.get('error_description') ?? p.get('error') ?? undefined,
  };
}

interface AuthResult {
  error?: string;
  needsConfirmation?: boolean; // sign-up when email confirmation is required
}

interface AuthState {
  configured: boolean;
  loading: boolean; // still restoring a saved session
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, emailUpdates?: boolean) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<AuthResult>; // deletes the server user + data, then signs out
  setEmailUpdates: (v: boolean) => Promise<void>; // weekly-updates opt-in (stored on the user)
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      configured: authConfigured,
      loading,
      session,
      user: session?.user ?? null,
      signIn: async (email, password) => {
        if (!supabase) return { error: 'Accounts aren’t set up yet.' };
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return { error: error?.message };
      },
      signUp: async (email, password, emailUpdates = true) => {
        if (!supabase) return { error: 'Accounts aren’t set up yet.' };
        // Store the weekly-updates opt-in on the user (auth.users.user_metadata) so
        // you can later export everyone who opted in.
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { emailUpdates } },
        });
        if (error) return { error: error.message };
        return { needsConfirmation: !data.session }; // no session back = must confirm via email
      },
      signInWithGoogle: async () => {
        if (!supabase) return { error: 'Accounts aren’t set up yet.' };
        try {
          const redirectTo = makeRedirectUri();
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo, skipBrowserRedirect: true },
          });
          if (error) return { error: error.message };
          if (!data?.url) return { error: 'Could not start Google sign-in.' };
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
          if (result.type !== 'success') return {}; // user closed the browser — not an error
          const { access_token, refresh_token, error: urlErr } = tokensFromUrl(result.url);
          if (urlErr) return { error: urlErr };
          if (!access_token || !refresh_token) return { error: 'Google sign-in did not return a session.' };
          const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
          return { error: setErr?.message };
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Google sign-in failed.' };
        }
      },
      signOut: async () => {
        await supabase?.auth.signOut();
      },
      deleteAccount: async () => {
        if (!supabase) return {};
        // Best-effort: this Edge Function removes the auth user + their cloud data.
        // It was deployed under Supabase's default slug "dynamic-function" (the slug
        // can't be renamed after creation), so we invoke that name.
        // If it isn't reachable, we still sign out so local data can be wiped.
        try {
          await supabase.functions.invoke('dynamic-function');
        } catch {}
        await supabase.auth.signOut();
        return {};
      },
      setEmailUpdates: async (v) => {
        try {
          await supabase?.auth.updateUser({ data: { emailUpdates: v } });
        } catch {}
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
