import express from "express";
import {
    createChannel,
    getChannels,
    getChannelById,
    getPublicChannels,
    joinChannel,
    addMembersToChannel
} from "@/controllers/channelController";
import { authenticateToken as authenticate } from "@/middleware/auth";
import { optionalTenantContext, requireTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import messagesRouter from "./messages";

const router = express.Router();

router.use(optionalTenantContext);
router.use(authenticate);
router.use(requireTenant);

// Channel CRUD
router.post("/", requirePermission('chat.create'), createChannel);
router.get("/", requirePermission('chat.read'), getChannels);
router.get("/discover", requirePermission('chat.read'), getPublicChannels);
router.get("/:id", requirePermission('chat.read'), getChannelById);
router.post("/:id/join", requirePermission('chat.create'), joinChannel);
router.post("/:id/members", requirePermission('chat.update'), addMembersToChannel);

// Messages sub-routes
router.use("/:channelId/messages", messagesRouter);

export default router;
