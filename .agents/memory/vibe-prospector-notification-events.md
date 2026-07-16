---
name: Vibe Prospector notification/event log
description: How the unified task/error log and notification bell are wired, for future changes to scraper/auditor/enricher error surfacing.
---

Vibe Prospector has one unified Mongo collection `pipeline_events` (capped at 500 docs, trimmed oldest-first) serving both the "auditor/task error log" and the dashboard notification bell — there is no separate system for each.

- Python side: `database.log_event(level, source, message, meta=None)` in `vibe-prospector/database.py` is the only write path; it's best-effort (swallows its own errors) so a logging failure never crashes the pipeline. Call sites: `scraper.py` (scrape aborted/failed/done), `main.py` (audit batch summaries, enrichment per-lead errors, stale-progress reconciliation, startup missing-API-key warnings).
- Node side: `artifacts/api-server/src/routes/notifications.ts` reads/writes the same collection directly via `getCollection` (bypasses `pipeline_settings.json`, unlike `pipeline.ts`). Admin-only, like settings/batches/pipeline.
- `fetch_and_parse_maps` in `scraper.py` wraps its entire body (including `create_scrape_batch`) in one try/except so every abort path — not just the two that existed before — writes a reasoned `scrape_progress` error and a `pipeline_events` entry instead of crashing the pipeline loop silently.

**Why:** the auditor/task-log ask and the notification-bell ask overlapped almost completely; building two systems would have meant instrumenting the same call sites twice.

**How to apply:** when adding a new failure/success path anywhere in the pipeline (scraper/auditor/enricher), add a `log_event(...)` call there rather than inventing a new log surface — the dashboard bell picks it up automatically via `useGetNotifications` (15s poll).
