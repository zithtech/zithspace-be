import { Router } from "express";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import MomStaffController from "@/controllers/momStaffController";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Detail / update / delete on a specific MOM
router.get("/:id", MomStaffController.detail);
router.put("/:id", MomStaffController.update);
router.delete("/:id", MomStaffController.remove);

// Action item operations
router.patch(
  "/action-items/:itemId/status",
  MomStaffController.updateActionItemStatus,
);
router.post(
  "/action-items/:itemId/convert",
  MomStaffController.convertActionItem,
);

export default router;
