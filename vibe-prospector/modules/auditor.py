import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
from openai import AsyncOpenAI
from loguru import logger
from typing import Any
from config import settings

# ── Audit progress writer ──────────────────────────────────────────────────────

_SETTINGS_FILE = Path(__file__).parent.parent / "pipeline_settings.json"
_audit_lock = asyncio.Lock()


async def _write_audit_progress(
    step: str,
    message: str,
    current: int = 0,
    total: int = 0,
    passed: int | None = None,
    failed: int | None = None,
    inconclusive: int | None = None,
    started_at: str | None = None,
    finished_at: str | None = None,
    log_entry: str | None = None,
) -> None:
    """Update audit_progress section in pipeline_settings.json (best-effort, serialised via lock)."""
    try:
        async with _audit_lock:
            now = datetime.now(timezone.utc).isoformat()
            data: dict = {}
            if _SETTINGS_FILE.exists():
                with open(_SETTINGS_FILE) as f:
                    data = json.load(f)

            prog = data.setdefault("audit_progress", {
                "step": "idle", "message": "", "current": 0, "total": 0,
                "passed": 0, "failed": 0, "inconclusive": 0,
                "log": [], "started_at": None, "finished_at": None,
            })

            if started_at is not None:
                prog["log"] = []
                prog["passed"] = 0
                prog["failed"] = 0
                prog["inconclusive"] = 0
                prog["finished_at"] = None
                prog["started_at"] = started_at

            prog["step"] = step
            prog["message"] = message
            prog["current"] = current
            prog["total"] = total

            if passed is not None:
                prog["passed"] = passed
            if failed is not None:
                prog["failed"] = failed
            if inconclusive is not None:
                prog["inconclusive"] = inconclusive
            if finished_at is not None:
                prog["finished_at"] = finished_at
            if log_entry is not None:
                prog.setdefault("log", []).append({"time": now, "msg": log_entry})

            with open(_SETTINGS_FILE, "w") as f:
                json.dump(data, f, indent=2)
    except Exception:
        pass

def _get_openai() -> AsyncOpenAI:
    """Always create a fresh client so API key changes (dashboard saves) take effect immediately."""
    from config import reload_settings
    fresh = reload_settings()
    return AsyncOpenAI(api_key=fresh.OPENAI_API_KEY)


async def _fetch_pagespeed(website_url: str) -> dict[str, int | None]:
    scores: dict[str, int | None] = {"mobile": None, "desktop": None}
    for strategy in ("mobile", "desktop"):
        try:
            params: dict[str, str] = {
                "url": website_url,
                "category": "performance",
                "strategy": strategy,
            }
            if settings.PAGESPEED_API_KEY:
                params["key"] = settings.PAGESPEED_API_KEY

            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(
                    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()
                score_raw = (
                    data.get("lighthouseResult", {})
                    .get("categories", {})
                    .get("performance", {})
                    .get("score")
                )
                if score_raw is not None:
                    scores[strategy] = int(score_raw * 100)
        except Exception:
            logger.exception(f"PageSpeed API failed for {website_url} ({strategy})")
    return scores


async def _fetch_jina_markdown(website_url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"https://r.jina.ai/{website_url}")
            resp.raise_for_status()
            return resp.text[:8000]
    except Exception:
        logger.exception(f"Jina Reader failed for {website_url}")
        return ""


async def _generate_critique(markdown: str, website_url: str) -> str:
    try:
        from config import reload_settings
        fresh = reload_settings()
        client = _get_openai()
        if markdown:
            user_content = f"Website: {website_url}\n\n---\n\n{markdown}"
        else:
            # Jina couldn't fetch page content — analyse based on URL/domain alone
            logger.warning(f"No page content for {website_url} — critiquing from URL only.")
            user_content = (
                f"Website: {website_url}\n\n"
                "Note: Page content could not be fetched. "
                "Provide 2 critique points based on what you can infer from the URL/domain name and typical patterns for this type of local business website."
            )
        response = await client.chat.completions.create(
            model=fresh.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a direct, elite B2B conversion optimization expert. "
                        "Analyze this homepage copy/structure. Provide exactly 2 bullet points "
                        "highlighting critical conversion rate or layout flaws. Keep it punchy, "
                        "specific, and clear of marketing fluff."
                    ),
                },
                {"role": "user", "content": user_content},
            ],
            max_tokens=fresh.OPENAI_MAX_TOKENS,
        )
        return response.choices[0].message.content or ""
    except Exception:
        logger.exception(f"OpenAI critique failed for {website_url}")
        return "AI critique unavailable."


async def audit_website(website_url: str) -> dict[str, Any]:
    logger.info(f"Auditor: starting audit for {website_url}")

    # Reload thresholds fresh each call (picks up dashboard changes on next cycle)
    from config import reload_settings
    fresh = reload_settings()
    pass_threshold = fresh.AUDIT_MOBILE_PASS_THRESHOLD
    discard_threshold = fresh.AUDIT_MOBILE_DISCARD_THRESHOLD

    scores = await _fetch_pagespeed(website_url)
    mobile_score: int | None = scores["mobile"]
    desktop_score: int | None = scores["desktop"]

    if mobile_score is None:
        logger.warning(f"Audit INCONCLUSIVE for {website_url} — PageSpeed returned no score.")
        return {
            "passed_audit": None,
            "mobile_score": None,
            "desktop_score": desktop_score,
            "critique": None,
        }

    if mobile_score >= discard_threshold:
        logger.info(f"Audit FAILED for {website_url} — mobile score {mobile_score} >= {discard_threshold} (site is fast).")
        return {
            "passed_audit": False,
            "mobile_score": mobile_score,
            "desktop_score": desktop_score,
            "critique": None,
        }

    if mobile_score >= pass_threshold:
        logger.info(f"Audit BORDERLINE for {website_url} — mobile score {mobile_score} ({pass_threshold}-{discard_threshold - 1}). Discarding.")
        return {
            "passed_audit": False,
            "mobile_score": mobile_score,
            "desktop_score": desktop_score,
            "critique": None,
        }

    markdown = await _fetch_jina_markdown(website_url)
    critique = await _generate_critique(markdown, website_url)

    logger.info(f"Audit PASSED for {website_url} — mobile score {mobile_score}.")
    return {
        "passed_audit": True,
        "mobile_score": mobile_score,
        "desktop_score": desktop_score,
        "critique": critique,
    }
