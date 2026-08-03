# Building & submitting koshercart (iOS)

This is an Expo app, so builds run in the cloud via **EAS Build** — you don't need Xcode
to produce the build (you do need a paid **Apple Developer account**, $99/yr, to submit).

## One-time setup

```bash
cd ~/kosher-cut-app
npm install -g eas-cli
eas login                 # sign in with your Expo account (free — create at expo.dev)
eas build:configure       # links this project to EAS, writes extra.eas.projectId into app.json
```

## Build a test version for YOUR phone (no App Store needed)

Good for trying the real installed app before submitting.

```bash
eas build --platform ios --profile preview
```

EAS will ask to log in to your Apple account and set up signing — say yes and follow the
prompts. When it finishes it gives a link/QR to install on a device registered to your
Apple Developer account.

## Build the App Store version

```bash
eas build --platform ios --profile production
```

## Submit to the App Store

```bash
eas submit --platform ios --profile production
```

You'll be prompted for your Apple ID, App Store Connect app, and team — EAS uploads the
build to App Store Connect, where you finish the listing (screenshots, description, privacy).

## Before you submit — checklist

- [ ] GitHub Pages ON so the legal links resolve (repo → Settings → Pages → main `/docs`)
- [ ] Privacy Policy URL pasted into App Store Connect → App Information
- [ ] App Privacy: **Location → App Functionality, not linked to identity, not tracking**
- [ ] Support URL set (can reuse the privacy page)
- [ ] Screenshots: 6.7" and 6.5" iPhone
- [ ] Category: Shopping (or Food & Drink), age rating filled
- [ ] Bump `expo.version` / build number for each new submission

## Notes

- `bundleIdentifier` is `com.zkassai.koshercart` (in app.json) — must match the app you
  create in App Store Connect.
- Export compliance is pre-answered (`usesNonExemptEncryption: false`).
- The daily price feed keeps working after install — the app fetches `data.json` from
  GitHub at launch, so prices update without shipping a new build.
