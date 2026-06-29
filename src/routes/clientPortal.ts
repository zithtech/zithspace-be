import { Router } from "express";
import rateLimit from "express-rate-limit";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateClientPortal } from "@/middleware/clientPortalAuth";
import { requirePortalModule } from "@/middleware/portalModuleGate";
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
  requirePortalModule("invoices"),
  ClientPortalInvoiceController.list,
);

router.get(
  "/invoices/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("invoices"),
  ClientPortalInvoiceController.detail,
);

router.post(
  "/invoices/:id/payment-proofs",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("invoices"),
  ClientPortalInvoiceController.uploadPaymentProof,
);

router.post(
  "/invoices/:id/client-status",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("invoices"),
  ClientPortalInvoiceController.updateClientStatus,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Documents (read-only + view/download tracking)
 * -------------------------------------------------------------------- */

router.get(
  "/documents",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("documents"),
  ClientPortalDocumentController.list,
);

router.get(
  "/documents/:id/download",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("documents"),
  ClientPortalDocumentController.download,
);

router.post(
  "/documents",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("documents"),
  ClientPortalDocumentController.create,
);

router.post(
  "/documents/:id/track",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("documents"),
  ClientPortalDocumentController.track,
);

router.patch(
  "/documents/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("documents"),
  ClientPortalDocumentController.update,
);

router.delete(
  "/documents/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("documents"),
  ClientPortalDocumentController.remove,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Sprints (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/sprints",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("sprints"),
  ClientPortalSprintController.list,
);

router.get(
  "/sprints/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("sprints"),
  ClientPortalSprintController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Support tickets (read + write)
 * -------------------------------------------------------------------- */

router.get(
  "/tickets",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("tickets"),
  ClientPortalTicketController.list,
);

router.get(
  "/tickets/options/projects",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("tickets"),
  ClientPortalTicketController.projectOptions,
);

router.post(
  "/tickets",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("tickets"),
  ClientPortalTicketController.create,
);

router.get(
  "/tickets/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("tickets"),
  ClientPortalTicketController.detail,
);

router.post(
  "/tickets/:id/messages",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("tickets"),
  ClientPortalTicketController.reply,
);

/* ----------------------------------------------------------------------
 * Phase 2 — Release notes (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/releases",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("releases"),
  ClientPortalReleaseController.list,
);

router.get(
  "/releases/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("releases"),
  ClientPortalReleaseController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Minutes of Meeting (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/moms",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("mom"),
  ClientPortalMomController.list,
);

router.get(
  "/moms/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("mom"),
  ClientPortalMomController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Change Requests (read + write + approve/reject)
 * -------------------------------------------------------------------- */

router.get(
  "/change-requests",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("change-requests"),
  ClientPortalCrController.list,
);

router.get(
  "/change-requests/options/projects",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("change-requests"),
  ClientPortalCrController.projectOptions,
);

router.post(
  "/change-requests",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("change-requests"),
  ClientPortalCrController.create,
);

router.get(
  "/change-requests/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("change-requests"),
  ClientPortalCrController.detail,
);

router.post(
  "/change-requests/:id/messages",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("change-requests"),
  ClientPortalCrController.reply,
);

router.post(
  "/change-requests/:id/decision",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("change-requests"),
  ClientPortalCrController.decide,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Approvals (read + decide)
 * -------------------------------------------------------------------- */

router.get(
  "/approvals",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("approvals"),
  ClientPortalApprovalsController.list,
);

router.get(
  "/approvals/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("approvals"),
  ClientPortalApprovalsController.detail,
);

router.post(
  "/approvals/:id/decision",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("approvals"),
  ClientPortalApprovalsController.decide,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Environments / Deployments (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/environments",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("environments"),
  ClientPortalEnvironmentsController.list,
);

router.get(
  "/environments/:id",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("environments"),
  ClientPortalEnvironmentsController.detail,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Team / Resource visibility (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/team",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("team"),
  ClientPortalTeamController.list,
);

/* ----------------------------------------------------------------------
 * Phase 3 — Milestones / Delivery Tracker (read-only)
 * -------------------------------------------------------------------- */

router.get(
  "/milestones",
  resolveTenant,
  authenticateClientPortal,
  requirePortalModule("milestones"),
  ClientPortalMilestoneController.list,
);

export default router;
