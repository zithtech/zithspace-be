"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const channelController_1 = require("@/controllers/channelController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const messages_1 = __importDefault(require("./messages"));
const router = express_1.default.Router();
router.use(tenantContext_1.optionalTenantContext);
router.use(auth_1.authenticateToken);
router.use(tenantContext_1.requireTenant);
// Channel CRUD
router.post("/", channelController_1.createChannel);
router.get("/", channelController_1.getChannels);
router.get("/discover", channelController_1.getPublicChannels);
router.get("/:id", channelController_1.getChannelById);
router.post("/:id/join", channelController_1.joinChannel);
router.post("/:id/members", channelController_1.addMembersToChannel);
// Messages sub-routes
router.use("/:channelId/messages", messages_1.default);
exports.default = router;
//# sourceMappingURL=channels.js.map