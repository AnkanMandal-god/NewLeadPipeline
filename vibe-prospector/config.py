import json
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

SETTINGS_FILE = Path(__file__).parent / "pipeline_settings.json"


def _load_json() -> dict:
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _get(section: dict, key: str, default):
    return section.get(key, default)


_j = _load_json()
_keys = _j.get("api_keys", {})
_scraper = _j.get("scraper", {})
_auditor = _j.get("auditor", {})
_enricher = _j.get("enricher", {})
_pipeline = _j.get("pipeline", {})
_stages = _j.get("stages", {})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database — MongoDB Atlas connection string (Replit secret)
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DB: str = os.getenv("MONGODB_DB", "vibe_prospector")

    # API Keys — loaded from pipeline_settings.json, fall back to env/placeholder.
    # Note: an empty string in the JSON file is treated as "not set" so env vars
    # (e.g. Replit Secrets) can still provide the value.
    OPENAI_API_KEY: str = _keys.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY", "sk-placeholder")
    APOLLO_API_KEY: str = _keys.get("APOLLO_API_KEY") or os.getenv("APOLLO_API_KEY", "apollo-placeholder")
    APIFY_API_TOKEN: str = _keys.get("APIFY_API_TOKEN") or os.getenv("APIFY_API_TOKEN", "")
    PAGESPEED_API_KEY: str = _keys.get("PAGESPEED_API_KEY") or os.getenv("PAGESPEED_API_KEY", "")

    # Scraper settings
    SCRAPER_QUERY: str = _get(_scraper, "query", "gym")
    SCRAPER_LOCATION: str = _get(_scraper, "location", "New York, NY")
    SCRAPER_LIMIT: int = int(_get(_scraper, "limit", 20))

    # Auditor thresholds
    AUDIT_MOBILE_PASS_THRESHOLD: int = int(_get(_auditor, "mobile_pass_threshold", 50))
    AUDIT_MOBILE_DISCARD_THRESHOLD: int = int(_get(_auditor, "mobile_discard_threshold", 60))
    OPENAI_MODEL: str = _get(_auditor, "openai_model", "gpt-4o-mini")
    OPENAI_MAX_TOKENS: int = int(_get(_auditor, "openai_max_tokens", 300))

    # Enricher settings
    ENRICHER_TARGET_TITLES: list[str] = _get(_enricher, "target_titles", ["Owner", "Founder", "CEO", "Director"])

    # Pipeline loop settings
    POLL_INTERVAL_SECONDS: int = int(_get(_pipeline, "poll_interval_seconds", 10))
    MAX_AUDIT_CONCURRENCY: int = int(_get(_pipeline, "max_audit_concurrency", 5))

    # Per-stage run intervals
    SCRAPER_INTERVAL_SECONDS: int = int(_get(_pipeline, "scraper_interval_seconds", 3600))
    AUDITOR_INTERVAL_SECONDS: int = int(_get(_pipeline, "auditor_interval_seconds", 120))
    ENRICHER_INTERVAL_SECONDS: int = int(_get(_pipeline, "enricher_interval_seconds", 120))

    # Per-stage enable flags (read on every tick via reload_settings)
    SCRAPER_ENABLED: bool = bool(_get(_stages, "scraper_enabled", True))
    AUDITOR_ENABLED: bool = bool(_get(_stages, "auditor_enabled", True))
    ENRICHER_ENABLED: bool = bool(_get(_stages, "enricher_enabled", True))
    TRIGGER_SCRAPE: bool = bool(_get(_stages, "trigger_scrape", False))
    TRIGGER_AUDIT: bool = bool(_get(_stages, "trigger_audit", False))


