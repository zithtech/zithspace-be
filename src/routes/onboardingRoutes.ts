import express from "express";
import { EmployeeOnboardingController } from "@/controllers/employeeOnboardingController";
import { getOrgHistory } from "@/controllers/employeeOrgHistoryController";
import {
  createInvite,
  listInvites,
  revokeInvite,
  regenerateInvite,
  activateEmployee,
  updateInviteContact,
} from "@/controllers/onboardingInviteController";
import {
  listDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
} from "@/controllers/onboardingDocumentTypeController";
import {
  listEmployeeDocuments,
  listMyDocuments,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
} from "@/controllers/employeeDocumentController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";
import { requireSubscriptionFeature } from "@/modules/entitlements/entitlements.middleware";
import multer from "multer";

const upload = multer({ dest: "uploads/" });

const router = express.Router();

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GLOBAL MIDDLEWARE
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── Onboarding invites (public-link flow) ───────────────────────────────
// Declared before "/:employeeId" so "invite"/"invites" aren't read as ids.
router.post("/invite", requirePermission(Permissions.ONBOARDING_CREATE), requireSubscriptionFeature("hrms_onboarding_invites", { exact: false }), asyncHandler(createInvite));
router.get("/invites", requirePermission(Permissions.ONBOARDING_READ), requireSubscriptionFeature("hrms_onboarding_invites", { exact: false }), asyncHandler(listInvites));
router.post("/invite/:inviteId/revoke", requirePermission(Permissions.ONBOARDING_UPDATE), requireSubscriptionFeature("hrms_onboarding_invites", { exact: false }), asyncHandler(revokeInvite));
router.post("/invite/:inviteId/regenerate", requirePermission(Permissions.ONBOARDING_UPDATE), requireSubscriptionFeature("hrms_onboarding_invites", { exact: false }), asyncHandler(regenerateInvite));
router.put("/invite/:employeeId", requirePermission(Permissions.ONBOARDING_UPDATE), requireSubscriptionFeature("hrms_onboarding_invites", { exact: false }), asyncHandler(updateInviteContact));
router.post("/:employeeId/activate", requirePermission(Permissions.ONBOARDING_UPDATE), requireSubscriptionFeature("hrms_onboarding_invites", { exact: false }), asyncHandler(activateEmployee));

// ─── Documents-needed catalog (Settings → Documents Needed) ──────────────
router.get("/document-types", requirePermission(Permissions.ONBOARDING_SETTING_READ), requireSubscriptionFeature("hrms_onboarding_settings", { exact: false }), asyncHandler(listDocumentTypes));
router.post("/document-types", requirePermission(Permissions.ONBOARDING_SETTING_UPDATE), requireSubscriptionFeature("hrms_onboarding_settings", { exact: false }), asyncHandler(createDocumentType));
router.put("/document-types/:id", requirePermission(Permissions.ONBOARDING_SETTING_UPDATE), requireSubscriptionFeature("hrms_onboarding_settings", { exact: false }), asyncHandler(updateDocumentType));
router.delete("/document-types/:id", requirePermission(Permissions.ONBOARDING_SETTING_UPDATE), requireSubscriptionFeature("hrms_onboarding_settings", { exact: false }), asyncHandler(deleteDocumentType));

// ─── Employee HR Documents ────────────────────────────────────────────────
router.get("/my-documents", requirePermission(Permissions.MY_HUB_DOCUMENTS_READ), asyncHandler(listMyDocuments));
router.get("/employee-documents", requirePermission(Permissions.ONBOARDING_READ), requireSubscriptionFeature("hrms_onboarding_documents", { exact: false }), asyncHandler(listEmployeeDocuments));
router.post(
  "/employee-documents",
  upload.single("file"),
  requirePermission(Permissions.ONBOARDING_UPDATE),
  requireSubscriptionFeature("hrms_onboarding_documents", { exact: false }),
  asyncHandler(uploadEmployeeDocument),
);
router.delete("/employee-documents/:id", requirePermission(Permissions.ONBOARDING_UPDATE), requireSubscriptionFeature("hrms_onboarding_documents", { exact: false }), asyncHandler(deleteEmployeeDocument));

// ROUTES
router.post("/", requirePermission(Permissions.ONBOARDING_CREATE), requireSubscriptionFeature("hrms_onboarding_create", { exact: false }), asyncHandler(EmployeeOnboardingController.create));
router.get("/", requirePermission(Permissions.ONBOARDING_READ), requireSubscriptionFeature("hrms_onboarding_employees", { exact: false }), asyncHandler(EmployeeOnboardingController.getAll));
// Must be placed before /:employeeId to prevent 'birthdays' from being treated as an employeeId parameter
router.get("/birthdays", requirePermission(Permissions.ONBOARDING_READ), requireSubscriptionFeature("hrms_onboarding_employees", { exact: false }), asyncHandler(EmployeeOnboardingController.getUpcomingBirthdays));
router.get("/:employeeId", requirePermission(Permissions.ONBOARDING_READ), requireSubscriptionFeature("hrms_onboarding_employees", { exact: false }), asyncHandler(EmployeeOnboardingController.getById));
router.get("/:employeeId/org-history", requirePermission(Permissions.ONBOARDING_READ), requireSubscriptionFeature("hrms_onboarding_employees", { exact: false }), asyncHandler(getOrgHistory));
router.put("/:employeeId", requirePermission(Permissions.ONBOARDING_UPDATE), requireSubscriptionFeature("hrms_onboarding_employees", { exact: false }), asyncHandler(EmployeeOnboardingController.update));
router.post("/:employeeId/promote", requirePermission(Permissions.ONBOARDING_UPDATE), requireSubscriptionFeature("hrms_onboarding_employees", { exact: false }), asyncHandler(EmployeeOnboardingController.promote));
router.delete(
  "/:employeeId",
  requirePermission(Permissions.ONBOARDING_DELETE),
  requireSubscriptionFeature("hrms_onboarding_employees", { exact: false }),
  asyncHandler(EmployeeOnboardingController.delete),
);

export default router;
