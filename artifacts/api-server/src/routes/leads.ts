import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const VALID_STATUSES = [
  "10_Raw_Scraped",
  "20_Audit_Passed",
  "30_Ready_for_Outreach",
  "00_Discarded",
  "99_Manual_Review",
];

const VALID_OUTREACH_MODES = ["none", "email", "linkedin", "phone", "in-person", "other"];
const VALID_OUTREACH_STATUSES = ["not_started", "contacted", "meeting_scheduled", "meeting_concluded"];

// GET /api/leads/stats — counts by pipeline status
router.get("/leads/stats", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<{ pipeline_status: string; count: string }>(
      `SELECT pipeline_status, COUNT(*) as count FROM leads GROUP BY pipeline_status ORDER BY pipeline_status`,
    );
    const stats: Record<string, number> = {};
    for (const row of result.rows) {
      stats[row.pipeline_status] = parseInt(row.count, 10);
    }
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/leads/export?status=... — CSV download
router.get("/leads/export", async (req: Request, res: Response) => {
  try {
    const status = req.query["status"] as string | undefined;
    const params: string[] = [];
    let where = "";
    if (status && VALID_STATUSES.includes(status)) {
      where = "WHERE pipeline_status = $1";
      params.push(status);
    }

    const result = await pool.query(
      `SELECT id, business_name, website_url, has_website, phone, pipeline_status,
              scrape_batch_id, business_category, address, rating, review_count,
              desktop_speed_score, mobile_speed_score, ai_ux_critique,
              contact_email, contact_name,
              outreach_mode, outreach_status, outreach_notes, notes, discard_reason,
              created_at, updated_at
       FROM leads ${where} ORDER BY updated_at DESC`,
      params,
    );

    const headers = [
      "id", "business_name", "website_url", "has_website", "phone", "pipeline_status",
      "scrape_batch_id", "business_category", "address", "rating", "review_count",
      "desktop_speed_score", "mobile_speed_score", "ai_ux_critique",
      "contact_email", "contact_name",
      "outreach_mode", "outreach_status", "outreach_notes", "notes", "discard_reason",
      "created_at", "updated_at",
    ];

    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };

    const csv = [
      headers.join(","),
      ...result.rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="leads${status ? `_${status}` : ""}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Failed to export leads" });
  }
});

// GET /api/leads — all leads with optional filters
router.get("/leads", async (req: Request, res: Response) => {
  try {
    const status = req.query["status"] as string | undefined;
    const search = req.query["search"] as string | undefined;
    const has_website = req.query["has_website"] as string | undefined;
    const has_contact = req.query["has_contact"] as string | undefined;
    const batch_id = req.query["batch_id"] as string | undefined;
    const business_category = req.query["business_category"] as string | undefined;
    const outreach_status = req.query["outreach_status"] as string | undefined;
    const has_speed_score = req.query["has_speed_score"] as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status && VALID_STATUSES.includes(status)) {
      conditions.push(`pipeline_status = $${idx++}`);
      params.push(status);
    }
    if (search && search.trim()) {
      conditions.push(
        `(business_name ILIKE $${idx} OR website_url ILIKE $${idx} OR contact_email ILIKE $${idx} OR business_category ILIKE $${idx} OR address ILIKE $${idx})`,
      );
      params.push(`%${search.trim()}%`);
      idx++;
    }
    if (has_website === "true") {
      conditions.push(`has_website = true`);
    } else if (has_website === "false") {
      conditions.push(`has_website = false`);
    }
    if (has_contact === "true") {
      conditions.push(`contact_email IS NOT NULL AND contact_email != ''`);
    } else if (has_contact === "false") {
      conditions.push(`(contact_email IS NULL OR contact_email = '')`);
    }
    if (batch_id && !isNaN(parseInt(batch_id))) {
      conditions.push(`scrape_batch_id = $${idx++}`);
      params.push(parseInt(batch_id));
    }
    if (business_category && business_category.trim()) {
      conditions.push(`business_category ILIKE $${idx++}`);
      params.push(`%${business_category.trim()}%`);
    }
    if (outreach_status && VALID_OUTREACH_STATUSES.includes(outreach_status)) {
      conditions.push(`outreach_status = ${idx++}`);
      params.push(outreach_status);
    }
    if (has_speed_score === "true") {
      conditions.push(`(mobile_speed_score IS NOT NULL OR desktop_speed_score IS NOT NULL)`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT id, business_name, website_url, has_website, phone, pipeline_status,
              scrape_batch_id, place_id, address, business_category, rating, review_count,
              desktop_speed_score, mobile_speed_score, ai_ux_critique,
              contact_email, contact_name,
              outreach_mode, outreach_status, outreach_notes, notes, discard_reason,
              created_at, updated_at
       FROM leads ${where} ORDER BY updated_at DESC`,
      params,
    );

    res.json({ leads: result.rows, total: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// GET /api/leads/:id — single lead
router.get("/leads/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM leads WHERE id = $1", [req.params["id"]]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({ lead: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// PATCH /api/leads/:id — update any lead fields
router.patch("/leads/:id", async (req: Request, res: Response) => {
  try {
    const allowed = [
      "business_name", "website_url", "phone", "pipeline_status",
      "business_category", "address",
      "desktop_speed_score", "mobile_speed_score", "ai_ux_critique",
      "contact_email", "contact_name",
      "outreach_mode", "outreach_status", "outreach_notes", "notes", "discard_reason",
    ];

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (key in req.body) {
        if (key === "pipeline_status" && !VALID_STATUSES.includes(req.body[key])) {
          res.status(400).json({ error: `Invalid pipeline_status: ${req.body[key]}` });
          return;
        }
        if (key === "outreach_mode" && req.body[key] && !VALID_OUTREACH_MODES.includes(req.body[key])) {
          res.status(400).json({ error: `Invalid outreach_mode: ${req.body[key]}` });
          return;
        }
        if (key === "outreach_status" && !VALID_OUTREACH_STATUSES.includes(req.body[key])) {
          res.status(400).json({ error: `Invalid outreach_status: ${req.body[key]}` });
          return;
        }
        updates.push(`${key} = $${idx++}`);
        params.push(req.body[key]);
      }
    }

    // Auto-update has_website when website_url changes
    if ("website_url" in req.body) {
      const url = req.body["website_url"];
      updates.push(`has_website = $${idx++}`);
      params.push(Boolean(url && url !== ""));
    }

    if (!updates.length) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.params["id"]);

    const result = await pool.query(
      `UPDATE leads SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    res.json({ lead: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// DELETE /api/leads/:id — delete a lead
router.delete("/leads/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("DELETE FROM leads WHERE id = $1 RETURNING id", [req.params["id"]]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({ deleted: true, id: result.rows[0]["id"] });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

export default router;
