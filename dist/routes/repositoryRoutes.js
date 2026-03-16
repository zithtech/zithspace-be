"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const repositoryController_1 = require("@/controllers/repositoryController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = (0, express_1.Router)();
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_READ), repositoryController_1.RepositoryController.getRepositories);
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.PROJECT_MANAGE), repositoryController_1.RepositoryController.createRepository);
exports.default = router;
//# sourceMappingURL=repositoryRoutes.js.map