import { Router, Response, NextFunction } from "express";
import { TransactionHistoryController } from "@/controllers/transactionHistoryController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { resolveTenant } from "@/middleware/tenantContext";
import { Permissions } from "@/types/permissions";
import { AuthRequest } from "@/types";
import { RBACService } from "@/modules/rbac/rbac.service";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Picks the right permission based on whether the request scopes to a
 * single entity (drawer view) or asks for the global feed (admin page),
 * and enforces page-wise / resource-level read permissions.
 */
const pickActivityPermission = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
      return;
    }

    const { id: userId, tenantId, role } = req.user;

    // Super admin bypasses all checks
    if (role === 'super_admin') {
      next();
      return;
    }

    const entityType =
      typeof req.query.entityType === "string" ? req.query.entityType.trim() : "";
    const entityId =
      typeof req.query.entityId === "string" ? req.query.entityId.trim() : "";
    const moduleFilter =
      typeof req.query.module === "string" ? req.query.module.trim() : "";
    const sectionFilter =
      typeof req.query.section === "string" ? req.query.section.trim() : "";

    // 1. Check basic activity log permission
    const isScoped = (entityType && entityId) || moduleFilter || sectionFilter;
    const basePermission = isScoped
      ? Permissions.ACTIVITY_LOG_READ
      : Permissions.ACTIVITY_LOG_READ_ALL;

    const allowedBase = await RBACService.hasPermission(userId, tenantId, basePermission, role);
    if (!allowedBase) {
      res.status(403).json({
        success: false,
        error: `Access denied. Missing permission: ${basePermission}`,
        code: 'INSUFFICIENT_PERMISSIONS',
        required: basePermission,
      });
      return;
    }

    // 2. Check page-wise / resource-specific read permission if queried
    const requiredPagePermissions: string[] = [];

    // Map module to read permission
    if (moduleFilter) {
      switch (moduleFilter) {
        case "DailyUpdates":
          requiredPagePermissions.push("daily_update.read");
          break;
        case "TimeTracking":
          requiredPagePermissions.push("time_tracking.read", "time_tracking.team.read");
          break;
        case "OrgStructure":
          requiredPagePermissions.push("org.read");
          break;
        case "Tickets":
          requiredPagePermissions.push("ticket.read");
          break;
        case "BugList":
          requiredPagePermissions.push("bug.read");
          break;
        case "Projects":
          requiredPagePermissions.push("project.read");
          break;
        case "Sprints":
          requiredPagePermissions.push("ticket.plan.read");
          break;
        case "Buckets":
          requiredPagePermissions.push("ticket.bucket.read");
          break;
        case "TicketSettings":
          requiredPagePermissions.push("ticket.setting.read");
          break;
        case "DocumentHub":
          requiredPagePermissions.push("document.read");
          break;
        case "Leads":
          requiredPagePermissions.push("lead.read");
          break;
        case "Proposals":
          requiredPagePermissions.push("proposal.read");
          break;
        case "Squad":
          requiredPagePermissions.push("squad.read");
          break;
        case "Escalations":
          requiredPagePermissions.push("escalation.read");
          break;
        case "Accounts":
          requiredPagePermissions.push("account.read");
          break;
        case "Invoices":
          requiredPagePermissions.push("invoice.read");
          break;
        case "ClientsV2":
          requiredPagePermissions.push("client.read");
          break;
        case "GeneralSettings":
          requiredPagePermissions.push("settings.read");
          break;
        case "Members":
          requiredPagePermissions.push("user.read");
          break;
        case "RoleAndPermissions":
          requiredPagePermissions.push("role.read");
          break;
      }
    }

    // Map entityType to read permission
    if (entityType) {
      switch (entityType) {
        case "daily_update":
          requiredPagePermissions.push("daily_update.read");
          break;
        case "time_entry":
          requiredPagePermissions.push("time_tracking.read", "time_tracking.team.read");
          break;
        case "org_grade":
          requiredPagePermissions.push("org.grade.read");
          break;
        case "org_employment_type":
          requiredPagePermissions.push("org.employment_type.read");
          break;
        case "org_department":
        case "org_sub_department":
          requiredPagePermissions.push("org.department.read");
          break;
        case "org_position":
          requiredPagePermissions.push("org.position.read");
          break;
        case "proposal":
          requiredPagePermissions.push("proposal.read");
          break;
        case "squad":
          requiredPagePermissions.push("squad.read");
          break;
        case "escalation":
          requiredPagePermissions.push("escalation.read");
          break;
        case "invoice":
          requiredPagePermissions.push("invoice.read");
          break;
        case "account_transaction":
          requiredPagePermissions.push("account.read");
          break;
        case "user":
          requiredPagePermissions.push("user.read");
          break;
        case "tenant_settings":
          requiredPagePermissions.push("settings.read");
          break;
        case "client":
          requiredPagePermissions.push("client.read");
          break;
        case "project":
          requiredPagePermissions.push("project.read");
          break;
        case "ticket":
          requiredPagePermissions.push("ticket.read");
          break;
        case "bug":
          requiredPagePermissions.push("bug.read");
          break;
        case "release_plan":
          requiredPagePermissions.push("ticket.plan.read");
          break;
        case "bucket":
          requiredPagePermissions.push("ticket.bucket.read");
          break;
        case "lead":
          requiredPagePermissions.push("lead.read");
          break;
      }
    }

    if (requiredPagePermissions.length > 0) {
      const allowedPage = await RBACService.hasAnyPermission(userId, tenantId, requiredPagePermissions, role);
      if (!allowedPage) {
        res.status(403).json({
          success: false,
          error: `Access denied. Missing page-read permission: ${requiredPagePermissions.join(" or ")}`,
          code: 'INSUFFICIENT_PERMISSIONS',
          required: requiredPagePermissions[0],
        });
        return;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/transaction-history/filters
 *
 * Distinct values present in the log — for building the global page's filter
 * dropdowns. Admin-only.
 */
router.get(
  "/filters",
  requirePermission(Permissions.ACTIVITY_LOG_READ_ALL),
  TransactionHistoryController.filters
);

/**
 * GET /api/transaction-history
 *
 * Query:
 *   entityType + entityId   → drawer (history for one entity)
 *   actorId / section / module / page / action[] / correlationId / search / from / to
 *   cursor, limit (max 100, default 20)
 */
router.get("/", pickActivityPermission, TransactionHistoryController.list);

export default router;
