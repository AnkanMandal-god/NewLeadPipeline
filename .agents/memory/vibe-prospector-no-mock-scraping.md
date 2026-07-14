---
name: Vibe Prospector no mock scraping
description: Scraper module must never fall back to fake/mock leads; user explicitly requires it to refuse to run and log loudly if APIFY_API_TOKEN is missing.
---

The scraper (`vibe-prospector/modules/scraper.py`) previously fell back to a static 30-record mock pool whenever `APIFY_API_TOKEN` was unset. That pool never changed, so every scrape re-sampled the same 30 businesses and the dedup logic (keyed on place_id) treated them all as duplicates after the first run — symptom: "same 30 leads no matter what settings I change."

The mock fallback was removed entirely. Current behavior: if `APIFY_API_TOKEN` is not configured, `fetch_and_parse_maps` logs an ERROR, writes a `step="error"` progress entry, and returns without creating a batch or inserting any leads.

**Why:** the user was explicit — "dont allow mock data and dont allow it to run and notify in logs if key isnt present." This is a stated product requirement, not just a bug fix; do not reintroduce any synthetic/demo data path for this pipeline without asking first.

**How to apply:** if extending the scraper or adding new data sources, preserve the same "hard fail with a clear log + dashboard message" pattern rather than degrading to placeholder/fake data. The same principle likely applies to `OPENAI_API_KEY`/`APOLLO_API_KEY` placeholders used by the auditor/enricher stages — they currently log warnings and skip rather than fabricate data, which is consistent with this preference.
