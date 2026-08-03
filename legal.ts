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
    { p: ['koshercart helps you compare kosher grocery prices at stores near you. We built it to collect as little about you as possible.'] },
    {
      h: 'What we collect',
      p: [
        'Location — if you turn on "Use my location automatically," the app reads your device location to find nearby stores. It is used on your device to pick the closest area and is NOT sent to us or stored on any server.',
        'Your lists, regulars, name, and settings — saved ONLY on your device. We have no accounts and no server that receives this data.',
      ],
    },
    {
      h: 'What we do NOT do',
      p: [
        'We do not require an account or a login.',
        'We do not sell or share your personal information.',
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
      p: ['Your data lives only on your device. Remove all of it any time from Settings → Delete account, or by deleting the app.'],
    },
    { h: 'Children', p: ['The app is not directed to children under 13 and does not knowingly collect information from them.'] },
    { h: 'Contact', p: ['Questions? Email zkassai17@gmail.com.'] },
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
    { h: 'Contact', p: ['Questions? Email zkassai17@gmail.com.'] },
  ],
};
