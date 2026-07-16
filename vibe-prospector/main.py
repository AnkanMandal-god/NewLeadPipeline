import asyncio
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from loguru import logger

from config import settings, reload_settings, clear_trigger_scrape, clear_trigger_audit, write_runtime
from database import close_pool, count_leads, get_leads_by_status, init_db, update_lead_data, log_event
from modules.auditor import audit_website
from modules.enricher import enrich_lead
from modules.scraper import fetch_and_parse_maps

_SETTINGS_FILE = Path(__file__).parent / "pipeline_settings.json"
_ACTIVE_SCRAPE_STEPS = {"starting", "fetching", "parsing", "inserting"}
_ACTIVE_AUDIT_STEPS = {"auditing"}


async def _reconcile_stale_progress() -> None:
    """Clear progress state left mid-run by a process that died without finishing
    (e.g. the workflow was killed/restarted). Without this, the dashboard reads
    scrape_progress/audit_progress.step as still "active" forever, since that
    flag is only cleared by the run that set it — which never got to finish."""
    try:
        if not _SETTINGS_FILE.exists():
            return
        with open(_SETTINGS_FILE) as f:
            data = json.load(f)

        runtime = data.get("runtime", {})
        changed = False
        now = _now_iso()

        scrape_prog = data.get("scrape_progress")
        if (
            scrape_prog
            and scrape_prog.get("step") in _ACTIVE_SCRAPE_STEPS
            and not runtime.get("scraper_running")
        ):
            scrape_prog["step"] = "error"
            scrape_prog["message"] = "Scrape was interrupted (pipeline restarted mid-run) — retry from Pipeline tab."
            scrape_prog["finished_at"] = now
            scrape_prog.setdefault("log", []).append({
                "time": now,
                "msg": "Pipeline restarted while this scrape was in progress — marking as interrupted.",
            })
            changed = True
            logger.warning("Reconciled a stale in-progress scrape_progress left by a previous run.")
            await log_event(
                "warning", "scraper",
                "Scrape was interrupted by a pipeline restart mid-run and marked as failed — retry from the Pipeline tab.",
            )

        audit_prog = data.get("audit_progress")
        if (
            audit_prog
            and audit_prog.get("step") in _ACTIVE_AUDIT_STEPS
            and not runtime.get("auditor_running")
        ):
            audit_prog["step"] = "error"
            audit_prog["message"] = "Audit run was interrupted (pipeline restarted mid-run) — it will retry automatically."
            audit_prog["finished_at"] = now
            audit_prog.setdefault("log", []).append({
                "time": now,
                "msg": "Pipeline restarted while this audit run was in progress — marking as interrupted.",
            })
            changed = True
            logger.warning("Reconciled a stale in-progress audit_progress left by a previous run.")
            await log_event(
                "warning", "auditor",
                "Audit run was interrupted by a pipeline restart mid-run — it will retry automatically on the next cycle.",
            )

        if changed:
            with open(_SETTINGS_FILE, "w") as f:
                json.dump(data, f, indent=2)
    except Exception:
        logger.exception("Failed to reconcile stale progress state (non-fatal).")

