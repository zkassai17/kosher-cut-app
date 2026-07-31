# Canonical product matching (LLM)

The daily scraper tags every product with a canonical identity key `c` so the app
can match the **same product across stores** even when each store names it
differently ("Salad Mate Saladmate Dressing Caesar" == "Saladmate Caesar Dressing,
12 Oz"). The app groups by `c`; if a product has no `c` yet, it falls back to the
built-in regex matcher, so **nothing breaks if this is off.**

## How it works

`canonicalize.mjs` sends each *new* product name to an LLM once and caches the
result in `canon-cache.json`. After the first fill, only brand-new names cost
anything — daily runs are effectively free because the catalog barely changes.

The LLM returns `{brand, product}`; two products with the same brand+product are
the same item. Distinguishing qualities (lite/light, whole/skim, flavor, organic,
pack count) are kept so different products never wrongly merge; sizes are dropped.

## Setup (one time)

1. Get an API key:
   - **Anthropic** (default): https://console.anthropic.com/ → API Keys
   - or **OpenAI**: https://platform.openai.com/api-keys
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`)
   - Value: your key
   - For OpenAI, also add a **Variable** `LLM_PROVIDER` = `openai`.
3. Run it: **Actions → Daily price refresh → Run workflow** (or wait for the daily run).

The first run canonicalizes the whole catalog (~a few dollars, ~10 min); it commits
`canon-cache.json` so every run after is pennies.

## Cost controls

- `CANON_MAX_NEW` (env) caps new names per run (default 60000 — the whole catalog).
  Lower it (e.g. 8000) to spread the first fill across several days.
- Model: `LLM_MODEL` env (defaults: `claude-haiku-4-5-20251001` / `gpt-4o-mini`).

## Local test without a key

```bash
cd scraper && LLM_PROVIDER=mock node catalog.mjs   # uses a dummy heuristic, no API
```
