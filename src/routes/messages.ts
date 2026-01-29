import express from "express";
import { createMessage, getMessages } from "@/controllers/messageController";
import { authenticateToken } from "@/middleware/auth";
import { optionalTenantContext, requireTenant } from "@/middleware/tenantContext";

const router = express.Router({ mergeParams: true }); // Enable access to parent params (channelId)

router.use(optionalTenantContext);
router.use(authenticateToken);
router.use(requireTenant);

router.post("/", createMessage);
router.get("/", getMessages);

export default router;
