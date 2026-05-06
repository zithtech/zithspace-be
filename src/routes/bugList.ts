import { Router } from "express";
import { BugListController } from "@/controllers/bugListController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── Folders ───────────────────────────────────────────────────────────────
router.get("/folders", requirePermission(Permissions.BUG_READ), BugListController.listFolders);
router.post("/folders", requirePermission(Permissions.BUG_CREATE), BugListController.createFolder);
router.put("/folders/:id", requirePermission(Permissions.BUG_UPDATE), BugListController.updateFolder);
router.delete("/folders/:id", requirePermission(Permissions.BUG_DELETE), BugListController.deleteFolder);

// ─── Sheets ────────────────────────────────────────────────────────────────
router.get("/folders/:folderId/sheets", requirePermission(Permissions.BUG_READ), BugListController.listSheets);
router.get("/sheets/archived", requirePermission(Permissions.BUG_READ), BugListController.listArchivedSheets);
router.post("/folders/:folderId/sheets", requirePermission(Permissions.BUG_CREATE), BugListController.createSheet);
router.put("/sheets/:id", requirePermission(Permissions.BUG_UPDATE), BugListController.updateSheet);
router.patch("/sheets/:id/status", requirePermission(Permissions.BUG_UPDATE), BugListController.updateSheetStatus);
router.delete("/sheets/:id", requirePermission(Permissions.BUG_DELETE), BugListController.deleteSheet);

// ─── Bugs ──────────────────────────────────────────────────────────────────
router.get("/stats", requirePermission(Permissions.BUG_READ), BugListController.getStats);

router.get("/bugs", requirePermission(Permissions.BUG_READ), BugListController.listBugs);
router.post("/bugs", requirePermission(Permissions.BUG_CREATE), BugListController.createBug);

router.post("/bugs/bulk-status", requirePermission(Permissions.BUG_UPDATE), BugListController.bulkUpdateStatus);
router.post("/bugs/bulk-delete", requirePermission(Permissions.BUG_DELETE), BugListController.bulkDelete);
router.post("/bugs/bulk-permanent-delete", requirePermission(Permissions.BUG_DELETE), BugListController.bulkPermanentDelete);
router.post("/bugs/bulk-restore", requirePermission(Permissions.BUG_UPDATE), BugListController.bulkRestore);
router.post("/bugs/bulk-move", requirePermission(Permissions.BUG_UPDATE), BugListController.bulkMove);
router.post("/bugs/bulk-convert", requirePermission(Permissions.BUG_MANAGE), BugListController.bulkConvertToTickets);

router.get("/bugs/:id", requirePermission(Permissions.BUG_READ), BugListController.getBug);
router.put("/bugs/:id", requirePermission(Permissions.BUG_UPDATE), BugListController.updateBug);
router.delete("/bugs/:id", requirePermission(Permissions.BUG_DELETE), BugListController.deleteBug);
router.delete("/bugs/:id/permanent", requirePermission(Permissions.BUG_DELETE), BugListController.permanentDeleteBug);
router.post("/bugs/:id/restore", requirePermission(Permissions.BUG_UPDATE), BugListController.restoreBug);
router.post("/bugs/:id/verify", requirePermission(Permissions.BUG_MANAGE), BugListController.verifyBug);
router.post("/bugs/:id/reopen", requirePermission(Permissions.BUG_MANAGE), BugListController.reopenBug);

// ─── AI ────────────────────────────────────────────────────────────────────
router.post("/ai/review", requirePermission(Permissions.BUG_READ), BugListController.aiReview);
router.post("/ai/group", requirePermission(Permissions.BUG_READ), BugListController.aiSuggestGroups);
router.post("/ai/enhance-text", requirePermission(Permissions.BUG_READ), BugListController.aiEnhanceText);

// ─── Config: Severity options ──────────────────────────────────────────────
router.get("/config/severities", requirePermission(Permissions.BUG_READ), BugListController.listSeverityOptions);
router.post("/config/severities", requirePermission(Permissions.BUG_MANAGE), BugListController.createSeverityOption);
router.put("/config/severities/:id", requirePermission(Permissions.BUG_MANAGE), BugListController.updateSeverityOption);
router.delete("/config/severities/:id", requirePermission(Permissions.BUG_MANAGE), BugListController.deleteSeverityOption);

// ─── Config: Type options ──────────────────────────────────────────────────
router.get("/config/types", requirePermission(Permissions.BUG_READ), BugListController.listTypeOptions);
router.post("/config/types", requirePermission(Permissions.BUG_MANAGE), BugListController.createTypeOption);
router.put("/config/types/:id", requirePermission(Permissions.BUG_MANAGE), BugListController.updateTypeOption);
router.delete("/config/types/:id", requirePermission(Permissions.BUG_MANAGE), BugListController.deleteTypeOption);

export default router;
