# 🛒 koshercart — v1 → App Store: Definition of Done

Everything that must be TRUE before submitting to Apple. Local/mainstream stores are **v2** (blocked on external data) — do NOT gate v1 on them.

---

## ✅ Already done (features)
- [x] Price comparison (dairy + meat) across nearby stores
- [x] Brand-level comparison (tap a dairy item → brands, cheapest highlighted)
- [x] Shopping lists + presets, quantities, check-off, "1 store vs Split"
- [x] Accounts + cloud sync (Supabase), account isolation, account deletion
- [x] Analytics, onboarding, price-accuracy disclaimer
- [x] Terms of Use + Privacy Policy (hosted)
- [x] Branded app icon + splash
- [x] Daily automatic price refresh (GitHub Actions)

## 🟡 Buildable now — finish before Apple (Claude can do)
- [ ] **Friendly error handling** — replace raw error dumps (the 500 blob) with "Something went wrong, try again."
- [ ] **"Nearest covered area" label** — out-of-area users see "Showing Teaneck (nearest area)."
- [ ] **Final QA pass** — click through every screen on device, fix any crashes/rough edges from the tester's feedback.
- [ ] **(Optional) decide any last polish** you want in — say the word.

## 🔴 You must do (accounts / money / can't be automated)
- [ ] **Rotate the 3 exposed secrets** (Gmail app pw, Google client secret, Anthropic key) — before public.
- [ ] **Apple Developer Program** enrollment ($99/yr) — takes ~1 day to approve, so start early.
- [ ] **(Recommended) Domain + Resend + turn Confirm email back ON** — makes accounts feel legit for a public app (optional, but nice before store launch).

## 📱 App Store submission requirements (once features are done)
- [ ] **EAS production build** → App Store Connect (Claude can set up `eas.json`; you run it with your Apple credentials)
- [ ] **App Store Connect record**: name, subtitle, description, keywords, category
- [ ] **Screenshots** for required device sizes (Claude can help generate/frame these)
- [ ] **App Privacy "nutrition labels"** — disclose: email (account), usage analytics
- [ ] **Support URL** + **Privacy Policy URL** (already hosted on GitHub Pages)
- [ ] **Age rating** questionnaire
- [ ] **TestFlight beta** first (recommended) → then submit for review
- [x] Account deletion exists (Apple requires it) ✅
- [x] Email-only sign-in → no "Sign in with Apple" required (only required if Google/3rd-party is ON; it's currently hidden) ✅

## 🔵 Explicitly v2 (NOT in v1 — ship the update later)
- Mainstream supermarkets (ShopRite, Stop & Shop…) — blocked on data + certification
- Headcount meal planner
- Monsey (Evergreen/Wesley), KolSave
- Push notifications, crash reporting

---

**The one thing between you and a real v1:** a proper **build + Apple submission**. The features are done.
