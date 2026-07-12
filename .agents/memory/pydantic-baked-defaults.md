---
name: Pydantic BaseSettings baked defaults
description: Why reload_settings() must pass explicit constructor kwargs instead of relying on field defaults
---

## Rule
`reload_settings()` in `vibe-prospector/config.py` MUST pass all JSON-sourced values explicitly to `Settings(...)` — never call bare `Settings()` after updating module globals.

**Why:** Python evaluates class-body expressions once at definition time. `TRIGGER_SCRAPE: bool = bool(_get(_stages, "trigger_scrape", False))` captures the value of `_stages` when the module is first imported — not when `Settings()` is later instantiated. Updating the `_stages` global and then calling `Settings()` still returns the original baked-in default. This caused the trigger flag to always read as `False` regardless of what was written to `pipeline_settings.json`.

**How to apply:** Any time a new settings field is added that reads from the JSON (scraper, auditor, enricher, pipeline, stages sections), also add it to the explicit kwargs block in `reload_settings()`. API key fields that fall back to env vars are handled at module level and don't need to be in the kwargs block.
