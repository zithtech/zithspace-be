import { Router } from "express";
import { EscalationCategoryController } from "../controllers/escalationCategoryController";
import { EscalationPriorityController } from "../controllers/escalationPriorityController";
import { EscalationStatusController } from "../controllers/escalationStatusController";
import { authenticateToken } from "@/middleware/auth";
import { resolveTenant } from "../middleware/tenantContext";

const router = Router();

// Apply tenant context and authentication
router.use(resolveTenant);
router.use(authenticateToken);

// Category Routes
router.post("/categories", EscalationCategoryController.createCategory);
router.get("/categories", EscalationCategoryController.getAllCategories);
router.put("/categories/:id", EscalationCategoryController.updateCategory);
router.delete("/categories/:id", EscalationCategoryController.deleteCategory);

// Priority Routes
router.post("/priorities", EscalationPriorityController.createPriority);
router.get("/priorities", EscalationPriorityController.getAllPriorities);
router.put("/priorities/:id", EscalationPriorityController.updatePriority);
router.delete("/priorities/:id", EscalationPriorityController.deletePriority);

// Status Routes
router.post("/statuses", EscalationStatusController.createStatus);
router.get("/statuses", EscalationStatusController.getAllStatuses);
router.put("/statuses/:id", EscalationStatusController.updateStatus);
router.delete("/statuses/:id", EscalationStatusController.deleteStatus);

export default router;
