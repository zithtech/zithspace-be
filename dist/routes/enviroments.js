"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const enviromentsController_1 = __importDefault(require("@/controllers/enviromentsController"));
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/enviroments
 * @desc    Get all environments (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get('/', enviromentsController_1.default.getEnviroments);
/**
 * @route   GET /api/enviroments/:id
 * @desc    Get single environment
 * @access  Private
 */
router.get('/:id', enviromentsController_1.default.getEnviromentById);
/**
 * @route   POST /api/enviroments
 * @desc    Create environment
 * @access  Private (admin only)
 * @body    { name, code, status }
 */
router.post('/', enviromentsController_1.default.createEnviroment);
/**
 * @route   PUT /api/enviroments/:id
 * @desc    Update environment
 * @access  Private (admin only)
 */
router.put('/:id', enviromentsController_1.default.updateEnviroment);
/**
 * @route   DELETE /api/enviroments/:id
 * @desc    Delete (soft delete) environment
 * @access  Private (admin only)
 */
router.delete('/:id', enviromentsController_1.default.deleteEnviroment);
exports.default = router;
//# sourceMappingURL=enviroments.js.map