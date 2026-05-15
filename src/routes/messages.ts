import express from "express";
import { createMessage, getMessages } from "@/controllers/messageController";
import { authenticateToken } from "@/middleware/auth";
import { optionalTenantContext, requireTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router({ mergeParams: true }); // Enable access to parent params (channelId)

router.use(optionalTenantContext);
router.use(authenticateToken);
router.use(requireTenant);

router.post("/", requirePermission(Permissions.CHAT_CREATE), createMessage);
router.get("/", requirePermission(Permissions.CHAT_READ), getMessages);

export default router;
