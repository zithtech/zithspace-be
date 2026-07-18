import { Router } from "express";
import { authenticateToken } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { AiSettingsController } from "@/controllers/AiSettingsController";

const router = Router();

router.use(authenticateToken);

// Read the tenant's AI config + the predefined platform menu.
router.get("/settings", requirePermission("settings.read"), AiSettingsController.getSettings);

// Upsert the tenant's AI config (platform pick or BYO provider/model/key).
router.put("/settings", requirePermission("settings.manage"), AiSettingsController.updateSettings);

// Validate a credential and list the models it can access (for the UI dropdown).
router.post("/settings/test", requirePermission("settings.manage"), AiSettingsController.testConnection);

export default router;
