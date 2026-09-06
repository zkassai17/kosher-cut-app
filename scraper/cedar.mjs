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

// "SALES EFFECTIVE: AUGUST 23-28, 2026" -> "Aug 23–28" (no API key needed).
// Robust to ALL-CAPS months and to the day-range dash being dropped by the PDF
// text extractor (it often comes through as "2328").
function effectiveDate(text) {
  // Strip control chars (the PDF sticks \\x0b/\\x0e between "EFFECTIVE" and the
  // date) and collapse whitespace so the patterns below match reliably.
  const t = (text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ");
  const mon = (s) => s[0].toUpperCase() + s.slice(1, 3).toLowerCase();
  // Cross-month range: "August 30 - September 4" -> "Aug 30 – Sep 4".
  let m = t.match(/EFFECTIVE\W*([A-Za-z]{3,})\.?\s+(\d{1,2})\s*[-–—]\s*([A-Za-z]{3,})\.?\s+(\d{1,2})/i);
  if (m) return `${mon(m[1])} ${m[2]} – ${mon(m[3])} ${m[4]}`;
  // Same month with a dash: "September 6-11", "August 23-28" (1- or 2-digit days).
  m = t.match(/EFFECTIVE\W*([A-Za-z]{3,})\.?\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})/i);
  if (m) return `${mon(m[1])} ${m[2]}–${m[3]}`;
  // Same month, dash dropped by the extractor: "AUGUST 2328" -> two 2-digit days.
  m = t.match(/EFFECTIVE\W*([A-Za-z]{3,})\.?\s+(\d{2})(\d{2})\b/i);
  if (m) return `${mon(m[1])} ${m[2]}–${m[3]}`;
  return "";
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

