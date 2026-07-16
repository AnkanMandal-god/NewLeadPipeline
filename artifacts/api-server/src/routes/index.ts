import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import leadsRouter from "./leads";
import settingsRouter from "./settings";
import batchesRouter from "./batches";
import pipelineRouter from "./pipeline";
import notificationsRouter from "./notifications";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(authRouter);

// Everything below requires a logged-in session.
router.use(requireAuth);

// Leads: readable by every role; leads.ts applies its own per-role field
// and endpoint restrictions (e.g. sales_caller can only edit outreach fields).
router.use(leadsRouter);

// Admin-only surfaces: settings, batches, and pipeline controls are not part
// of the sales caller's outreach-only scope.
router.use(requireRole("admin"), settingsRouter);
router.use(requireRole("admin"), batchesRouter);
router.use(requireRole("admin"), pipelineRouter);
router.use(requireRole("admin"), notificationsRouter);

export default router;
