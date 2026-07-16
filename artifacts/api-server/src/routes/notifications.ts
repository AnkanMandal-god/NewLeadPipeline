import { Router, type IRouter, type Request, type Response } from "express";
import { getCollection } from "@workspace/db";

const router: IRouter = Router();

interface NotificationDoc {
  id: number;
  time: string;
  level: "info" | "warning" | "error";
  source: string;
  message: string;
  read: boolean;
  meta?: Record<string, unknown>;
}

function projection(): Record<string, 0> {
  return { _id: 0 };
}

// GET /api/notifications — recent task/error log entries, newest first
router.get("/notifications", async (req: Request, res: Response) => {
  try {
    const limitRaw = parseInt(req.query["limit"] as string, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const unreadOnly = req.query["unreadOnly"] === "true" || req.query["unreadOnly"] === "1";

    const events = await getCollection<NotificationDoc>("pipeline_events");
    const filter = unreadOnly ? { read: false } : {};
    const notifications = await events
      .find(filter, { projection: projection() })
      .sort({ id: -1 })
      .limit(limit)
      .toArray();
    const unreadCount = await events.countDocuments({ read: false });

    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// POST /api/notifications/read — mark one (by id) or all notifications as read
router.post("/notifications/read", async (req: Request, res: Response) => {
  try {
    const { id, all } = req.body as { id?: number; all?: boolean };
    const events = await getCollection<NotificationDoc>("pipeline_events");

    if (all) {
      await events.updateMany({ read: false }, { $set: { read: true } });
    } else if (typeof id === "number") {
      await events.updateOne({ id }, { $set: { read: true } });
    } else {
      res.status(400).json({ error: "Provide either 'id' or 'all: true'" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notifications read" });
  }
});

export default router;
