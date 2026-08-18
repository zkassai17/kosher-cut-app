// Share a shopping list with family — no backend. We send a plain, readable
// text list (so anyone can just read what to buy) with a compact code appended
// that the app can import back into a real list.

import { BasketItem } from './presets';

export interface SharedList {
  label: string;
  emoji: string;
  items: BasketItem[];
}

const PREFIX = 'kc1:';

// Compact, URL-safe payload (no base64 needed — Hermes lacks btoa).
export function encodeList(l: SharedList): string {
  const payload = { l: l.label, e: l.emoji, i: l.items.map((x) => [x.cat, x.id]) };
  return PREFIX + encodeURIComponent(JSON.stringify(payload));
}

export function decodeList(text: string): SharedList | null {
  const m = text.match(/kc1:([^\s]+)/);
  if (!m) return null;
  try {
    const o = JSON.parse(decodeURIComponent(m[1]));
    if (!o || !Array.isArray(o.i)) return null;
    return {
      label: typeof o.l === 'string' ? o.l : 'Shared list',
      emoji: typeof o.e === 'string' ? o.e : '🛒',
      items: o.i
        .filter((a: unknown) => Array.isArray(a) && a.length === 2)
        .map((a: [string, string]) => ({ cat: a[0], id: a[1] })),
    };
  } catch {
    return null;
  }
}

// Where friends without the app can get it. Swap in the App Store / Play links
// at launch — the invite line drives installs.
export const APP_URL = 'https://zkassai17.github.io/kosher-cut-app/';

// The message that gets shared (iMessage/WhatsApp/email) — a clean, readable
// shopping list anyone can follow, led by which store to go to. When `code` is
// provided (an encodeList payload), friends who already have koshercart can
// import it; everyone else gets a link to get the app.
export function shareText(opts: {
  label: string;
  emoji: string;
  storeLine?: string; // e.g. "Cheapest at Grand & Essex — about $38.75"
  itemLabels: string[];
  code?: string; // encodeList(...) payload, so the app can import the list
}): string {
  const { label, emoji, storeLine, itemLabels, code } = opts;
  const lines = itemLabels.length ? itemLabels.map((n) => `• ${n}`).join('\n') : '(no items yet)';
  const store = storeLine ? `🏪 ${storeLine}\n\n` : '';
  const invite = `\n\n📲 Sent with koshercart — compare kosher grocery prices near you.\nGet the app: ${APP_URL}`;
  const importCode = code ? `\n\n— have koshercart? open it → Import a list → paste this —\n${code}` : '';
  return `${emoji} ${label} — shopping list\n\n${store}${lines}${invite}${importCode}`;
}
