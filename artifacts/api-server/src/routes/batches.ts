import { Router, type IRouter, type Request, type Response } from "express";
import { getCollection } from "@workspace/db";

const router: IRouter = Router();

interface BatchDoc {
  id: number;
  query: string;
  location: string;
  limit_count: number;
  scraped_at: string;
  lead_count: number;
}

function projection(): Record<string, 0> {
  return { _id: 0 };
}

// GET /api/batches — list all scrape batches newest first
router.get("/batches", async (_req: Request, res: Response) => {
  try {
    const batches = await getCollection<BatchDoc>("scrape_batches");
    const rows = await batches.find({}, { projection: projection() }).sort({ scraped_at: -1 }).toArray();
    res.json({ batches: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch batches" });
  }
});

// GET /api/batches/:id — single batch
router.get("/batches/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    const batches = await getCollection<BatchDoc>("scrape_batches");
    const batch = await batches.findOne({ id }, { projection: projection() });
    if (!batch) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }
    res.json({ batch });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch batch" });
  }
});

export default router;
