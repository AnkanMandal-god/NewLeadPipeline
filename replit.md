# Vibe Prospector

An asynchronous local prospecting pipeline that scrapes Google Maps leads, audits their websites for conversion weaknesses, and hunts for decision-maker contact emails — all driven by a PostgreSQL database hub.

## Run & Operate

- `Vibe Prospector Pipeline` workflow — runs `python main.py` from `vibe-prospector/`; scrapes/audits/enriches leads on a loop and writes to Postgres
- `artifacts/api-server: API Server` workflow — runs the Express API (`pnpm --filter @workspace/api-server run dev`), reads/writes the same `leads`/`scrape_batches` tables directly with raw SQL
- `artifacts/dashboard: web` workflow — runs the React dashboard (`pnpm --filter @workspace/dashboard run dev`) at `/dashboard/`; talks to the API server
- All three workflows run together under the `Project` run button
- Required env: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (Replit-managed)

## Stack

- Python 3.11 + asyncio + httpx
- PostgreSQL + asyncpg (connection pool)
- pydantic-settings for config
- loguru for structured colorized logging
- OpenAI gpt-4o-mini for homepage critique
- Google PageSpeed Insights API for performance scoring
- Jina Reader (`r.jina.ai`) for homepage markdown extraction
- Apollo.io for contact enrichment
- Apify (Google Places Scraper actor) for Google Maps scraping

## Where things live

**Python pipeline**
- `vibe-prospector/main.py` — pipeline orchestrator loop (the entry point); respects per-stage enable flags
- `vibe-prospector/config.py` — Pydantic Settings; `clear_trigger_scrape()` helper
- `vibe-prospector/database.py` — asyncpg pool + all DB operations; `init_db()` creates tables on startup
- `vibe-prospector/pipeline_settings.json` — runtime config including `stages` enable/disable flags
- `vibe-prospector/modules/scraper.py` — Outscraper ingestion; creates `scrape_batches` row per run
- `vibe-prospector/modules/auditor.py` — PageSpeed + Jina + OpenAI critique
- `vibe-prospector/modules/enricher.py` — Apollo.io contact hunter; reads target titles from settings

**API server** (`artifacts/api-server/`)
- `src/routes/leads.ts` — list/get/patch leads; filters: batch_id, business_category, outreach_status, has_website
- `src/routes/batches.ts` — GET /api/batches, GET /api/batches/:id
- `src/routes/pipeline.ts` — GET /api/pipeline/status; POST enable/disable per stage; POST trigger scrape
- `src/routes/settings.ts` — GET/PATCH /api/settings; deep-merges with defaults

**Dashboard** (`artifacts/dashboard/`)
- `/` — Dashboard home (pipeline overview stats)
- `/pipeline` — Per-stage tabs (Scraper / Auditor / Enricher) with start/stop toggle and settings forms
- `/leads` — Leads database with batch filter, website bucket, business category, outreach mode filters
- `/leads/:id` — Lead detail: all fields editable including outreach mode/status/notes; Save Changes
- `/outreach` — Outreach tracking: leads grouped by contacted / meeting scheduled / meeting concluded
- `/settings` — API key config; Enricher target titles

**Database tables**
- `leads` — core prospect record with 22 columns including outreach fields, speed scores, batch FK
- `scrape_batches` — one row per Outscraper run (query, location, limit, lead_count)

## Pipeline Status Flow

```
10_Raw_Scraped  →  audit  →  20_Audit_Passed  →  enrich  →  30_Ready_for_Outreach
                         ↘  00_Discarded (fast site, score ≥ 60)
                         ↘  99_Manual_Review  (PageSpeed inconclusive / API error)
No-website leads skip straight to 20_Audit_Passed (high intent).
```

## API Keys Required

Set these in Replit Secrets before running with real data:

| Secret | Purpose |
|---|---|
| `OPENAI_API_KEY` | GPT-4o-mini homepage critique |
| `APOLLO_API_KEY` | Contact email enrichment |
| `APIFY_API_TOKEN` | Google Maps scraper (Apify) |
| `PAGESPEED_API_KEY` | (Optional) Higher PageSpeed quota |

Keys can be set either as Replit Secrets (env vars) or via the dashboard's Settings page (writes to `pipeline_settings.json`). An empty string in `pipeline_settings.json` is treated as "not set" so env vars still apply. Without real keys the pipeline runs with mock data and skips API calls gracefully — this is the current state as of setup.

## Architecture decisions

- Hub-and-Spoke pattern: all modules read/write only via `database.py`; status field drives the pipeline stage
- Semaphore (5) on audit concurrency to avoid PageSpeed rate limits
- No-website leads fast-tracked to `20_Audit_Passed` — they're high-intent layout targets
- `passed_audit: None` routes to `99_Manual_Review` (PageSpeed unreachable), not silently discarded
- `.env` placeholders fall back to Replit's PGHOST/PGPORT/etc env vars automatically

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run from inside `vibe-prospector/` directory (`cd vibe-prospector && python main.py`)
- The `.env` file uses literal values — shell `${VAR}` expansion does NOT work in python-dotenv; `config.py` reads Replit Postgres secrets via `os.getenv()` defaults instead
