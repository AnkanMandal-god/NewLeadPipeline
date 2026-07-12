import httpx
from loguru import logger
from typing import Any
from config import reload_settings


async def enrich_lead(domain: str) -> dict[str, str | None]:
    """Query Apollo.io to find a decision-maker email for the given domain."""
    logger.info(f"Enricher: looking up contacts for domain '{domain}'")

    # Reload on every call so key changes in the dashboard take effect immediately.
    settings = reload_settings()

    if not settings.APOLLO_API_KEY or settings.APOLLO_API_KEY == "apollo-placeholder":
        logger.warning(f"APOLLO_API_KEY not set — skipping enrichment for '{domain}'.")
        return {"contact_name": None, "contact_email": None}

    target_titles: list[str] = settings.ENRICHER_TARGET_TITLES or ["Owner", "Founder", "CEO", "Director"]

    for title in target_titles:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://api.apollo.io/v1/people/match",
                    json={
                        "api_key": settings.APOLLO_API_KEY,
                        "domain": domain,
                        "title": title,
                        "reveal_personal_emails": False,
                    },
                    headers={"Content-Type": "application/json"},
                )
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()

                person = data.get("person") or {}
                email: str | None = person.get("email")
                email_status: str = person.get("email_status") or "unknown"
                name: str | None = (
                    f"{person.get('first_name', '')} {person.get('last_name', '')}".strip() or None
                )

                # Reject emails Apollo has flagged as undeliverable or unverifiable.
                # "unavailable" / "bounced" / "invalid" are unreliable — skip them.
                # "verified" and "guessed" are accepted; anything unknown is also accepted
                # as a best-effort result.
                bad_statuses = {"unavailable", "bounced", "invalid", "pending_manual_fulfillment"}
                if email and email_status in bad_statuses:
                    logger.warning(
                        f"Enricher: skipping email '{email}' for '{domain}' — "
                        f"Apollo status '{email_status}' is unreliable."
                    )
                    email = None

                if email:
                    logger.info(
                        f"Enricher: found contact '{name}' <{email}> "
                        f"(status={email_status}) at '{domain}'."
                    )
                    return {"contact_name": name, "contact_email": email}

        except httpx.HTTPStatusError as exc:
            logger.warning(
                f"Enricher: Apollo returned {exc.response.status_code} for '{domain}' / '{title}'."
            )
        except Exception:
            logger.exception(f"Enricher: unexpected error for domain '{domain}' / title '{title}'.")

    logger.info(f"Enricher: no contact found for domain '{domain}'.")
    return {"contact_name": None, "contact_email": None}
