import express from "express";
import { EmployeeOnboardingController } from "@/controllers/employeeOnboardingController";
import {
  createInvite,
  listInvites,
  revokeInvite,
  activateEmployee,
  updateInviteContact,
} from "@/controllers/onboardingInviteController";
import {
  listDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
} from "@/controllers/onboardingDocumentTypeController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GLOBAL MIDDLEWARE
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── Onboarding invites (public-link flow) ───────────────────────────────
// Declared before "/:employeeId" so "invite"/"invites" aren't read as ids.
router.post("/invite", requirePermission(Permissions.ONBOARDING_CREATE), asyncHandler(createInvite));
router.get("/invites", requirePermission(Permissions.ONBOARDING_READ), asyncHandler(listInvites));
router.post("/invite/:inviteId/revoke", requirePermission(Permissions.ONBOARDING_UPDATE), asyncHandler(revokeInvite));
router.put("/invite/:employeeId", requirePermission(Permissions.ONBOARDING_UPDATE), asyncHandler(updateInviteContact));
router.post("/:employeeId/activate", requirePermission(Permissions.ONBOARDING_UPDATE), asyncHandler(activateEmployee));

// ─── Documents-needed catalog (Settings → Documents Needed) ──────────────
router.get("/document-types", requirePermission(Permissions.ONBOARDING_SETTING_READ), asyncHandler(listDocumentTypes));
router.post("/document-types", requirePermission(Permissions.ONBOARDING_SETTING_UPDATE), asyncHandler(createDocumentType));
router.put("/document-types/:id", requirePermission(Permissions.ONBOARDING_SETTING_UPDATE), asyncHandler(updateDocumentType));
router.delete("/document-types/:id", requirePermission(Permissions.ONBOARDING_SETTING_UPDATE), asyncHandler(deleteDocumentType));

// ROUTES
router.post("/", requirePermission(Permissions.ONBOARDING_CREATE), asyncHandler(EmployeeOnboardingController.create));
router.get("/", requirePermission(Permissions.ONBOARDING_READ), asyncHandler(EmployeeOnboardingController.getAll));
// Must be placed before /:employeeId to prevent 'birthdays' from being treated as an employeeId parameter
router.get("/birthdays", requirePermission(Permissions.ONBOARDING_READ), asyncHandler(EmployeeOnboardingController.getUpcomingBirthdays));
router.get("/:employeeId", requirePermission(Permissions.ONBOARDING_READ), asyncHandler(EmployeeOnboardingController.getById));
router.put("/:employeeId", requirePermission(Permissions.ONBOARDING_UPDATE), asyncHandler(EmployeeOnboardingController.update));
router.delete(
  "/:employeeId",
  requirePermission(Permissions.ONBOARDING_DELETE),
  asyncHandler(EmployeeOnboardingController.delete),
);

export default router;