logger.remove()
logger.add(
    sys.stdout,
    colorize=True,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
    level="DEBUG",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_domain(url: str) -> str:
    try:
        parsed = urlparse(url)
        return parsed.netloc or url
    except Exception:
        return url


def _is_india_lead(lead: dict) -> bool:
    """Detect India leads by address or phone prefix."""
    address: str = (lead.get("address") or "").lower()
    phone: str = (lead.get("phone") or "")
    return "india" in address or phone.startswith("+91")


async def _route_enriched(lead_id: int, name: str, lead: dict, result: dict) -> None:
    """
    Shared post-enrichment routing used by both the no-website and has-website paths.

    Rules:
      - India lead with a known phone number  → 30_Ready_for_Outreach (no email needed)
      - International lead with email found   → 30_Ready_for_Outreach
      - International lead with no email      → 00_Discarded
    """
    if _is_india_lead(lead) and lead.get("phone"):
        await update_lead_data(lead_id, {
            "pipeline_status": "30_Ready_for_Outreach",
            "contact_name": result.get("contact_name"),
            "contact_email": result.get("contact_email"),
        })
        logger.info(f"Lead '{name}' → 30_Ready_for_Outreach (India lead, phone on file)")
    elif result.get("contact_email"):
        await update_lead_data(lead_id, {
            "pipeline_status": "30_Ready_for_Outreach",
            "contact_name": result["contact_name"],
            "contact_email": result["contact_email"],
        })
        logger.info(f"Lead '{name}' → 30_Ready_for_Outreach ({result['contact_email']})")
    else:
        await update_lead_data(lead_id, {
            "pipeline_status": "00_Discarded",
            "discard_reason": "No contact email found during enrichment (international lead, no phone-only route available).",
        })
        logger.info(f"Lead '{name}' → 00_Discarded (international, no email found)")


async def process_audits(semaphore: asyncio.Semaphore) -> None:
    from modules.auditor import _write_audit_progress

    leads = await get_leads_by_status("10_Raw_Scraped")
    if not leads:
        logger.info("Auditor: no leads pending audit.")
        return

    total = len(leads)
    logger.info(f"Auditor: processing {total} leads.")

    started_at = _now_iso()
    await _write_audit_progress(
        "auditing", f"Starting — {total} leads queued",
        current=0, total=total,
        passed=0, failed=0, inconclusive=0,
        started_at=started_at,
        log_entry=f"Audit batch started — {total} leads pending",
    )

    completed = 0
    n_passed = 0
    n_failed = 0
    n_inconclusive = 0

    async def audit_one(lead: dict) -> None:
        nonlocal completed, n_passed, n_failed, n_inconclusive
        lead_id: int = lead["id"]
        name: str = lead["business_name"]
        url: str = lead["website_url"]

        async with semaphore:
            await _write_audit_progress(
                "auditing", f"Auditing {name}…",
                current=completed, total=total,
                log_entry=f"→ {name}  {url}",
            )
            try:
                result = await audit_website(url)

                outcome = (
                    "passed" if result["passed_audit"] is True
                    else "inconclusive" if result["passed_audit"] is None
                    else "failed"
                )
                if outcome == "passed":
                    n_passed += 1
                    new_status = "20_Audit_Passed"   # → enrichment queue
                elif outcome == "inconclusive":
                    n_inconclusive += 1
                    new_status = "99_Manual_Review"
                else:
                    n_failed += 1
                    new_status = "99_Manual_Review"
                completed += 1

                score_str = (
                    f"mobile {result['mobile_score']}"
                    if result["mobile_score"] is not None
                    else "no score"
                )
                icon = "✓" if outcome == "passed" else "?" if outcome == "inconclusive" else "✗"
                log_msg = f"{icon} {name} — {score_str} ({outcome})"

                await update_lead_data(lead_id, {
                    "pipeline_status": new_status,
                    "mobile_speed_score": result["mobile_score"],
                    "desktop_speed_score": result["desktop_score"],
                    "ai_ux_critique": result.get("critique"),
                })
                logger.info(f"Lead '{name}' → {new_status} ({outcome}, {score_str})")

            except Exception:
                n_failed += 1
                completed += 1
                logger.exception(f"Audit failed for '{name}' (ID {lead_id}) — marking 99_Manual_Review.")
                await update_lead_data(lead_id, {"pipeline_status": "99_Manual_Review"})
                log_msg = f"✗ {name} — error during audit"

            await _write_audit_progress(
                "auditing", f"Audited {completed}/{total}",
                current=completed, total=total,
                passed=n_passed, failed=n_failed, inconclusive=n_inconclusive,
                log_entry=log_msg,
            )

    await asyncio.gather(*[audit_one(lead) for lead in leads])

    await _write_audit_progress(
        "done",
        f"Complete — {n_passed} passed, {n_failed} failed, {n_inconclusive} inconclusive",
        current=total, total=total,
        passed=n_passed, failed=n_failed, inconclusive=n_inconclusive,
        finished_at=_now_iso(),
        log_entry=f"Batch done — {n_passed} passed · {n_failed} failed · {n_inconclusive} inconclusive",
    )

    summary_meta = {"total": total, "passed": n_passed, "failed": n_failed, "inconclusive": n_inconclusive}
    if n_failed > 0:
        await log_event(
            "warning", "auditor",
            f"Audit batch finished with {n_failed} error(s) out of {total} — {n_passed} passed, {n_inconclusive} inconclusive. Failed leads were marked for manual review.",
            meta=summary_meta,
        )
    else:
        await log_event(
            "info", "auditor",
            f"Audit batch complete — {total} audited, {n_passed} passed, {n_inconclusive} inconclusive.",
            meta=summary_meta,
        )


async def process_enrichments() -> None:
    leads = await get_leads_by_status("20_Audit_Passed")
    if not leads:
        logger.info("Enricher: no leads pending enrichment.")
        return

    logger.info(f"Enricher: processing {len(leads)} leads.")

    for lead in leads:
        lead_id: int = lead["id"]
        name: str = lead["business_name"]
        url: str | None = lead.get("website_url")

        try:
            # India leads with a phone number skip Apollo entirely
            if _is_india_lead(lead) and lead.get("phone"):
                logger.info(f"Lead '{name}' is an India lead with phone — skipping Apollo lookup.")
                await _route_enriched(lead_id, name, lead, {"contact_name": None, "contact_email": None})
                continue

            domain = _extract_domain(url) if url else name
            result = await enrich_lead(domain)
            await _route_enriched(lead_id, name, lead, result)

        except Exception as exc:
            logger.exception(f"Enrichment failed for lead '{name}' (ID {lead_id}) — marking 99_Manual_Review.")
            await update_lead_data(lead_id, {"pipeline_status": "99_Manual_Review"})
            await log_event(
                "error", "enricher",
                f"Enrichment failed for '{name}': {exc}",
                meta={"lead_id": lead_id},
            )


async def run_initial_scrape() -> None:
    """Run a seed scrape on startup if no leads exist yet."""
    fresh = reload_settings()
    count = await count_leads()

    if count == 0:
        logger.info("No leads found — running initial seed scrape...")
        write_runtime(scraper_running=True, last_scrape_at=_now_iso())
        try:
            await fetch_and_parse_maps(
                query=fresh.SCRAPER_QUERY,
                location=fresh.SCRAPER_LOCATION,
                limit=fresh.SCRAPER_LIMIT,
            )
        finally:
            write_runtime(scraper_running=False)
    else:
        logger.info(f"Found {count} existing leads — skipping seed scrape.")


async def main() -> None:
    logger.info("=== Vibe Prospector Pipeline Starting ===")
    logger.info(
        f"Config: DB=MongoDB({settings.MONGODB_DB}) | "
        f"OpenAI={'set' if settings.OPENAI_API_KEY != 'sk-placeholder' else 'PLACEHOLDER'} | "
        f"Apollo={'set' if settings.APOLLO_API_KEY != 'apollo-placeholder' else 'PLACEHOLDER'} | "
        f"Apify={'set' if settings.APIFY_API_TOKEN else 'NOT SET — scraping disabled, no mock fallback'}"
    )
    if not settings.APIFY_API_TOKEN:
        logger.error(
            "APIFY_API_TOKEN is not configured. The scraper will refuse to run until it is "
            "set (Settings page or Replit secret) — no mock/test data will be generated."
        )

    await init_db()
    if not settings.APIFY_API_TOKEN:
        await log_event("warning", "system", "APIFY_API_TOKEN is not set — the scraper will refuse to run until it is configured.")
    if settings.OPENAI_API_KEY == "sk-placeholder":
        await log_event("warning", "system", "OPENAI_API_KEY is not set — audits will skip AI critiques (inconclusive/manual review instead).")
    if settings.APOLLO_API_KEY == "apollo-placeholder":
        await log_event("warning", "system", "APOLLO_API_KEY is not set — enrichment will not find contact emails.")
    await _reconcile_stale_progress()
    await run_initial_scrape()

    # Per-stage timers — scraper is manual-only; auditor/enricher run on interval
    last_audit_t = 0.0
    last_enrich_t = 0.0

    try:
        while True:
            fresh = reload_settings()
            semaphore = asyncio.Semaphore(fresh.MAX_AUDIT_CONCURRENCY)
            now = time.monotonic()

            triggered = fresh.TRIGGER_SCRAPE
            audit_triggered = fresh.TRIGGER_AUDIT
            auditor_due = (now - last_audit_t) >= fresh.AUDITOR_INTERVAL_SECONDS
            enricher_due = (now - last_enrich_t) >= fresh.ENRICHER_INTERVAL_SECONDS

            logger.debug(
                f"Tick | scraper={'TRIGGER' if triggered else 'manual-only'} "
                f"| auditor={'TRIGGER' if audit_triggered else 'DUE' if auditor_due else 'wait'} "
                f"| enricher={'DUE' if enricher_due else 'wait'}"
            )

            # ── Scraper — manual trigger only ────────────────────────────
            if triggered:
                logger.info("Trigger flag detected — running scrape now.")
                clear_trigger_scrape()
                write_runtime(scraper_running=True, last_scrape_at=_now_iso())
                try:
                    await fetch_and_parse_maps(
                        query=fresh.SCRAPER_QUERY,
                        location=fresh.SCRAPER_LOCATION,
                        limit=fresh.SCRAPER_LIMIT,
                    )
                finally:
                    write_runtime(scraper_running=False)

            # ── Auditor ──────────────────────────────────────────────────
            if fresh.AUDITOR_ENABLED and (auditor_due or audit_triggered):
                if audit_triggered:
                    logger.info("Audit trigger detected — running audit now.")
                    clear_trigger_audit()
                last_audit_t = now
                write_runtime(auditor_running=True, last_audit_at=_now_iso())
                try:
                    await process_audits(semaphore)
                finally:
                    write_runtime(auditor_running=False)
            elif not fresh.AUDITOR_ENABLED:
                logger.debug("Auditor: inactive — skipping.")

            # ── Enricher ─────────────────────────────────────────────────
            if fresh.ENRICHER_ENABLED and enricher_due:
                last_enrich_t = now
                write_runtime(last_enrich_at=_now_iso())
                await process_enrichments()
            elif not fresh.ENRICHER_ENABLED:
                logger.debug("Enricher: inactive — skipping.")

            await asyncio.sleep(fresh.POLL_INTERVAL_SECONDS)

    except asyncio.CancelledError:
        logger.info("Pipeline loop cancelled.")
    except KeyboardInterrupt:
        logger.info("Interrupted by user.")
    finally:
        write_runtime(scraper_running=False)
        await close_pool()
        logger.info("=== Vibe Prospector Pipeline Stopped ===")


if __name__ == "__main__":
    asyncio.run(main())
