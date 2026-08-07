// Privacy Policy + Terms shown IN-APP (a reliable, offline copy so the links never
// 404). The hosted HTML in /docs is the same content for the App Store Connect URL.

export interface LegalSection {
  h?: string;
  p: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  sections: LegalSection[];
}

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: 'August 2026',
  sections: [
    { p: ['koshercart helps you compare kosher grocery prices at stores near you. We collect as little as possible — only what we need to run and improve the app.'] },
    {
      h: 'What we collect',
      p: [
        'Account — if you sign up, we store your email address and a securely-hashed password (handled by our sign-in provider, Supabase) so you can log in and sync.',
        'Your lists, regulars, name, and settings — saved on your device, and when you are signed in, synced to your account so you can use them on another device.',
        'Location — if you turn on "Use my location automatically," the app reads your device location on-device to pick the closest area. We store the AREA you use (e.g. "Teaneck"), not your precise coordinates.',
        'Usage — basic in-app events such as app opens, the area you use, and what you search for. We use this to fix bugs, improve the app, and decide which stores and areas to add next.',
        'Email updates — only if you opt in, we use your email to send occasional product updates and deals. Unsubscribe any time in Settings or from any email.',
      ],
    },
    {
      h: 'What we do NOT do',
      p: [
        'We do not sell or rent your personal information.',
        'We do not track you across other apps or websites.',
        'We do not run third-party advertising SDKs that profile you.',
      ],
    },
    {
      h: 'Store prices',
      p: ['Prices come from participating stores’ public websites and are provided for convenience. They may be out of date or contain errors — always confirm with the store.'],
    },
    {
      h: 'Deleting your data',
      p: ['Use Settings → Delete account to permanently remove your account, your synced lists and regulars, and everything stored on this device. Deleting the app removes the on-device copy.'],
    },
    { h: 'Children', p: ['The app is not directed to children under 13 and does not knowingly collect information from them.'] },
    { h: 'Contact', p: ['Questions? Email koshercutapp@gmail.com.'] },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  updated: 'August 2026',
  sections: [
    { p: ['By using koshercart you agree to these terms.'] },
    {
      h: 'What the app is',
      p: ['koshercart shows kosher grocery prices gathered from participating stores’ public websites so you can compare them. It is an informational tool. We are not affiliated with the stores listed.'],
    },
    {
      h: 'Prices are not guaranteed',
      p: ['Prices, availability, and product details may be out of date, incomplete, or wrong. Always confirm the current price with the store before purchasing. We are not responsible for any difference between the price shown and the price you are charged.'],
    },
    { h: 'Your responsibilities', p: ['Use the app for personal, lawful purposes. Don’t attempt to disrupt, scrape, or misuse the service.'] },
    {
      h: 'No warranty',
      p: ['The app is provided "as is," without warranties of any kind. To the fullest extent permitted by law, we are not liable for any damages arising from your use of the app.'],
    },
    { h: 'Contact', p: ['Questions? Email koshercutapp@gmail.com.'] },
  ],
};
