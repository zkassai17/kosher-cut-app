# Turning on real accounts (Supabase)

The app has full email/password sign-in & sign-up built in — it just needs a free
Supabase project. Until you add the keys, the Sign In screen shows a "coming soon"
note and nothing breaks.

## Steps (about 5 minutes)

1. Go to <https://supabase.com> → **Start your project** (free) → **New project**.
   Pick a name and a database password (you won't need the password in the app).
2. When it finishes provisioning, open **Project Settings → API**.
3. Copy two values into **`supabaseConfig.ts`** in this repo:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   (The anon key is safe to ship in a mobile app. Never paste the `service_role` key.)
4. (Recommended for testing) **Authentication → Providers → Email** → turn **OFF**
   "Confirm email." Then sign-up logs you straight in. Leave it ON for production if
   you want email verification (the app handles the "check your email" flow either way).
5. Reload the app → Account → **Sign in to sync** → create an account.

That's it — sessions persist across app restarts automatically.

## What works now

- Email + password **sign up** and **sign in**
- Session persists (stays signed in after closing the app)
- **Log out** (Settings → ACCOUNT) and **Delete account** (local data)
- The Account banner shows "Synced · your@email" when signed in

## Turning on "Continue with Google"

The button is wired (opens a Google sign-in browser and sets the session). It needs
a Google OAuth client + the provider enabled in Supabase:

1. **Google Cloud Console** (<https://console.cloud.google.com>) → APIs & Services →
   **Credentials** → **Create credentials → OAuth client ID** → **Web application**.
   - Under **Authorized redirect URIs** add:
     `https://YOURPROJECT.supabase.co/auth/v1/callback`
   - Create it, copy the **Client ID** and **Client secret**.
2. **Supabase** → Authentication → **Providers → Google** → enable, paste the Client
   ID + secret, save.
3. **Supabase** → Authentication → **URL Configuration → Redirect URLs** → add the
   app's redirect so Supabase will hand the session back:
   - `koshercart://` (for a dev/production build — the app scheme)
   - In **Expo Go** the redirect is `exp://<your-ip>:8090/--/` and changes with your
     IP, so Google sign-in is easiest to test in a real EAS **dev build**. Email/password
     works fine in Expo Go.

That's it — tap "Continue with Google" and it opens Google, then drops you back signed in.

## Not yet wired (follow-up)

- **Syncing your lists to the cloud** — auth is in place but lists still live only on
  the device. Next step: a `lists` table with Row Level Security keyed to `auth.uid()`,
  and push/pull on sign-in. Ask and I'll build it.

## Deleting a real account

The in-app "Delete account" clears local data. To also delete the Supabase auth user,
that requires a server-side call (Supabase Edge Function) — a small follow-up once
accounts are live and you want full end-to-end deletion for App Store compliance.
