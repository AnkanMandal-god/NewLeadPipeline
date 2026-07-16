import os
from datetime import datetime, timezone
from typing import Any

from loguru import logger
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None

DB_NAME = os.getenv("MONGODB_DB", "vibe_prospector")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError(
                "MONGODB_URI must be set. Did you forget to provision a MongoDB Atlas database?"
            )
        _client = AsyncIOMotorClient(uri)
        _db = _client[DB_NAME]
        logger.info("MongoDB client connected.")
    return _db


async def next_id(sequence_name: str) -> int:
    db = await get_db()
    result = await db.counters.find_one_and_update(
        {"_id": sequence_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return result["seq"]


async def init_db() -> None:
    db = await get_db()
    # Dedup guard: unique index on (business_name, phone) mirrors the old
    # Postgres unique index used to skip re-scraping the same business.
    await db.leads.create_index(
        [("business_name", 1), ("phone", 1)], unique=True, name="leads_dedup_idx"
    )
    await db.leads.create_index([("pipeline_status", 1)])
    await db.leads.create_index([("id", 1)], unique=True)
    await db.scrape_batches.create_index([("id", 1)], unique=True)
    await db.pipeline_events.create_index([("id", 1)], unique=True)
    await db.pipeline_events.create_index([("time", -1)])
    await db.pipeline_events.create_index([("read", 1)])
    logger.info("Database initialized — indices ready.")


# ---------------------------------------------------------------------------
# Notification / event log
# ---------------------------------------------------------------------------

_EVENTS_CAP = 500


async def log_event(level: str, source: str, message: str, meta: dict[str, Any] | None = None) -> None:
    """Record an entry in the notification/task log (surfaced by the dashboard's
    notification bell). Best-effort — must never crash the caller.

    level: "info" | "warning" | "error"
    source: "scraper" | "auditor" | "enricher" | "system"
    """
    try:
        db = await get_db()
        event_id = await next_id("pipeline_events")
        await db.pipeline_events.insert_one({
            "id": event_id,
            "time": _now_iso(),
            "level": level,
            "source": source,
            "message": message,
            "meta": meta or {},
            "read": False,
        })
        # Keep the log bounded — drop the oldest entries beyond the cap.
        total = await db.pipeline_events.count_documents({})
        if total > _EVENTS_CAP:
            overflow = total - _EVENTS_CAP
            cursor = db.pipeline_events.find({}, {"id": 1}).sort("id", 1).limit(overflow)
            old_ids = [doc["id"] async for doc in cursor]
            if old_ids:
                await db.pipeline_events.delete_many({"id": {"$in": old_ids}})
    except Exception:
        logger.exception("Failed to record notification event (non-fatal).")


# ---------------------------------------------------------------------------
# Scrape batch helpers
# ---------------------------------------------------------------------------

async def create_scrape_batch(query: str, location: str, limit_count: int) -> int:
    """Insert a new scrape batch row and return its id."""
    db = await get_db()
    batch_id = await next_id("scrape_batches")
    await db.scrape_batches.insert_one({
        "id": batch_id,
        "query": query,
        "location": location,
        "limit_count": limit_count,
        "scraped_at": _now_iso(),
        "lead_count": 0,
    })
    logger.info(f"Scrape batch #{batch_id} created (query='{query}', location='{location}').")
    return batch_id


async def update_batch_lead_count(batch_id: int, count: int) -> None:
    db = await get_db()
    await db.scrape_batches.update_one({"id": batch_id}, {"$set": {"lead_count": count}})


async def get_scrape_batches() -> list[dict[str, Any]]:
    db = await get_db()
    cursor = db.scrape_batches.find({}, {"_id": 0}).sort("scraped_at", -1)
    return [doc async for doc in cursor]


# ---------------------------------------------------------------------------
# Lead CRUD
# ---------------------------------------------------------------------------

async def insert_raw_leads(leads_list: list[dict[str, Any]], batch_id: int | None = None) -> int:
    """Insert scraped leads, skipping any that already exist (same business+phone).
    Returns the count of truly new leads inserted."""
    db = await get_db()
    inserted = 0
    now = _now_iso()
    for lead in leads_list:
        business_name = lead.get("business_name", "")
        phone = lead.get("phone")
        existing = await db.leads.find_one({"business_name": business_name, "phone": phone})
        if existing:
            continue

        lead_id = await next_id("leads")
        doc = {
            "id": lead_id,
            "business_name": business_name,
            "website_url": lead.get("website_url"),
            "has_website": bool(lead.get("website_url")),
            "phone": phone,
            "pipeline_status": lead.get("pipeline_status", "10_Raw_Scraped"),
            "scrape_batch_id": batch_id,
            "place_id": lead.get("place_id"),
            "address": lead.get("address"),
            "business_category": lead.get("business_category"),
            "rating": lead.get("rating"),
            "review_count": lead.get("review_count"),
            "desktop_speed_score": None,
            "mobile_speed_score": None,
            "ai_ux_critique": None,
            "contact_email": None,
            "contact_name": None,
            "outreach_mode": "none",
            "outreach_status": "not_started",
            "outreach_notes": None,
            "notes": None,
            "discard_reason": None,
            "created_at": now,
            "updated_at": now,
        }
        try:
            await db.leads.insert_one(doc)
            inserted += 1
        except Exception as exc:
            logger.warning(f"Could not insert lead '{business_name}': {exc}")

    logger.info(f"Inserted {inserted} new raw leads (duplicates skipped).")
    return inserted


async def get_leads_by_status(status: str) -> list[dict[str, Any]]:
    db = await get_db()
    cursor = db.leads.find({"pipeline_status": status}, {"_id": 0})
    return [doc async for doc in cursor]


async def update_lead_data(lead_id: int, updates: dict[str, Any]) -> None:
    if not updates:
        return
    db = await get_db()
    set_fields = dict(updates)
    set_fields["updated_at"] = _now_iso()
    await db.leads.update_one({"id": lead_id}, {"$set": set_fields})
    logger.debug(f"Lead ID {lead_id} updated: {list(updates.keys())}")


async def count_leads() -> int:
    db = await get_db()
    return await db.leads.count_documents({})


async def close_pool() -> None:
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB client closed.")
