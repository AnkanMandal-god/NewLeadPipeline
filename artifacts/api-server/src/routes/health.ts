import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const missing: string[] = [];
  if (!process.env.MONGODB_URI) missing.push("MONGODB_URI");
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.APIFY_API_TOKEN) missing.push("APIFY_API_TOKEN");
  if (!process.env.APOLLO_API_KEY) missing.push("APOLLO_API_KEY");

  if (missing.length > 0) {
    res.json({ status: "not_configured", missing });
    return;
  }

  res.json({ status: "ok" });
});

export default router;
