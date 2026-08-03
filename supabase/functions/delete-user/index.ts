// Supabase Edge Function: delete-user
// Permanently deletes the calling user's account + their cloud data. Called by the
// app's "Delete account" button. Uses the service-role key (server-side only) to
// remove the auth user — something the app itself is not allowed to do with the
// public key, which is exactly why this runs on the server.
//
// Deploy (one time, needs the Supabase CLI + your login):
//   supabase functions deploy delete-user --project-ref hgfgujtusngurhlujldp
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    if (!jwt) return json({ error: 'missing token' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Who is calling?
    const { data: u, error: uErr } = await admin.auth.getUser(jwt);
    if (uErr || !u?.user) return json({ error: 'invalid token' }, 401);
    const uid = u.user.id;

    // Remove their data, then the auth user itself.
    await admin.from('user_data').delete().eq('user_id', uid);
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
