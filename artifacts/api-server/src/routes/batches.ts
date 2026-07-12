import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// GET /api/batches — list all scrape batches newest first
router.get("/batches", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, query, location, limit_count, scraped_at, lead_count
       FROM scrape_batches ORDER BY scraped_at DESC`,
    );
    res.json({ batches: result.rows, total: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch batches" });
  }
});

// GET /api/batches/:id — single batch
router.get("/batches/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, query, location, limit_count, scraped_at, lead_count
       FROM scrape_batches WHERE id = $1`,
      [req.params["id"]],
    );
    if (!result.rows.length) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }
    res.json({ batch: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch batch" });
  }
});

export default router;
