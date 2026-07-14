import { Router, type IRouter, type Request, type Response } from "express";
import { getCollection } from "@workspace/db";
import { requireRole } from "../lib/auth";

const router: IRouter = Router();

interface LeadDoc {
  id: number;
  business_name: string;
  website_url: string | null;
  has_website: boolean;
  phone: string | null;
  pipeline_status: string;
  scrape_batch_id: number | null;
  place_id: string | null;
  address: string | null;
  business_category: string | null;
  rating: number | null;
  review_count: number | null;
  desktop_speed_score: number | null;
  mobile_speed_score: number | null;
  ai_ux_critique: string | null;
  contact_email: string | null;
  contact_name: string | null;
  outreach_mode: string | null;
  outreach_status: string;
  outreach_notes: string | null;
  notes: string | null;
  discard_reason: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_STATUSES = [
  "10_Raw_Scraped",
  "20_Audit_Passed",
  "30_Ready_for_Outreach",
  "00_Discarded",
  "99_Manual_Review",
];

const VALID_OUTREACH_MODES = ["none", "email", "linkedin", "phone", "in-person", "other"];
const VALID_OUTREACH_STATUSES = ["not_started", "contacted", "meeting_scheduled", "meeting_concluded"];

const EXPORT_FIELDS = [
  "id", "business_name", "website_url", "has_website", "phone", "pipeline_status",
  "scrape_batch_id", "business_category", "address", "rating", "review_count",
  "desktop_speed_score", "mobile_speed_score", "ai_ux_critique",
  "contact_email", "contact_name",
  "outreach_mode", "outreach_status", "outreach_notes", "notes", "discard_reason",
  "created_at", "updated_at",
];

// Fields the sales_caller role may write via PATCH. Admin may write everything else.
const SALES_CALLER_EDITABLE_FIELDS = ["outreach_mode", "outreach_status", "outreach_notes"];
const ADMIN_EDITABLE_FIELDS = [
  "business_name", "website_url", "phone", "pipeline_status",
  "business_category", "address",
  "desktop_speed_score", "mobile_speed_score", "ai_ux_critique",
  "contact_email", "contact_name",
  "outreach_mode", "outreach_status", "outreach_notes", "notes", "discard_reason",
];

function projection(): Record<string, 0> {
  return { _id: 0 };
}

// GET /api/leads/stats — counts by pipeline status
router.get("/leads/stats", async (_req: Request, res: Response) => {
  try {
    const leads = await getCollection<LeadDoc>("leads");
    const rows = await leads
      .aggregate<{ _id: string; count: number }>([{ $group: { _id: "$pipeline_status", count: { $sum: 1 } } }])
      .toArray();
    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row._id] = row.count;
    }
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

function buildFilter(query: Request["query"]): Record<string, unknown> {
  const status = query["status"] as string | undefined;
  const search = query["search"] as string | undefined;
  const has_website = query["has_website"] as string | undefined;
  const has_contact = query["has_contact"] as string | undefined;
  const batch_id = query["batch_id"] as string | undefined;
  const business_category = query["business_category"] as string | undefined;
  const outreach_status = query["outreach_status"] as string | undefined;
  const has_speed_score = query["has_speed_score"] as string | undefined;

  const filter: Record<string, unknown> = {};

  if (status && VALID_STATUSES.includes(status)) {
    filter["pipeline_status"] = status;
  }
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter["$or"] = [
      { business_name: re },
      { website_url: re },
      { contact_email: re },
      { business_category: re },
      { address: re },
    ];
  }
  if (has_website === "true") {
    filter["has_website"] = true;
  } else if (has_website === "false") {
    filter["has_website"] = false;
  }
  if (has_contact === "true") {
    filter["contact_email"] = { $nin: [null, ""] };
  } else if (has_contact === "false") {
    filter["$or"] = [{ contact_email: null }, { contact_email: "" }];
  }
  if (batch_id && !isNaN(parseInt(batch_id))) {
    filter["scrape_batch_id"] = parseInt(batch_id, 10);
  }
  if (business_category && business_category.trim()) {
    filter["business_category"] = new RegExp(
      business_category.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
  }
  if (outreach_status && VALID_OUTREACH_STATUSES.includes(outreach_status)) {
    filter["outreach_status"] = outreach_status;
  }
  if (has_speed_score === "true") {
    filter["$or"] = [
      ...(Array.isArray(filter["$or"]) ? (filter["$or"] as unknown[]) : []),
      { mobile_speed_score: { $ne: null } },
      { desktop_speed_score: { $ne: null } },
    ];
  }

  return filter;
}

// GET /api/leads/export?status=... — CSV download
// Admins may export any pipeline segment. Sales callers may only export leads
// that are already in outreach (has an outreach mode or a started outreach status),
// filterable by outreach_status/search — never by pipeline stage, batch, or category.
router.get("/leads/export", requireRole("admin", "sales_caller"), async (req: Request, res: Response) => {
  try {
    const role = req.session.role;
    let filter: Record<string, unknown>;
    let filenameSuffix = "";

    if (role === "sales_caller") {
      const outreach_status = req.query["outreach_status"] as string | undefined;
      const search = req.query["search"] as string | undefined;

      const conditions: Record<string, unknown>[] = [
        {
          $or: [
            { outreach_mode: { $nin: [null, "none"] } },
            { outreach_status: { $nin: [null, "not_started"] } },
          ],
        },
      ];

      if (outreach_status && VALID_OUTREACH_STATUSES.includes(outreach_status)) {
        conditions.push({ outreach_status });
        filenameSuffix = `_${outreach_status}`;
      }
      if (search && search.trim()) {
        const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        conditions.push({
          $or: [{ business_name: re }, { contact_name: re }, { contact_email: re }],
        });
      }

      filter = { $and: conditions };
    } else {
      const status = req.query["status"] as string | undefined;
      filter = status && VALID_STATUSES.includes(status) ? { pipeline_status: status } : {};
      filenameSuffix = status ? `_${status}` : "";
    }

    const leads = await getCollection<LeadDoc>("leads");
    const rows = await leads
      .find(filter, { projection: projection() })
      .sort({ updated_at: -1 })
      .toArray();

    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };

    const csv = [
      EXPORT_FIELDS.join(","),
      ...rows.map((row) => EXPORT_FIELDS.map((h) => escape((row as Record<string, unknown>)[h])).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="leads${filenameSuffix}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Failed to export leads" });
  }
});

// GET /api/leads — all leads with optional filters
router.get("/leads", async (req: Request, res: Response) => {
  try {
    const filter = buildFilter(req.query);
    const leads = await getCollection<LeadDoc>("leads");
    const rows = await leads.find(filter, { projection: projection() }).sort({ updated_at: -1 }).toArray();
    res.json({ leads: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// GET /api/leads/:id — single lead
router.get("/leads/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    const leads = await getCollection<LeadDoc>("leads");
    const lead = await leads.findOne({ id }, { projection: projection() });
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({ lead });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// PATCH /api/leads/:id — update lead fields (role-restricted)
router.patch("/leads/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    const role = req.session.role;
    const allowed = role === "admin" ? ADMIN_EDITABLE_FIELDS : SALES_CALLER_EDITABLE_FIELDS;

    const attemptedDisallowed = Object.keys(req.body).filter(
      (key) => !allowed.includes(key) && key !== "website_url",
    );
    if (role !== "admin" && attemptedDisallowed.length > 0) {
      res.status(403).json({
        error: `Your role can only edit outreach fields (${SALES_CALLER_EDITABLE_FIELDS.join(", ")})`,
      });
      return;
    }

    const set: Record<string, unknown> = {};
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
        set[key] = req.body[key];
      }
    }

    // Auto-update has_website when website_url changes (admin only field)
    if (role === "admin" && "website_url" in req.body) {
      const url = req.body["website_url"];
      set["has_website"] = Boolean(url && url !== "");
    }

    if (!Object.keys(set).length) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    set["updated_at"] = new Date().toISOString();

    const leads = await getCollection<LeadDoc>("leads");
    const result = await leads.findOneAndUpdate(
      { id },
      { $set: set },
      { returnDocument: "after", projection: projection() },
    );

    if (!result) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({ lead: result });
  } catch (err) {
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// DELETE /api/leads/:id — admin only
router.delete("/leads/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    const leads = await getCollection<LeadDoc>("leads");
    const result = await leads.deleteOne({ id });
    if (!result.deletedCount) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

export default router;
