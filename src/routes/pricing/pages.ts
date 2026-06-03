import { Router } from "express";
import { PagesController } from "@/controllers/pricing/pagesController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", PagesController.list);
router.get("/:id", PagesController.get);
router.post("/", PagesController.create);
router.put("/:id", PagesController.update);
router.patch("/:id/archive", PagesController.archive);
router.patch("/:id/restore", PagesController.restore);
router.delete("/:id", PagesController.remove);

export default router;
