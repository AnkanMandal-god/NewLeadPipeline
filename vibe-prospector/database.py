import asyncpg
from loguru import logger
from typing import Any
from config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            database=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            min_size=2,
            max_size=10,
        )
        logger.info("Database connection pool created.")
    return _pool


async def init_db() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Scrape batches — one row per Maps scrape run
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS scrape_batches (
                id SERIAL PRIMARY KEY,
                query VARCHAR(255) NOT NULL,
                location VARCHAR(255) NOT NULL,
                limit_count INTEGER NOT NULL DEFAULT 20,
                scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
                lead_count INTEGER NOT NULL DEFAULT 0
            );
        """)

        # Core leads table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                business_name VARCHAR(255) NOT NULL,
                website_url TEXT,
                has_website BOOLEAN NOT NULL DEFAULT FALSE,
                phone VARCHAR(50),
                pipeline_status VARCHAR(50) NOT NULL DEFAULT '10_Raw_Scraped',
                scrape_batch_id INTEGER REFERENCES scrape_batches(id),
                place_id VARCHAR(255),
                address TEXT,
                business_category VARCHAR(255),
                rating NUMERIC(3,1),
                review_count INTEGER,
                desktop_speed_score INTEGER,
                mobile_speed_score INTEGER,
                ai_ux_critique TEXT,
                contact_email VARCHAR(255),
                contact_name VARCHAR(255),
                outreach_mode VARCHAR(50) DEFAULT 'none',
                outreach_status VARCHAR(50) NOT NULL DEFAULT 'not_started',
                outreach_notes TEXT,
                notes TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        """)

        # Add columns that may be missing from older installs — do this FIRST
        # before any DML that references these columns.
        migration_cols = [
            ("has_website", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("scrape_batch_id", "INTEGER"),
            ("place_id", "VARCHAR(255)"),
            ("address", "TEXT"),
            ("business_category", "VARCHAR(255)"),
            ("rating", "NUMERIC(3,1)"),
            ("review_count", "INTEGER"),
            ("outreach_mode", "VARCHAR(50) DEFAULT 'none'"),
            ("outreach_status", "VARCHAR(50) NOT NULL DEFAULT 'not_started'"),
            ("outreach_notes", "TEXT"),
            ("notes", "TEXT"),
        ]
        for col, defn in migration_cols:
            try:
                await conn.execute(
                    f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS {col} {defn}"
                )
            except Exception as exc:
                logger.warning(f"Could not add column '{col}': {exc}")

        # Now backfill has_website from website_url
        await conn.execute("""
            UPDATE leads
            SET has_website = (website_url IS NOT NULL AND website_url != '')
            WHERE has_website IS DISTINCT FROM (website_url IS NOT NULL AND website_url != '');
        """)

        # Dedup index — same business name + phone combo is skipped.
        # Remove exact duplicates first to avoid index creation failure.
        await conn.execute("""
            DELETE FROM leads a
            USING leads b
            WHERE a.id > b.id
              AND a.business_name = b.business_name
              AND COALESCE(a.phone, '') = COALESCE(b.phone, '');
        """)
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS leads_dedup_idx
            ON leads (business_name, COALESCE(phone, ''));
        """)

    logger.info("Database initialized — tables and indices ready.")


# ---------------------------------------------------------------------------
# Scrape batch helpers
# ---------------------------------------------------------------------------

async def create_scrape_batch(query: str, location: str, limit_count: int) -> int:
    """Insert a new scrape batch row and return its id."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO scrape_batches (query, location, limit_count) VALUES ($1, $2, $3) RETURNING id",
            query, location, limit_count,
        )
    batch_id = row["id"]
    logger.info(f"Scrape batch #{batch_id} created (query='{query}', location='{location}').")
    return batch_id


async def update_batch_lead_count(batch_id: int, count: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE scrape_batches SET lead_count = $1 WHERE id = $2",
            count, batch_id,
        )


async def get_scrape_batches() -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM scrape_batches ORDER BY scraped_at DESC"
        )
    return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# Lead CRUD
# ---------------------------------------------------------------------------

async def insert_raw_leads(leads_list: list[dict[str, Any]], batch_id: int | None = None) -> int:
    """Insert scraped leads, skipping any that already exist (same business+phone).
    Returns the count of truly new leads inserted."""
    pool = await get_pool()
    inserted = 0
    async with pool.acquire() as conn:
        for lead in leads_list:
            result = await conn.execute(
                """
                INSERT INTO leads (
                    business_name, website_url, has_website, phone, pipeline_status,
                    scrape_batch_id, place_id, address, business_category,
                    rating, review_count
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (business_name, COALESCE(phone, '')) DO NOTHING
                """,
                lead.get("business_name", ""),
                lead.get("website_url"),
                bool(lead.get("website_url")),
                lead.get("phone"),
                lead.get("pipeline_status", "10_Raw_Scraped"),
                batch_id,
                lead.get("place_id"),
                lead.get("address"),
                lead.get("business_category"),
                lead.get("rating"),
                lead.get("review_count"),
            )
            if result == "INSERT 0 1":
                inserted += 1
    logger.info(f"Inserted {inserted} new raw leads (duplicates skipped).")
    return inserted


async def get_leads_by_status(status: str) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM leads WHERE pipeline_status = $1", status
        )
    return [dict(row) for row in rows]


async def update_lead_data(lead_id: int, updates: dict[str, Any]) -> None:
    if not updates:
        return
    pool = await get_pool()
    updates["updated_at"] = "NOW()"

    set_clauses = []
    values: list[Any] = []
    idx = 1
    for key, value in updates.items():
        if value == "NOW()":
            set_clauses.append(f"{key} = NOW()")
        else:
            set_clauses.append(f"{key} = ${idx}")
            values.append(value)
            idx += 1

    query = f"UPDATE leads SET {', '.join(set_clauses)} WHERE id = ${idx}"
    values.append(lead_id)

    async with pool.acquire() as conn:
        await conn.execute(query, *values)
    logger.debug(f"Lead ID {lead_id} updated: {list(updates.keys())}")


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed.")