def reload_settings() -> "Settings":
    """Re-read pipeline_settings.json and return a fresh Settings instance.

    Pydantic bakes field defaults in at *class definition* time, so updating
    the module-level globals and calling Settings() would still return the
    original startup values.  We pass the fresh values explicitly so the
    returned instance always reflects the current JSON.
    """
    global _j, _keys, _scraper, _auditor, _enricher, _pipeline, _stages
    _j = _load_json()
    _keys = _j.get("api_keys", {})
    _scraper = _j.get("scraper", {})
    _auditor = _j.get("auditor", {})
    _enricher = _j.get("enricher", {})
    _pipeline = _j.get("pipeline", {})
    _stages = _j.get("stages", {})

    return Settings(
        # API Keys — re-read from fresh JSON on every reload so dashboard saves
        # take effect immediately.  An empty string in JSON means "defer to env var"
        # so Replit Secrets always win when the JSON field is blank.
        OPENAI_API_KEY=_keys.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY", "sk-placeholder"),
        APOLLO_API_KEY=_keys.get("APOLLO_API_KEY") or os.getenv("APOLLO_API_KEY", "apollo-placeholder"),
        APIFY_API_TOKEN=_keys.get("APIFY_API_TOKEN") or os.getenv("APIFY_API_TOKEN", ""),
        PAGESPEED_API_KEY=_keys.get("PAGESPEED_API_KEY") or os.getenv("PAGESPEED_API_KEY", ""),
        # Stages — these MUST come from the live JSON; baked defaults never update
        SCRAPER_ENABLED=bool(_get(_stages, "scraper_enabled", True)),
        AUDITOR_ENABLED=bool(_get(_stages, "auditor_enabled", True)),
        ENRICHER_ENABLED=bool(_get(_stages, "enricher_enabled", True)),
        TRIGGER_SCRAPE=bool(_get(_stages, "trigger_scrape", False)),
        TRIGGER_AUDIT=bool(_get(_stages, "trigger_audit", False)),
        # Scraper
        SCRAPER_QUERY=_get(_scraper, "query", "gym"),
        SCRAPER_LOCATION=_get(_scraper, "location", "New York, NY"),
        SCRAPER_LIMIT=int(_get(_scraper, "limit", 20)),
        # Auditor
        AUDIT_MOBILE_PASS_THRESHOLD=int(_get(_auditor, "mobile_pass_threshold", 50)),
        AUDIT_MOBILE_DISCARD_THRESHOLD=int(_get(_auditor, "mobile_discard_threshold", 60)),
        OPENAI_MODEL=_get(_auditor, "openai_model", "gpt-4o-mini"),
        OPENAI_MAX_TOKENS=int(_get(_auditor, "openai_max_tokens", 300)),
        # Enricher
        ENRICHER_TARGET_TITLES=_get(_enricher, "target_titles", ["Owner", "Founder", "CEO", "Director"]),
        # Pipeline loop
        POLL_INTERVAL_SECONDS=int(_get(_pipeline, "poll_interval_seconds", 10)),
        MAX_AUDIT_CONCURRENCY=int(_get(_pipeline, "max_audit_concurrency", 5)),
        SCRAPER_INTERVAL_SECONDS=int(_get(_pipeline, "scraper_interval_seconds", 3600)),
        AUDITOR_INTERVAL_SECONDS=int(_get(_pipeline, "auditor_interval_seconds", 120)),
        ENRICHER_INTERVAL_SECONDS=int(_get(_pipeline, "enricher_interval_seconds", 120)),
    )


def clear_trigger_scrape() -> None:
    """Reset trigger_scrape flag to false after consuming it."""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE) as f:
                data = json.load(f)
            data.setdefault("stages", {})["trigger_scrape"] = False
            with open(SETTINGS_FILE, "w") as f:
                json.dump(data, f, indent=2)
    except Exception:
        pass


def clear_trigger_audit() -> None:
    """Reset trigger_audit flag to false after consuming it."""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE) as f:
                data = json.load(f)
            data.setdefault("stages", {})["trigger_audit"] = False
            with open(SETTINGS_FILE, "w") as f:
                json.dump(data, f, indent=2)
    except Exception:
        pass


def write_runtime(**kwargs) -> None:
    """Update the runtime section of pipeline_settings.json (timestamps, flags)."""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE) as f:
                data = json.load(f)
        else:
            data = {}
        rt = data.setdefault("runtime", {})
        rt.update(kwargs)
        with open(SETTINGS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


settings = Settings()
