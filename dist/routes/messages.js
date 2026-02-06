"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageController_1 = require("@/controllers/messageController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router({ mergeParams: true }); // Enable access to parent params (channelId)
router.use(tenantContext_1.optionalTenantContext);
router.use(auth_1.authenticateToken);
router.use(tenantContext_1.requireTenant);
router.post("/", messageController_1.createMessage);
router.get("/", messageController_1.getMessages);
exports.default = router;
//# sourceMappingURL=messages.js.map