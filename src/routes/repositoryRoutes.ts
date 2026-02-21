
import { Router } from "express";
import { RepositoryController } from "@/controllers/repositoryController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.get("/", RepositoryController.getRepositories);
router.post("/", RepositoryController.createRepository);

export default router;
