# Vibe Prospector

An asynchronous local prospecting pipeline that scrapes Google Maps leads, audits their websites for conversion weaknesses, and hunts for decision-maker contact emails — all driven by a MongoDB database hub.

## Run & Operate

- `Vibe Prospector Pipeline` workflow — runs `python main.py` from `vibe-prospector/`; scrapes/audits/enriches leads on a loop and writes to MongoDB
- `artifacts/api-server: API Server` workflow — runs the Express API (`pnpm --filter @workspace/api-server run dev`), reads/writes the same `leads`/`scrape_batches` collections directly via the Mongo driver
- `artifacts/dashboard: web` workflow — runs the React dashboard (`pnpm --filter @workspace/dashboard run dev`) at `/dashboard/`; talks to the API server
- All three workflows run together under the `Project` run button
- Required secrets (add via Replit Secrets): `MONGODB_URI` (MongoDB Atlas connection string), `SESSION_SECRET` (signs the login session cookie), `OPENAI_API_KEY`, `APIFY_API_TOKEN`, `APOLLO_API_KEY`, `PAGESPEED_API_KEY`
- The API server starts in a "not_configured" mode when `MONGODB_URI` is absent — the dashboard shows a setup message with the list of missing secrets and becomes fully functional once they are provided
- `.gitignore` protects `.env`, `.env.*`, and `pipeline_settings.json` so secrets entered via the dashboard Settings page are never committed to git

## Login

The dashboard and API require a logged-in session (added during setup — the imported code had no login page even though the API enforced auth on every route). An initial admin account (`admin`) was seeded directly into MongoDB with a generated password; the password was shared with the user in chat, not stored in this repo. Change it (or add more accounts) via `POST /api/auth/users`, admin-only, once a dashboard "manage users" page exists.

## Stack

- Python 3.11 + asyncio + httpx
- MongoDB + motor (Python) / mongodb driver (Node) — `MONGODB_URI` secret
- pydantic-settings for config
- loguru for structured colorized logging
- OpenAI gpt-4o-mini for homepage critique
- Google PageSpeed Insights API for performance scoring
- Jina Reader (`r.jina.ai`) for homepage markdown extraction
- Apollo.io for contact enrichment
- Apify (Google Places Scraper actor) for Google Maps scraping
- Express session auth (bcrypt password hashes, Mongo-backed session store) gating every `/api` route except `/api/auth/login` and `/api/health`

## Where things live

**Python pipeline**
- `vibe-prospector/main.py` — pipeline orchestrator loop (the entry point); respects per-stage enable flags
- `vibe-prospector/config.py` — Pydantic Settings; `clear_trigger_scrape()` helper
- `vibe-prospector/database.py` — motor (async MongoDB) client + all DB operations; `init_db()` creates indexes on startup
- `vibe-prospector/pipeline_settings.json` — runtime config including `stages` enable/disable flags
- `vibe-prospector/modules/scraper.py` — Outscraper ingestion; creates `scrape_batches` doc per run
- `vibe-prospector/modules/auditor.py` — PageSpeed + Jina + OpenAI critique
- `vibe-prospector/modules/enricher.py` — Apollo.io contact hunter; reads target titles from settings

**API server** (`artifacts/api-server/`)
- `src/app.ts` — Express app, session middleware (Mongo-backed store), mounts routes
- `src/routes/auth.ts` — login/logout/me, admin user management
- `src/routes/leads.ts` — list/get/patch leads; filters: batch_id, business_category, outreach_status, has_website
- `src/routes/batches.ts` — GET /api/batches, GET /api/batches/:id
- `src/routes/pipeline.ts` — GET /api/pipeline/status; POST enable/disable per stage; POST trigger scrape
- `src/routes/settings.ts` — GET/PATCH /api/settings; deep-merges with defaults
- `lib/db` (`@workspace/db`) — shared MongoDB client/collection helpers used by the API server

**Dashboard** (`artifacts/dashboard/`)
- `/login` (rendered via `AuthGate` in `App.tsx`, not a routed path) — sign-in form; shown whenever `GET /api/auth/me` is unauthenticated
- `/` — Dashboard home (pipeline overview stats)
- `/pipeline` — Per-stage tabs (Scraper / Auditor / Enricher) with start/stop toggle and settings forms
- `/leads` — Leads database with batch filter, website bucket, business category, outreach mode filters
- `/leads/:id` — Lead detail: all fields editable including outreach mode/status/notes; Save Changes
- `/outreach` — Outreach tracking: leads grouped by contacted / meeting scheduled / meeting concluded
- `/settings` — API key config; Enricher target titles
- Sidebar footer shows the logged-in username and a logout button

**Database collections**
- `leads` — core prospect record with 22 fields including outreach fields, speed scores, batch reference
- `scrape_batches` — one doc per Outscraper run (query, location, limit, lead_count)
- `users` — dashboard/API accounts (bcrypt password hash, role: admin | sales_caller)
- `sessions` — Express session store (managed by connect-mongo)
- `counters` — atomic auto-increment counters (mirrors old Postgres SERIAL ids)

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
| `MONGODB_URI` | MongoDB Atlas (or other) connection string — required to start the pipeline or API server |
| `SESSION_SECRET` | Signs the dashboard/API login session cookie |
| `OPENAI_API_KEY` | GPT-4o-mini homepage critique |
| `APOLLO_API_KEY` | Contact email enrichment |
| `APIFY_API_TOKEN` | Google Maps scraper (Apify) |
| `PAGESPEED_API_KEY` | (Optional) Higher PageSpeed quota |

Keys can be set either as Replit Secrets (env vars) or via the dashboard's Settings page (writes to `pipeline_settings.json`). An empty string in `pipeline_settings.json` is treated as "not set" so env vars still apply. Without real keys the pipeline runs with mock data and skips API calls gracefully — this is the current state as of setup.

## Architecture decisions

- Hub-and-Spoke pattern: all modules read/write only via `database.py` (Python) or `@workspace/db` (Node); `pipeline_status` field drives the pipeline stage
- Semaphore (5) on audit concurrency to avoid PageSpeed rate limits
- No-website leads fast-tracked to `20_Audit_Passed` — they're high-intent layout targets
- `passed_audit: None` routes to `99_Manual_Review` (PageSpeed unreachable), not silently discarded
- MongoDB was chosen over the auto-provisioned Replit Postgres database in the original import; `DATABASE_URL`/`PGHOST`/etc are unused by this app despite being available in the environment

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run from inside `vibe-prospector/` directory (`cd vibe-prospector && python main.py`)
- Every `/api` route except `/api/auth/*` and `/api/health` requires a logged-in session — log in via the dashboard's sign-in form (or `POST /api/auth/login`) first
- `MONGODB_URI` is a user-supplied secret (MongoDB Atlas or similar) — Replit does not auto-provision MongoDB
