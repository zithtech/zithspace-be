"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const positionController_1 = require("@/controllers/positionController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = express_1.default.Router();
// Apply tenant context and authentication middleware to all routes
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.post("/", positionController_1.PositionController.createPosition);
router.get("/", positionController_1.PositionController.getPositions);
router.get("/:id", positionController_1.PositionController.getPositionById);
router.put("/:id", positionController_1.PositionController.updatePosition);
router.delete("/:id", positionController_1.PositionController.deletePosition);
exports.default = router;
//# sourceMappingURL=positionRoutes.js.map