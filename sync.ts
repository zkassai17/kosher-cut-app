// Cloud sync for a signed-in user's lists + regulars (Supabase `user_data` table).
// Non-fatal everywhere: if the table doesn't exist yet, the network is down, or
// the user isn't configured, these quietly no-op and the app keeps using local data.

import { supabase } from './supabase';
import { BasketItem } from './presets';

const TABLE = 'user_data';

export interface UserData {
  lists: any[]; // NamedList[] — kept as any here to avoid a circular import with basket.tsx
  regulars: BasketItem[];
}

// Pull the signed-in user's saved data. Returns null if there's nothing (or on error).
export async function pullUserData(userId: string): Promise<UserData | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from(TABLE).select('lists, regulars').eq('user_id', userId).maybeSingle();
    if (error || !data) return null;
    return {
      lists: Array.isArray(data.lists) ? data.lists : [],
      regulars: Array.isArray(data.regulars) ? data.regulars : [],
    };
  } catch {
    return null;
  }
}

// Save the signed-in user's data (upsert one row per user).
export async function pushUserData(userId: string, lists: any[], regulars: BasketItem[]): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from(TABLE)
      .upsert({ user_id: userId, lists, regulars, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch {}
}
