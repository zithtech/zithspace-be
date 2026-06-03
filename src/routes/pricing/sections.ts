import { Router } from "express";
import { SectionsController } from "@/controllers/pricing/sectionsController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

// TODO(pricing): replace with requirePlatformAdmin once that middleware exists.
// Catalog editing should be Zithmi-staff-only, not agency-admin.
const router = Router();

router.use(resolveTenant);

router.use(authenticateToken);
router.use(requireAuth);

router.get("/", SectionsController.list);
router.get("/:id", SectionsController.get);
router.post("/", SectionsController.create);
router.put("/:id", SectionsController.update);
router.patch("/:id/archive", SectionsController.archive);
router.patch("/:id/restore", SectionsController.restore);
router.delete("/:id", SectionsController.remove);

export default router;