async function fetchPdf(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`pdf ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pdfText(buf) {
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js'); // lazy so a missing dep can't crash the scraper
  return (await pdf(buf)).text || '';
}

// Extract the sale deals straight from the PDF's TEXT COORDINATES — align each
// item with the price sitting in its column. Deterministic, needs no API key,
// so it can run unattended. Only the clean grid sections (meat/poultry/beef/
// fish/dairy/grocery) are read; sushi/deli/prepared columns interleave and are
// skipped. Returns [{ name, price }] with price as a display string.
async function highlightsFromLayout(buf) {
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
  const SIZEWORD = /^(oz|lb|lbs|ct|pack|pk|g|gr|gram|grams|kg|ml|l|qt|ea|each|family|super|value|only|assorted|excluding|large|small|medium|pc|count|reduced|fat|of)$/i;
  const SAFE = /meat|poultry|beef|chicken|fish|dairy|grocery|produce|frozen|provision/i;
  const BAD = /sushi|deli|appetizing|prepared|takeout|take out|catering|salad bar|hot bar/i;
  const out = [];
  await pdf(buf, {
    pagerender: async (page) => {
      const tc = await page.getTextContent({ disableCombineTextItems: false });
      const items = tc.items
        .map((i) => ({ s: (i.str || '').replace(/\s+/g, ' ').trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }))
        .filter((i) => i.s);
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      let cur = null;
      for (const it of items) {
        if (!cur || Math.abs(it.y - cur.y) > 5) rows.push((cur = { y: it.y, cells: [] }));
        cur.cells.push(it);
      }
      const rowSection = [];
      let sec = '';
      for (let i = 0; i < rows.length; i++) {
        const txt = rows[i].cells.map((c) => c.s).join(' ');
        if (/department|section|by the case/i.test(txt) || /^(sushi|dairy|frozen|grocery|household|produce|fish|appetizing|bakery|meat|poultry)$/i.test(txt.trim())) sec = txt;
        rowSection[i] = sec;
      }
      for (let r = 0; r < rows.length; r++) {
        const section = rowSection[r] || '';
        if (BAD.test(section) || (section && !SAFE.test(section))) continue;
        const row = rows[r];
        const dollars = row.cells.filter((c) => c.s === '$' || /^\$\d/.test(c.s));
        if (dollars.length < 2) continue;
        const centsRow = rows[r - 1];
        if (!centsRow) continue;
        for (const d of dollars) {
          const X = d.x;
          let dollarInt = null;
          const inline = d.s.match(/^\$(\d+)/);
          if (inline) dollarInt = inline[1];
          else {
            const near = row.cells.filter((c) => c.x >= X && c.x <= X + 40 && /^\d+$/.test(c.s)).sort((a, b) => a.x - b.x)[0];
            if (near) dollarInt = near.s;
          }
          if (dollarInt == null) continue;
          const unit = row.cells.find((c) => c.x >= X && c.x <= X + 90 && /^(EA|LB)$/i.test(c.s));
          const cents = centsRow.cells
            .filter((c) => Math.abs(c.x - X) <= 60 && /^\d{2}$/.test(c.s))
            .sort((a, b) => Math.abs(a.x - X) - Math.abs(b.x - X))[0];
          const price = parseFloat(`${dollarInt}.${cents ? cents.s : '00'}`);
          if (!(price > 0.1 && price < 200)) continue;
          const band = [X - 12, X + 120];
          const nameWords = [];
          for (let rr = r - 2; rr >= 0 && rr >= r - 10; rr--) {
            const cells = rows[rr].cells.filter((c) => c.x >= band[0] && c.x <= band[1]);
            if (!cells.length) continue;
            const text = cells.map((c) => c.s).join(' ').trim();
            if (/\$|\bEA\b|\bLB\b|^\d/.test(text)) break;
            if (/department|section|sales effective|unless otherwise|by the case|^sushi|^grocery|^dairy|^frozen|^fish|^produce|^appetizing|^bakery|omelette/i.test(text)) break;
            nameWords.unshift(text);
          }
          let name = nameWords.join(' ').replace(/\s+/g, ' ').trim();
          name = name.split(' ').filter((w) => !/^\d+(\.\d+)?$/.test(w) && !SIZEWORD.test(w)).join(' ');
          const words = name.split(' ').filter(Boolean);
          if (name.length < 4 || words.length < 2 || words.length > 7) continue;
          if (/department|section|effective|omelette|unless/i.test(name)) continue;
          if (words.some((w, i) => i > 0 && w.toLowerCase() === words[i - 1].toLowerCase())) continue;
          const lb = !!(unit && /lb/i.test(unit.s));
          out.push({ name, price: `$${price.toFixed(2)}${lb ? '/lb' : ''}` });
        }
      }
      return '';
    },
  });
  // dedupe by name, keep first, cap at 10
  const seen = new Set();
  return out.filter((d) => (seen.has(d.name.toLowerCase()) ? false : (seen.add(d.name.toLowerCase()), true))).slice(0, 10);
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
    const buf = await fetchPdf(pdfUrl);
    const text = await pdfText(buf);
    // Prefer the freshly-parsed date; if extraction drops it but the circular is
    // unchanged, keep the cached date; then the caller's fallback.
    let effective = effectiveDate(text);
    if (!effective && cache.pdfUrl === pdfUrl && cache.effective) effective = cache.effective;
    effective = effective || (fallback && fallback.effective) || '';

    // Highlights: reuse cache when the circular is unchanged; else read them
    // straight from the PDF layout — deterministic, no API key. The LLM is only a
    // last resort if the layout parse comes up empty (and a key is configured).
    let highlights = cache.pdfUrl === pdfUrl && Array.isArray(cache.highlights) && cache.highlights.length ? cache.highlights : null;
    if (highlights == null) {
      try {
        highlights = await highlightsFromLayout(buf);
      } catch (e) {
        console.error('  cedar layout parse failed:', String(e).slice(0, 120));
        highlights = [];
      }
      if (!highlights.length) {
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
