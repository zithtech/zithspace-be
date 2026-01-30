"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reimbursementRequest_controller_1 = __importDefault(require("@/controllers/reimbursementRequest.controller"));
const auth_1 = __importDefault(require("@/middleware/auth"));
const router = (0, express_1.Router)();
//  Protect all reimbursement request APIs
router.use(auth_1.default.authenticateToken);
// CREATE
router.post("/", reimbursementRequest_controller_1.default.createRequest);
// READ
router.get("/", reimbursementRequest_controller_1.default.getRequests);
router.get("/:id", reimbursementRequest_controller_1.default.getRequestById);
// UPDATE
router.put("/:id", reimbursementRequest_controller_1.default.updateRequest);
// WORKFLOW
router.post("/:id/submit", reimbursementRequest_controller_1.default.submitRequest);
exports.default = router;
//# sourceMappingURL=reimbursementRequest.js.map