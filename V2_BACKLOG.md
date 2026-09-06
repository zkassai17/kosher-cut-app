# 🛒 koshercart — v2 Backlog

Ordered roughly easiest/cheapest → biggest lift. Check items off as you go.

---

## 🟢 Quick & cheap (do first)

- [ ] **Rotate the 3 exposed secrets** — free, ~15 min. Do before ANY public launch.
  - [ ] Gmail app password (`koshercartapp@gmail.com`) → regenerate at myaccount.google.com/apppasswords
  - [ ] Google OAuth client secret → regenerate in Google Cloud Console
  - [ ] Anthropic API key → rotate in the Anthropic console (update GitHub Secret)
- [ ] **"Nearest covered area" label** — free, small code change. Show "Showing Teaneck (nearest covered area)" so out-of-area users (e.g. Monsey) aren't confused.
- [ ] **Meal-planner demand test** — free, small. Add a "Feeding a crowd? (coming soon)" tap-to-vote wired to existing analytics, to measure want before building.

## 🟡 Medium effort (needs a purchase or setup)

- [ ] **Reliable confirmation email** — ~$12/yr + ~45 min setup. Template is already built.
  - [ ] Buy a domain (koshercart.com / .app) — Cloudflare / Namecheap / Porkbun
  - [ ] Create free Resend (or Postmark) account
  - [ ] Verify domain DNS (SPF / DKIM / DMARC)
  - [ ] Swap Supabase SMTP → `smtp.resend.com` + API key
  - [ ] Turn **Confirm email** back ON
- [ ] **Headcount meal planner** ⭐ — the differentiator. "Feeding how many?" → suggested list with scaled quantities (per-lb vs per-each) → cheapest-store total. Build only after core gets real feedback. Frame as an editable estimate, not gospel.

## 🟠 Bigger lifts

- [ ] **Native build → App Store**
  - [ ] EAS build
  - [ ] Native Google + Apple sign-in (flip `GOOGLE_SIGNIN_ENABLED` on after rotating the secret)
  - [ ] App Store Connect listing
- [ ] **Push notifications**
- [ ] **Crash reporting**

## 🔵 Coverage — needs partnerships/data (not just code)

- [ ] **Mainstream supermarkets for PACKAGED goods** ⭐ — add **ShopRite**, **Stop & Shop** (NJ), **Key Foods**, **Fairway** & similar. Sealed hechsher-certified items (Chobani, Philadelphia…) are the same product there and often cheaper.
  - [ ] **Packaged only — NEVER meat/chicken/deli/bakery/prepared** (those need the store's own kosher supervision; the "kosher" filter is per-PRODUCT, not per-store).
  - [ ] **Blocker = certification data:** know *reliably* which products are certified — match against **OU / OK / Star-K** product DBs or UPC. Never guess kosher status.
  - [ ] Reuse the existing cross-store product matching (`scraper/canonicalize.mjs` + `c` key).
  - [ ] Per-chain catalog integration (site / Instacart, ToS-sensitive) — one chain at a time.
  - [ ] UI toggle: "Include regular supermarkets (packaged kosher items only)."
- [ ] **Monsey** — Evergreen + Wesley Kosher. Pursue a **SelfPoint data-feed partnership** (self-point.com), or ask stores directly (Evergreen 845-352-4400, Wesley 845-364-7217). Do NOT scrape (Cloudflare-blocked, ToS). Adding the area is trivial once real price data exists.
- [ ] **KolSave** — needs a data feed (Instacart/UberEats only today).
- [ ] **Hechsher / kosher-cert data** — only with a 100%-accurate source. Never guess. (Also unlocks the supermarket item above.)

---

*Accuracy is core: never fake a price or a hechsher — wrong is worse than none.*
