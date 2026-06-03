import { Router, Response, NextFunction } from "express";
import { TransactionHistoryController } from "@/controllers/transactionHistoryController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { requirePermission } from "@/middleware/permission";
import { resolveTenant } from "@/middleware/tenantContext";
import { Permissions } from "@/types/permissions";
import { AuthRequest } from "@/types";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * Picks the right permission based on whether the request scopes to a
 * single entity (drawer view) or asks for the global feed (admin page).
 */
const pickActivityPermission = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const entityType =
    typeof req.query.entityType === "string" ? req.query.entityType.trim() : "";
  const entityId =
    typeof req.query.entityId === "string" ? req.query.entityId.trim() : "";

  const permission =
    entityType && entityId
      ? Permissions.ACTIVITY_LOG_READ
      : Permissions.ACTIVITY_LOG_READ_ALL;

  void requirePermission(permission)(req, res, next);
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
