---
name: Vibe Prospector settings fallback
description: Why vibe-prospector/config.py reads API keys with `dict.get(key) or os.getenv(...)` instead of `dict.get(key, default)`
---

In `vibe-prospector/config.py`, API keys (OPENAI_API_KEY, APOLLO_API_KEY, APIFY_API_TOKEN, PAGESPEED_API_KEY) are loaded from `pipeline_settings.json`'s `api_keys` section first, with an intended fallback to environment variables (e.g. Replit Secrets) when not set in the file.

The file ships with those keys present but set to `""` (empty string) rather than omitted. A plain `dict.get(key, default)` returns `""` whenever the key exists, even if empty — so the env-var fallback path was unreachable as originally written, regardless of what secrets were configured.

**Why:** The JSON file is also written to by the dashboard's Settings page (via the API server), so it always contains all four keys as some string, even when the user hasn't filled them in yet.

**How to apply:** Treat "key present but empty string" as "not set" when reading config that mixes a user-editable JSON file with env-var fallbacks — use `dict.get(key) or os.getenv(key, default)`, not `dict.get(key, default)`. Applies to any similar settings-file + env-var layering pattern in this project.
