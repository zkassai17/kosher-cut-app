// Lightweight, self-hosted analytics — events go to the Supabase `events` table
// (no third-party SDK). Fire-and-forget and ALWAYS non-fatal: if the table/policy
// isn't set up yet, or the network is down, tracking silently no-ops and the app
// is completely unaffected. We only record for signed-in users (matches the RLS
// policy that lets a user insert rows tagged with their own id).

import { Platform } from 'react-native';
import { supabase } from './supabase';

let currentUserId: string | null = null;

// Called by the auth layer whenever the signed-in user changes.
export function setAnalyticsUser(id: string | null): void {
  currentUserId = id;
}

// Record one event. `props` is free-form (query, area, count, …); `area` is also
// stored as its own column so "group by area" is trivial in SQL.
export function track(event: string, props: Record<string, unknown> = {}): void {
  if (!supabase || !currentUserId) return;
  supabase
    .from('events')
    .insert({ user_id: currentUserId, event, props, area: (props.area as string) ?? null, platform: Platform.OS })
    .then(
      () => {},
      () => {},
    );
}
