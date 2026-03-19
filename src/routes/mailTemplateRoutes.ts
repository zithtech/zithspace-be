import { Router } from "express";
import { MailTemplateController } from "../controllers/mailTemplateController";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";

const router = Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", MailTemplateController.getAllMailTemplates);
router.get("/:id", MailTemplateController.getMailTemplateById);
router.post("/", MailTemplateController.createMailTemplate);
router.put("/:id", MailTemplateController.updateMailTemplate);
router.delete("/:id", MailTemplateController.deleteMailTemplate);

export default router;
