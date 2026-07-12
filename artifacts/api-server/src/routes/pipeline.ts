import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();

// Resolve from the compiled bundle location up to the monorepo root.
const _bundleDir = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.resolve(_bundleDir, "../../../vibe-prospector/pipeline_settings.json");

const VALID_STAGES = ["scraper", "auditor", "enricher"] as const;
type Stage = (typeof VALID_STAGES)[number];

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function patchStages(patch: Record<string, unknown>): Record<string, unknown> {
  const current = readSettings();
  current["stages"] = { ...(current["stages"] as Record<string, unknown> || {}), ...patch };
  writeSettings(current);
  return current["stages"] as Record<string, unknown>;
}

// GET /api/pipeline/status — current stage enable states + runtime stats
router.get("/pipeline/status", (_req: Request, res: Response) => {
  try {
    const settings = readSettings();
    const stages = (settings["stages"] as Record<string, unknown>) || {};
    const runtime = (settings["runtime"] as Record<string, unknown>) || {};
    const pipeline = (settings["pipeline"] as Record<string, unknown>) || {};
    res.json({
      stages: {
        scraper_enabled: stages["scraper_enabled"] ?? true,
        auditor_enabled: stages["auditor_enabled"] ?? true,
        enricher_enabled: stages["enricher_enabled"] ?? true,
        trigger_scrape: stages["trigger_scrape"] ?? false,
        trigger_audit: stages["trigger_audit"] ?? false,
      },
      runtime: {
        scraper_running: runtime["scraper_running"] ?? false,
        auditor_running: runtime["auditor_running"] ?? false,
        last_scrape_at: runtime["last_scrape_at"] ?? null,
        last_audit_at: runtime["last_audit_at"] ?? null,
        last_enrich_at: runtime["last_enrich_at"] ?? null,
      },
      intervals: {
        scraper_interval_seconds: pipeline["scraper_interval_seconds"] ?? 3600,
        auditor_interval_seconds: pipeline["auditor_interval_seconds"] ?? 120,
        enricher_interval_seconds: pipeline["enricher_interval_seconds"] ?? 120,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read pipeline status" });
  }
});

// POST /api/pipeline/:stage/enable
router.post("/pipeline/:stage/enable", (req: Request, res: Response) => {
  const stage = req.params["stage"] as Stage;
  if (!VALID_STAGES.includes(stage)) {
    res.status(400).json({ error: `Invalid stage: ${stage}` });
    return;
  }
  try {
    const stages = patchStages({ [`${stage}_enabled`]: true });
    res.json({ stages });
  } catch (err) {
    res.status(500).json({ error: "Failed to enable stage" });
  }
});

// POST /api/pipeline/:stage/disable
router.post("/pipeline/:stage/disable", (req: Request, res: Response) => {
  const stage = req.params["stage"] as Stage;
  if (!VALID_STAGES.includes(stage)) {
    res.status(400).json({ error: `Invalid stage: ${stage}` });
    return;
  }
  try {
    const stages = patchStages({ [`${stage}_enabled`]: false });
    res.json({ stages });
  } catch (err) {
    res.status(500).json({ error: "Failed to disable stage" });
  }
});

// POST /api/pipeline/scraper/trigger — queue an on-demand scrape
router.post("/pipeline/scraper/trigger", (_req: Request, res: Response) => {
  try {
    const stages = patchStages({ trigger_scrape: true });
    res.json({ stages, queued: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to trigger scrape" });
  }
});

// GET /api/pipeline/scrape-progress — live progress of the current/last scrape
router.get("/pipeline/scrape-progress", (_req: Request, res: Response) => {
  try {
    const settings = readSettings();
    const prog = (settings["scrape_progress"] as Record<string, unknown>) || {};
    res.json({
      step: prog["step"] ?? "idle",
      message: prog["message"] ?? "",
      current: prog["current"] ?? 0,
      total: prog["total"] ?? 0,
      new_leads: prog["new_leads"] ?? 0,
      duplicates_skipped: prog["duplicates_skipped"] ?? 0,
      query: prog["query"] ?? null,
      location: prog["location"] ?? null,
      log: prog["log"] ?? [],
      started_at: prog["started_at"] ?? null,
      finished_at: prog["finished_at"] ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read scrape progress" });
  }
});

// GET /api/pipeline/audit-progress — live progress of the current/last audit run
router.get("/pipeline/audit-progress", (_req: Request, res: Response) => {
  try {
    const settings = readSettings();
    const prog = (settings["audit_progress"] as Record<string, unknown>) || {};
    res.json({
      step: prog["step"] ?? "idle",
      message: prog["message"] ?? "",
      current: prog["current"] ?? 0,
      total: prog["total"] ?? 0,
      passed: prog["passed"] ?? 0,
      failed: prog["failed"] ?? 0,
      inconclusive: prog["inconclusive"] ?? 0,
      log: prog["log"] ?? [],
      started_at: prog["started_at"] ?? null,
      finished_at: prog["finished_at"] ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read audit progress" });
  }
});

// POST /api/pipeline/auditor/trigger — queue an on-demand audit run
router.post("/pipeline/auditor/trigger", (_req: Request, res: Response) => {
  try {
    const stages = patchStages({ trigger_audit: true });
    res.json({ stages, queued: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to trigger audit" });
  }
});

export default router;
