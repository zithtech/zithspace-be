import { Router } from "express";
import { NotionAuthController } from "@/controllers/notionAuthController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();
console.log("📝 Notion Auth router initialized");

router.get(
    "/connect",
    resolveTenant,
    authenticateToken,
    requireAuth,
    NotionAuthController.connect
);

// Callback doesn't have auth middleware because it's called by Notion
router.get("/callback", NotionAuthController.callback);

export default router;
