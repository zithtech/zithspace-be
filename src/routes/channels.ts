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
import messagesRouter from "./messages";

const router = express.Router();

router.use(optionalTenantContext);
router.use(authenticate);
router.use(requireTenant);

// Channel CRUD
router.post("/", createChannel);
router.get("/", getChannels);
router.get("/discover", getPublicChannels);
router.get("/:id", getChannelById);
router.post("/:id/join", joinChannel);
router.post("/:id/members", addMembersToChannel);

// Messages sub-routes
router.use("/:channelId/messages", messagesRouter);

export default router;
