// Cedar Market weekly-circular reader.
//
// Cedar (Teaneck, Cedar Lane) has NO online store — it only publishes a weekly
// SALE circular as a PDF. This reads that circular each run so the app's
// "This week's ad" never goes stale:
//   • effective date + PDF link: extracted with NO API key (fetch page + regex the
//     PDF text). This is what auto-updates the badge weekly.
//   • highlights (a few sample deals): parsed by an LLM (needs a key) because the
//     flyer layout is jumbled and a wrong price is worse than none. Without a key
//     highlights are just empty and the app shows a "see the full ad" link.
//   • CACHED by circular URL → the LLM runs only when a NEW flyer is posted (~1×/wk).
//   • NON-FATAL: any failure returns `fallback` so the app keeps the last-good ad.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, 'cedar-cache.json');
const WEEKLY_ADS = 'https://thecedarmarket.com/weekly-ads/';
const PROVIDER = process.env.LLM_PROVIDER || 'anthropic';

const HL_SYSTEM = `You are given the raw text of a kosher supermarket's weekly sale circular (layout is jumbled — a price may appear just before or after the item it belongs to). Pick 8-10 of the most recognizable/appealing deals and return ONLY a JSON array:
[{"name":"Empire Chicken Nuggets","price":"$7.99"}, ...]

RULES
- name: brand + product, readable; drop "Assorted" and pack sizes.
- price: a DISPLAY string as a shopper reads it. The flyer prints cents small so the decimal is missing in the text: "$749"→"$7.49", "$289"→"$2.89", "$99"→"$0.99" (last two digits are cents). Keep multi-buys as printed: "2/$6", "3/$5". Add "/lb" when the item is priced per pound (an "LB" marker near it).
- Only include an item if you are confident which price is its price. If unsure, skip it. Never guess.
- Skip store hours, headings, dates, phone/'address.
Output ONLY the JSON array.`;

async function callLLM(userText) {
  if (PROVIDER === 'mock') return '[]';
  if (PROVIDER === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'system', content: HL_SYSTEM }, { role: 'user', content: userText }],
      }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}`);
    return (await r.json()).choices?.[0]?.message?.content || '';
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: HL_SYSTEM,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  return (await r.json()).content?.[0]?.text || '';
}

// "August 2-7, 2026" -> "Aug 2–7" (no API key needed).
function effectiveDate(text) {
  const m = text.match(/EFFECTIVE\S*\s+([A-Z][a-z]+)\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  return m ? `${m[1].slice(0, 3)} ${m[2]}–${m[3]}` : '';
}

async function findCircularUrl() {
  const r = await fetch(WEEKLY_ADS, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`weekly-ads page ${r.status}`);
  const html = await r.text();
  // The circular is embedded via a pdf-viewer plugin (viewer.html?file=<PDF>), not
  // a plain <a href> — so match the uploads PDF wherever it appears in the HTML.
  const m = html.match(/https?:\/\/[^"'\s]*\/wp-content\/uploads\/[^"'\s]*\.pdf/i);
  if (!m) throw new Error('no circular PDF link found');
  return decodeURIComponent(m[0]);
}

async function pdfText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`pdf ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js'); // lazy so a missing dep can't crash the scraper
  return (await pdf(buf)).text || '';
}

// Returns the current { effective, url, pdfUrl, highlights } for Cedar, or
// `fallback` on any failure. `url` is the always-current weekly-ads page.
export async function cedarWeeklyAd(fallback = null) {
  let cache = {};
  if (existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    } catch {}
  }
  try {
    const pdfUrl = await findCircularUrl();
    const text = await pdfText(pdfUrl);
    const effective = effectiveDate(text) || (fallback && fallback.effective) || '';

    // Highlights: reuse cache unless the circular changed; skip cleanly with no key.
    let highlights = cache.pdfUrl === pdfUrl && Array.isArray(cache.highlights) ? cache.highlights : null;
    if (highlights == null) {
      try {
        const raw = await callLLM(text.slice(0, 9000));
        const a = raw.indexOf('[');
        const b = raw.lastIndexOf(']');
        const parsed = a >= 0 && b >= 0 ? JSON.parse(raw.slice(a, b + 1)) : [];
        highlights = parsed
          .filter((x) => x && x.name && x.price)
          .slice(0, 10)
          .map((x) => ({ name: String(x.name).trim(), price: String(x.price).trim() }));
      } catch (e) {
        console.error('  cedar highlights skipped:', String(e).slice(0, 120));
        highlights = [];
      }
    }

    const ad = { effective, url: WEEKLY_ADS, pdfUrl, highlights };
    writeFileSync(CACHE_PATH, JSON.stringify(ad));
    console.log(`  cedar ad: ${effective || '(no date)'} · ${highlights.length} highlights`);
    return ad;
  } catch (e) {
    console.error('  cedar ad skipped:', String(e).slice(0, 160));
    // Keep last-good: prefer the on-disk cache, then the caller's fallback.
    if (cache && cache.effective) return cache;
    return fallback;
  }
}
