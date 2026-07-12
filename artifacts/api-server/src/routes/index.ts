import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import settingsRouter from "./settings";
import batchesRouter from "./batches";
import pipelineRouter from "./pipeline";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadsRouter);
router.use(settingsRouter);
router.use(batchesRouter);
router.use(pipelineRouter);

export default router;
