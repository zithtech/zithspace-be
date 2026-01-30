import { Router } from "express";
import ReimbursementCategoryController from "@/controllers/reimbursementCategory.controller";
import authMiddleware from "@/middleware/auth";


const router = Router();

router.use(authMiddleware.authenticateToken);

router.post("/", ReimbursementCategoryController.createCategory);
router.get("/", ReimbursementCategoryController.getCategories);
router.get("/:id", ReimbursementCategoryController.getCategoryById);
router.put("/:id", ReimbursementCategoryController.updateCategory);
router.delete("/:id", ReimbursementCategoryController.deleteCategory);

export default router;
