import { Router } from "express";
import rateLimit from "express-rate-limit";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateClientPortal } from "@/middleware/clientPortalAuth";
import ClientPortalAuthController from "@/controllers/clientPortalAuthController";
import ClientPortalInvoiceController from "@/controllers/clientPortalInvoiceController";
import ClientPortalDocumentController from "@/controllers/clientPortalDocumentController";
import ClientPortalSprintController from "@/controllers/clientPortalSprintController";
import ClientPortalTicketController from "@/controllers/clientPortalTicketController";
import ClientPortalReleaseController from "@/controllers/clientPortalReleaseController";
import ClientPortalMomController from "@/controllers/clientPortalMomController";
import ClientPortalCrController from "@/controllers/clientPortalCrController";
import ClientPortalApprovalsController from "@/controllers/clientPortalApprovalsController";
import ClientPortalEnvironmentsController from "@/controllers/clientPortalEnvironmentsController";
import ClientPortalTeamController from "@/controllers/clientPortalTeamController";
import ClientPortalMilestoneController from "@/controllers/clientPortalMilestoneController";

const router = Router();

const portalLoginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: "Too many login attempts, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  "/auth/login",
  portalLoginLimit,
  resolveTenant,
  ClientPortalAuthController.login,
);

router.post(
  "/auth/logout",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalAuthController.logout,
);

router.get(
  "/auth/me",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalAuthController.me,
);

router.post(
  "/auth/change-password",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalAuthController.changePassword,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Invoices (read-only + payment-proof upload)
 * -------------------------------------------------------------------- */

router.get(
  "/invoices",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalInvoiceController.list,
);

router.get(
  "/invoices/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalInvoiceController.detail,
);

router.post(
  "/invoices/:id/payment-proofs",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalInvoiceController.uploadPaymentProof,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Documents (read-only + view/download tracking)
 * -------------------------------------------------------------------- */

router.get(
  "/documents",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalDocumentController.list,
);

router.post(
  "/documents",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalDocumentController.create,
);

router.post(
  "/documents/:id/track",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalDocumentController.track,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Sprints (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/sprints",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalSprintController.list,
);

router.get(
  "/sprints/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalSprintController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Support tickets (read + write)
 * -------------------------------------------------------------------- */

router.get(
  "/tickets",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalTicketController.list,
);

router.get(
  "/tickets/options/projects",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalTicketController.projectOptions,
);

router.post(
  "/tickets",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalTicketController.create,
);

router.get(
  "/tickets/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalTicketController.detail,
);

router.post(
  "/tickets/:id/messages",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalTicketController.reply,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Release notes (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/releases",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalReleaseController.list,
);

router.get(
  "/releases/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalReleaseController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Minutes of Meeting (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/moms",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalMomController.list,
);

router.get(
  "/moms/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalMomController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Change Requests (read + write + approve/reject)
 * -------------------------------------------------------------------- */

router.get(
  "/change-requests",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalCrController.list,
);

router.get(
  "/change-requests/options/projects",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalCrController.projectOptions,
);

router.post(
  "/change-requests",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalCrController.create,
);

router.get(
  "/change-requests/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalCrController.detail,
);

router.post(
  "/change-requests/:id/messages",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalCrController.reply,
);

router.post(
  "/change-requests/:id/decision",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalCrController.decide,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Approvals (read + decide)
 * -------------------------------------------------------------------- */

router.get(
  "/approvals",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalApprovalsController.list,
);

router.get(
  "/approvals/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalApprovalsController.detail,
);

router.post(
  "/approvals/:id/decision",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalApprovalsController.decide,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Environments / Deployments (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/environments",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalEnvironmentsController.list,
);

router.get(
  "/environments/:id",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalEnvironmentsController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Team / Resource visibility (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/team",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalTeamController.list,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Milestones / Delivery Tracker (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/milestones",
  resolveTenant,
  authenticateClientPortal,
  ClientPortalMilestoneController.list,
);

export default router;
