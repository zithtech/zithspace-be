import { Router } from "express";
import { PipelineStageController } from "@/controllers/pipelineStageController";
import { authenticateToken } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Middleware to resolve tenant and authenticate
router.use(resolveTenant);
router.use(authenticateToken);

router.get("/", PipelineStageController.getAllPipelineStages);
router.post("/", PipelineStageController.createPipelineStage);
router.put("/reorder", PipelineStageController.reorderPipelineStages);
router.put("/:id", PipelineStageController.updatePipelineStage);
router.delete("/:id", PipelineStageController.deletePipelineStage);

export default router;
