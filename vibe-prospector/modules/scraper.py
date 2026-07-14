import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from loguru import logger

from config import reload_settings
from database import insert_raw_leads, create_scrape_batch, update_batch_lead_count

# Apify Google Places Scraper actor
_APIFY_ACTOR_ID = "compass~crawler-google-places"
_APIFY_BASE = "https://api.apify.com/v2"
_RUN_TIMEOUT_S = 300   # max seconds to wait for the actor run
_POLL_INTERVAL_S = 5   # how often to check run status

_SETTINGS_FILE = Path(__file__).parent.parent / "pipeline_settings.json"


# ── Progress tracking ─────────────────────────────────────────────────────────

def _write_progress(
    step: str,
    message: str,
    current: int = 0,
    total: int = 0,
    new_leads: int | None = None,
    duplicates_skipped: int | None = None,
    started_at: str | None = None,
    finished_at: str | None = None,
    log_entry: str | None = None,
    query: str | None = None,
    location: str | None = None,
) -> None:
    """Update scrape_progress section in pipeline_settings.json (best-effort)."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        if _SETTINGS_FILE.exists():
            with open(_SETTINGS_FILE) as f:
                data = json.load(f)
        else:
            data = {}

        prog = data.setdefault("scrape_progress", {
            "step": "idle", "message": "", "current": 0, "total": 0,
            "new_leads": 0, "duplicates_skipped": 0, "log": [],
            "started_at": None, "finished_at": None,
            "query": None, "location": None,
        })

        if started_at is not None:
            # Reset log on new run
            prog["log"] = []
            prog["new_leads"] = 0
            prog["duplicates_skipped"] = 0
            prog["finished_at"] = None
            prog["started_at"] = started_at

        if query is not None:
            prog["query"] = query
        if location is not None:
            prog["location"] = location

        prog["step"] = step
        prog["message"] = message
        prog["current"] = current
        prog["total"] = total

        if new_leads is not None:
            prog["new_leads"] = new_leads
        if duplicates_skipped is not None:
            prog["duplicates_skipped"] = duplicates_skipped
        if finished_at is not None:
            prog["finished_at"] = finished_at

        if log_entry is not None:
            log: list = prog.get("log", [])
            log.append({"time": now, "msg": log_entry})
            prog["log"] = log[-100:]  # keep last 100 entries

        with open(_SETTINGS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass  # progress tracking is best-effort; never crash the pipeline


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean_url(url: str) -> str:
    url = url.strip()
    if url and not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def _clean_address(raw: str) -> str:
    """
    Trim a verbose Google Maps address down to a readable street + city.

    Google Maps addresses look like:
      "Shop No.207 2nd Floor, THE G... Mall, near xyz, Sector 4, New Delhi, India"
    We want:
      "Shop No.207 2nd Floor, Sector 4, New Delhi, India"

    Strategy:
    - Split on comma, drop fragments that look like landmark hints
      (contain "near", "behind", "beside", "next to", "opposite of", "inside").
    - Keep the first fragment (unit/street), then skip pure-landmark fragments,
      then rejoin the remainder (city, state, country).
    - Cap at 80 chars for UI display.
    """
    if not raw:
        return raw

    _LANDMARK_KEYWORDS = (
        " near ", " behind ", " beside ", " next to ", " opposite ", " inside ",
        "landmark", "nearest landmark", "adjacent", "in front of",
    )

    parts = [p.strip() for p in raw.split(",") if p.strip()]
    cleaned: list[str] = []
    for part in parts:
        lower = part.lower()
        if any(kw in lower for kw in _LANDMARK_KEYWORDS):
            continue
        cleaned.append(part)

    result = ", ".join(cleaned) if cleaned else raw
    # Hard cap so it never wraps in the table
    if len(result) > 80:
        result = result[:77] + "…"
    return result


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Apify API calls ───────────────────────────────────────────────────────────

async def _start_apify_run(client: httpx.AsyncClient, query: str, location: str, limit: int, token: str) -> str:
    """Start an Apify actor run and return the runId."""
    resp = await client.post(
        f"{_APIFY_BASE}/acts/{_APIFY_ACTOR_ID}/runs",
        params={"token": token},
        json={
            "searchStringsArray": [query],
            "locationQuery": location,
            "maxCrawledPlacesPerSearch": limit,
            "maxCrawledPlaces": limit,
            "language": "en",
            "maxImages": 0,
            "exportPlaceUrls": False,
            "includeHistogram": False,
            "includeOpeningHours": False,
            "includePeopleAlsoSearch": False,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    run_id: str = data["data"]["id"]
    logger.info(f"Apify run started — runId={run_id}")
    return run_id


async def _wait_for_run(client: httpx.AsyncClient, run_id: str, token: str) -> str:
    """Poll until the run finishes; return the defaultDatasetId."""
    deadline = asyncio.get_event_loop().time() + _RUN_TIMEOUT_S
    elapsed = 0
    while asyncio.get_event_loop().time() < deadline:
        resp = await client.get(
            f"{_APIFY_BASE}/actor-runs/{run_id}",
            params={"token": token},
            timeout=15,
        )
        resp.raise_for_status()
        run = resp.json()["data"]
        status: str = run["status"]
        if status == "SUCCEEDED":
            dataset_id: str = run["defaultDatasetId"]
            logger.info(f"Apify run {run_id} succeeded — datasetId={dataset_id}")
            return dataset_id
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise RuntimeError(f"Apify run {run_id} ended with status '{status}'")
        elapsed += _POLL_INTERVAL_S
        _write_progress(
            step="fetching",
            message=f"Apify scraper running… ({elapsed}s elapsed)",
            log_entry=f"Apify status={status} — waiting…",
        )
        logger.debug(f"Apify run {run_id} status={status} — waiting {_POLL_INTERVAL_S}s…")
        await asyncio.sleep(_POLL_INTERVAL_S)
    raise TimeoutError(f"Apify run {run_id} did not finish within {_RUN_TIMEOUT_S}s")


async def _fetch_dataset(client: httpx.AsyncClient, dataset_id: str, token: str) -> list[dict[str, Any]]:
    """Retrieve items from the finished dataset."""
    resp = await client.get(
        f"{_APIFY_BASE}/datasets/{dataset_id}/items",
        params={"token": token, "clean": "true", "format": "json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# ── Main entry point ──────────────────────────────────────────────────────────

async def fetch_and_parse_maps(query: str, location: str, limit: int | None = None) -> list[dict[str, Any]]:
    """Fetch leads from Apify Google Maps Scraper and ingest into the DB.

    Creates a scrape_batch record, stores leads with batch_id, has_website,
    business_category, address, rating, review_count, and place_id.

    Requires APIFY_API_TOKEN to be configured — there is no mock/test fallback.
    If the token is missing, the scrape is refused and a clear error is logged
    and surfaced to the dashboard instead of silently returning fake leads.
    """
    # Reload settings fresh on every call so runtime key changes (dashboard saves,
    # env var updates) are picked up without restarting the pipeline.
    settings = reload_settings()
    limit = limit or settings.SCRAPER_LIMIT
    started = _now_iso()

    if not settings.APIFY_API_TOKEN:
        logger.error(
            "Scrape aborted — APIFY_API_TOKEN is not set. Add it in Settings or as a "
            "Replit secret; no mock/test data will be generated."
        )
        _write_progress(
            step="error",
            message="Scrape aborted — no Apify API token configured. Add one in Settings.",
            started_at=started,
            finished_at=_now_iso(),
            query=query,
            location=location,
            log_entry="APIFY_API_TOKEN not set — refusing to scrape (no mock fallback).",
        )
        return []

    logger.info(f"Scraper: fetching '{query}' in '{location}' (limit={limit})")

    _write_progress(
        step="starting",
        message=f"Starting scrape: \"{query}\" in {location}",
        total=limit,
        started_at=started,
        log_entry=f"Scrape triggered — query=\"{query}\" location=\"{location}\" limit={limit}",
    )

    batch_id = await create_scrape_batch(query, location, limit)
    _write_progress(
        step="starting",
        message="Batch record created — fetching results…",
        log_entry=f"Batch #{batch_id} created in database",
    )

    raw_results: list[dict[str, Any]] = []

    _write_progress(
        step="fetching",
        message="Launching Apify Google Maps Scraper…",
        log_entry="Apify token found — starting actor run",
    )
    try:
        async with httpx.AsyncClient() as client:
            run_id = await _start_apify_run(client, query, location, limit, settings.APIFY_API_TOKEN)
            _write_progress(
                step="fetching",
                message=f"Apify actor running (runId={run_id[:8]}…)",
                log_entry=f"Apify run started — runId={run_id}",
            )
            dataset_id = await _wait_for_run(client, run_id, settings.APIFY_API_TOKEN)
            _write_progress(
                step="fetching",
                message="Downloading results from Apify dataset…",
                log_entry=f"Apify run succeeded — downloading dataset {dataset_id}",
            )
            raw_results = await _fetch_dataset(client, dataset_id, settings.APIFY_API_TOKEN)
        logger.info(f"Apify returned {len(raw_results)} raw records.")
        _write_progress(
            step="parsing",
            message=f"Apify returned {len(raw_results)} raw records — parsing…",
            total=len(raw_results),
            log_entry=f"Downloaded {len(raw_results)} raw records from Apify",
        )
    except Exception as exc:
        logger.exception("Apify scrape failed.")
        _write_progress(
            step="error",
            message=f"Apify scrape failed: {exc}",
            finished_at=_now_iso(),
            log_entry=f"Apify error: {exc} — scrape aborted, no leads inserted.",
        )
        await update_batch_lead_count(batch_id, 0)
        return []

    # ── Normalise Apify/mock schema → internal schema ─────────────────────────
    # Apify Google Maps Scraper uses:
    #   title, website, phone, placeId, address, categoryName, totalScore, reviewsCount
    leads: list[dict[str, Any]] = []
    for item in raw_results:
        business_name: str = (item.get("title") or item.get("name") or "").strip()
        website_raw: str = item.get("website") or item.get("site") or ""
        phone: str = item.get("phone") or ""

        if not business_name:
            continue

        if website_raw.strip():
            website_url = _clean_url(website_raw.strip())
            status = "10_Raw_Scraped"
        else:
            website_url = None
            if phone.strip():
                status = "30_Ready_for_Outreach"
                logger.info(f"Lead '{business_name}' has no website but has a phone — ready for outreach.")
            else:
                status = "20_Audit_Passed"
                logger.info(f"Lead '{business_name}' has no website and no contact — queued for enrichment.")

        raw_rating = item.get("totalScore") or item.get("rating")
        try:
            rating = float(raw_rating) if raw_rating is not None else None
        except (TypeError, ValueError):
            rating = None

        raw_reviews = item.get("reviewsCount") or item.get("reviews") or item.get("reviews_count")
        try:
            review_count = int(raw_reviews) if raw_reviews is not None else None
        except (TypeError, ValueError):
            review_count = None

        raw_address = item.get("address") or item.get("full_address") or ""
        address = _clean_address(raw_address)

        leads.append({
            "business_name": business_name,
            "website_url": website_url,
            "phone": phone or None,
            "pipeline_status": status,
            "place_id": item.get("placeId") or item.get("place_id") or None,
            "address": address or None,
            "business_category": item.get("categoryName") or item.get("type") or None,
            "rating": rating,
            "review_count": review_count,
        })

    _write_progress(
        step="inserting",
        message=f"Inserting {len(leads)} leads into database…",
        current=0,
        total=len(leads),
        log_entry=f"Parsed {len(leads)} valid leads — inserting (deduplicating)…",
    )

    inserted = await insert_raw_leads(leads, batch_id=batch_id)
    duplicates = len(leads) - inserted
    await update_batch_lead_count(batch_id, inserted)

    summary = f"{len(leads)} processed → {inserted} new, {duplicates} duplicates skipped"
    logger.info(f"Scraper complete: {summary} in batch #{batch_id}.")

    _write_progress(
        step="done",
        message=f"Done — {inserted} new leads added ({duplicates} duplicates skipped)",
        current=len(leads),
        total=len(leads),
        new_leads=inserted,
        duplicates_skipped=duplicates,
        finished_at=_now_iso(),
        log_entry=f"Batch #{batch_id} complete — {summary}",
    )

    return leads
