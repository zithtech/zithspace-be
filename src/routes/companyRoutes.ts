import { Router } from "express";
import { CompanyController } from "@/controllers/companyController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Companies
 */
router.get("/", requirePermission(Permissions.SALARY_READ), CompanyController.getCompanies);
router.get("/:id", requirePermission(Permissions.SALARY_READ), CompanyController.getCompanyById);
router.post("/", requirePermission(Permissions.SALARY_MANAGE), CompanyController.createCompany);
router.put("/:id", requirePermission(Permissions.SALARY_MANAGE), CompanyController.updateCompany);
router.patch("/:id/active", requirePermission(Permissions.SALARY_MANAGE), CompanyController.setActiveCompany);
router.patch("/:id/deactivate", requirePermission(Permissions.SALARY_MANAGE), CompanyController.deactivateCompany);
router.delete("/:id", requirePermission(Permissions.SALARY_MANAGE), CompanyController.deleteCompany);

export default router;
