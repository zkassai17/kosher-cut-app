// ─────────────────────────────────────────────────────────────────────────────
// Supabase project keys — paste yours here to turn on real accounts.
//
// 1. Create a free project at https://supabase.com  (New project).
// 2. In the dashboard: Project Settings → API.
// 3. Copy "Project URL" into SUPABASE_URL and the "anon public" key into
//    SUPABASE_ANON_KEY below.
//
// The anon/public key is SAFE to ship in a mobile app — it only allows what your
// Row Level Security policies permit. (Never paste the "service_role" key here.)
//
// Until both are filled in, the app runs exactly as before and the Sign In screen
// shows a "coming soon" message instead of erroring.
// ─────────────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://hgfgujtusngurhlujldp.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_X0pTw8ZHdupRq1p0FbYZ2g_iUMS1DnY';

export const authConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
