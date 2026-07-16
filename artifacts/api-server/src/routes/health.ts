import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const missing: string[] = [];
  // Only MONGODB_URI is required for the API/dashboard to start.
  // Pipeline API keys (OpenAI, Apify, Apollo, PageSpeed) are set via the
  // dashboard Settings page and stored in pipeline_settings.json.
  if (!process.env.MONGODB_URI) missing.push("MONGODB_URI");

  if (missing.length > 0) {
    res.json({ status: "not_configured", missing });
    return;
  }

  res.json({ status: "ok" });
});

export default router;
