
import { Router } from "express";
import { RepositoryController } from "@/controllers/repositoryController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", requirePermission(Permissions.PROJECT_READ), RepositoryController.getRepositories);
router.post("/", requirePermission(Permissions.PROJECT_MANAGE), RepositoryController.createRepository);

export default router;
