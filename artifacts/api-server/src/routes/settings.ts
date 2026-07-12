import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();

// Resolve from the compiled bundle location up to the monorepo root.
// dist/index.mjs → ../../../  = workspace root (artifacts/api-server/dist → api-server → artifacts → root)
const _bundleDir = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.resolve(_bundleDir, "../../../vibe-prospector/pipeline_settings.json");

const DEFAULT_SETTINGS = {
  api_keys: {
    OPENAI_API_KEY: "sk-placeholder",
    APOLLO_API_KEY: "apollo-placeholder",
    APIFY_API_TOKEN: "",
    PAGESPEED_API_KEY: "",
  },
  scraper: {
    query: "gym",
    location: "New York, NY",
    limit: 20,
  },
  auditor: {
    mobile_pass_threshold: 50,
    mobile_discard_threshold: 60,
    openai_model: "gpt-4o-mini",
    openai_max_tokens: 300,
  },
  enricher: {
    target_titles: ["Owner", "Founder", "CEO", "Director"],
  },
  pipeline: {
    poll_interval_seconds: 10,
    max_audit_concurrency: 5,
    scraper_interval_seconds: 3600,
    auditor_interval_seconds: 120,
    enricher_interval_seconds: 120,
  },
  stages: {
    scraper_enabled: true,
    auditor_enabled: true,
    enricher_enabled: true,
    trigger_scrape: false,
  },
};

type Settings = typeof DEFAULT_SETTINGS;

function readSettings(): Settings {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return JSON.parse(raw) as Settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(data: Settings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function maskKey(value: string): string {
  if (!value || value.includes("placeholder") || value.length < 8) return value;
  return "••••••••" + value.slice(-4);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// GET /api/settings — returns settings with masked API keys
router.get("/settings", (_req: Request, res: Response) => {
  try {
    const settings = readSettings();
    const masked = {
      ...settings,
      api_keys: {
        OPENAI_API_KEY: maskKey(settings.api_keys.OPENAI_API_KEY),
        APOLLO_API_KEY: maskKey(settings.api_keys.APOLLO_API_KEY),
        APIFY_API_TOKEN: maskKey(settings.api_keys.APIFY_API_TOKEN),
        PAGESPEED_API_KEY: maskKey(settings.api_keys.PAGESPEED_API_KEY),
      },
    };
    res.json({ settings: masked });
  } catch (err) {
    res.status(500).json({ error: "Failed to read settings" });
  }
});

// PATCH /api/settings — deep-merge updates into pipeline_settings.json
router.patch("/settings", (req: Request, res: Response) => {
  try {
    const current = readSettings();
    const updates = req.body as Partial<Settings>;

    // Never overwrite a real key with a masked value (contains •)
    if (updates.api_keys) {
      for (const k of Object.keys(updates.api_keys) as Array<keyof typeof updates.api_keys>) {
        const incoming = updates.api_keys[k] || "";
        if (incoming.includes("•")) {
          updates.api_keys[k] = current.api_keys[k];
        }
      }
    }

    const merged = deepMerge(
      current as unknown as Record<string, unknown>,
      updates as unknown as Record<string, unknown>,
    ) as Settings;

    writeSettings(merged);

    const masked = {
      ...merged,
      api_keys: {
        OPENAI_API_KEY: maskKey(merged.api_keys.OPENAI_API_KEY),
        APOLLO_API_KEY: maskKey(merged.api_keys.APOLLO_API_KEY),
        APIFY_API_TOKEN: maskKey(merged.api_keys.APIFY_API_TOKEN),
        PAGESPEED_API_KEY: maskKey(merged.api_keys.PAGESPEED_API_KEY),
      },
    };
    res.json({ settings: masked });
  } catch (err) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
