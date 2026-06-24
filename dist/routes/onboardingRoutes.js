"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeOnboardingController_1 = require("@/controllers/employeeOnboardingController");
const onboardingInviteController_1 = require("@/controllers/onboardingInviteController");
const onboardingDocumentTypeController_1 = require("@/controllers/onboardingDocumentTypeController");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const router = express_1.default.Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// GLOBAL MIDDLEWARE
router.use(tenantContext_1.resolveTenant);
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
// ─── Onboarding invites (public-link flow) ───────────────────────────────
// Declared before "/:employeeId" so "invite"/"invites" aren't read as ids.
router.post("/invite", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_CREATE), asyncHandler(onboardingInviteController_1.createInvite));
router.get("/invites", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_READ), asyncHandler(onboardingInviteController_1.listInvites));
router.post("/invite/:inviteId/revoke", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_UPDATE), asyncHandler(onboardingInviteController_1.revokeInvite));
router.put("/invite/:employeeId", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_UPDATE), asyncHandler(onboardingInviteController_1.updateInviteContact));
router.post("/:employeeId/activate", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_UPDATE), asyncHandler(onboardingInviteController_1.activateEmployee));
// ─── Documents-needed catalog (Settings → Documents Needed) ──────────────
router.get("/document-types", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_SETTING_READ), asyncHandler(onboardingDocumentTypeController_1.listDocumentTypes));
router.post("/document-types", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_SETTING_UPDATE), asyncHandler(onboardingDocumentTypeController_1.createDocumentType));
router.put("/document-types/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_SETTING_UPDATE), asyncHandler(onboardingDocumentTypeController_1.updateDocumentType));
router.delete("/document-types/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_SETTING_UPDATE), asyncHandler(onboardingDocumentTypeController_1.deleteDocumentType));
// ROUTES
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_CREATE), asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.create));
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_READ), asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.getAll));
// Must be placed before /:employeeId to prevent 'birthdays' from being treated as an employeeId parameter
router.get("/birthdays", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_READ), asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.getUpcomingBirthdays));
router.get("/:employeeId", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_READ), asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.getById));
router.put("/:employeeId", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_UPDATE), asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.update));
router.delete("/:employeeId", (0, permission_1.requirePermission)(permissions_1.Permissions.ONBOARDING_DELETE), asyncHandler(employeeOnboardingController_1.EmployeeOnboardingController.delete));
exports.default = router;
//# sourceMappingURL=onboardingRoutes.js.map