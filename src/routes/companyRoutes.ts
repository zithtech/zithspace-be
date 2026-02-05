import { Router } from "express";
import { CompanyController } from "@/controllers/companyController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Companies
 */
router.get("/", CompanyController.getCompanies);
router.get("/:id", CompanyController.getCompanyById);
router.post("/", CompanyController.createCompany);
router.put("/:id", CompanyController.updateCompany);
router.patch("/:id/active", CompanyController.setActiveCompany);
router.delete("/:id", CompanyController.deleteCompany);

export default router;
