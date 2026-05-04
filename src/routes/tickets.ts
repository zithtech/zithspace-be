import { Router } from "express";
import { TicketController } from "@/controllers/ticketController";
import { TicketCodeController } from "@/controllers/ticketCodeController";
import {
  authenticateToken,
  requireAuth,
} from "@/middleware/auth";
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);
router.use(requireAuth);

/**
 * @route   GET /api/tickets/dashboard/stats
 * @desc    Get dashboard statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get("/dashboard/stats", requirePermission(Permissions.TICKET_READ), TicketController.getDashboardStats);

/**
 * @route   GET /api/tickets/kanban
 * @desc    Get tickets optimized for Kanban view (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, assigneeId, priority, search, limitPerColumn
 */
router.get("/kanban", requirePermission(Permissions.TICKET_READ), TicketController.getKanbanTickets);

/**
 * @route   GET /api/tickets
 * @desc    Get all tickets with filtering, sorting, and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority, projectId, assigneeId, createdById, search, sortBy, sortOrder, startDate, endDate
 */
router.get("/", requirePermission(Permissions.TICKET_READ), TicketController.getTickets);

/**
 * @route   GET /api/tickets/my
 * @desc    Get tickets assigned to current user (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority
 */
router.get("/my", requirePermission(Permissions.TICKET_READ), TicketController.getMyTickets);

/**
 * @route   GET /api/tickets/epics
 * @desc    Get all Epic tickets with progress (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, status
 */
router.get("/epics", requirePermission(Permissions.TICKET_READ), TicketController.getEpics);

/**
 * @route   GET /api/tickets/tags
 * @desc    Get distinct tags used across all tickets in the tenant
 * @access  Private (authenticated users within tenant)
 */
router.get("/tags", requirePermission(Permissions.TICKET_READ), TicketController.getAllTags);

/**
 * @route   GET /api/tickets/:id/epic-progress
 * @desc    Get Epic with detailed story progress (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Epic ticket ID
 */
router.get("/:id/epic-progress", requirePermission(Permissions.TICKET_READ), TicketController.getEpicProgress);

/**
 * @route   GET /api/tickets/:id/sub-tasks
 * @desc    Get sub-tasks for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Parent ticket ID
 */
router.get("/:id/sub-tasks", requirePermission(Permissions.TICKET_READ), TicketController.getSubTasks);

/**
 * @route   GET /api/tickets/:id/comments
 * @desc    Get comments for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/comments", requirePermission(Permissions.TICKET_READ), TicketController.getComments);

/**
 * @route   GET /api/tickets/:id/workflow
 * @desc    Get workflow steps for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/workflow", requirePermission(Permissions.TICKET_READ), TicketController.getWorkflowSteps);

/**
 * @route   GET /api/tickets/:id/activity
 * @desc    Get activity log for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/activity", requirePermission(Permissions.TICKET_READ), TicketController.getActivityLog);

/**
 * @route   GET /api/tickets/:id
 * @desc    Get ticket by ID with full details (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id", requirePermission(Permissions.TICKET_READ), TicketController.getTicketById);

// Code Integration Routes

/**
 * @route   GET /api/tickets/:id/code
 * @desc    Get all code metadata (branches, PRs)
 */
router.get("/:id/code", requirePermission(Permissions.TICKET_READ), TicketCodeController.getTicketCodeMetadata);

/**
 * @route   POST /api/tickets/:id/code/branches
 * @desc    Link a branch
 */
router.post("/:id/code/branches", requirePermission(Permissions.TICKET_UPDATE), TicketCodeController.addBranch);

/**
 * @route   DELETE /api/tickets/:id/code/branches/:branchId
 * @desc    Unlink a branch
 */
router.delete(
  "/:id/code/branches/:branchId",
  requirePermission(Permissions.TICKET_UPDATE),
  TicketCodeController.removeBranch,
);

/**
 * @route   POST /api/tickets/:id/code/pull-requests
 * @desc    Link a PR
 */
router.post("/:id/code/pull-requests", requirePermission(Permissions.TICKET_UPDATE), TicketCodeController.addPullRequest);

/**
 * @route   DELETE /api/tickets/:id/code/pull-requests/:prId
 * @desc    Unlink a PR
 */
router.delete(
  "/:id/code/pull-requests/:prId",
  requirePermission(Permissions.TICKET_UPDATE),
  TicketCodeController.removePullRequest,
);

/**
 * @route   POST /api/tickets/upload-image
 * @desc    Upload image to R2 for ticket description (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { image: string (base64), ticketId?: string }
 */
router.post("/upload-image", requirePermission(Permissions.TICKET_CREATE), TicketController.uploadImage);

/**
 * @route   POST /api/tickets/ai-generate
 * @desc    Generate a structured ticket draft from a free-form description (no persistence)
 * @access  Private (authenticated users within tenant)
 * @body    { description: string, title?: string }
 */
router.post("/ai-generate", requirePermission(Permissions.TICKET_CREATE), TicketController.aiGenerateTicket);

/**
 * @route   POST /api/tickets/ai-generate-subtasks
 * @desc    Regenerate the subtask list for a Zai-drafted ticket with caller-specified shape (count + hoursEach)
 * @access  Private (authenticated users within tenant)
 * @body    { description: string, count?: number, hoursEach?: number }
 */
router.post("/ai-generate-subtasks", requirePermission(Permissions.TICKET_CREATE), TicketController.aiGenerateSubtasks);

/**
 * @route   POST /api/tickets
 * @desc    Create a new ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateTicketData
 */
router.post("/", requirePermission(Permissions.TICKET_CREATE), TicketController.createTicket);

/**
 * @route   PUT /api/tickets/:id
 * @desc    Update ticket (tenant-aware)
 * @access  Private (ticket creator, assignee, or admin)
 * @param   id - Ticket ID
 * @body    UpdateTicketData
 */
router.put("/:id", requirePermission(Permissions.TICKET_UPDATE), TicketController.updateTicket);

/**
 * @route   DELETE /api/tickets/:id
 * @desc    Delete ticket (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Ticket ID
 */
router.delete("/:id", requirePermission(Permissions.TICKET_DELETE), TicketController.deleteTicket);

/**
 * @route   PATCH /api/tickets/bulk/status
 * @desc    Bulk update ticket status (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[], status: string }
 */
router.patch("/bulk/status", requirePermission(Permissions.TICKET_MANAGE), TicketController.bulkUpdateStatus);

/**
 * @route   GET /api/tickets/projects/:projectId/stats
 * @desc    Get ticket statistics by project (tenant-aware)
 * @access  Private (project members only)
 * @param   projectId - Project ID
 */
router.get(
  "/projects/:projectId/stats",
  requirePermission(Permissions.TICKET_READ),
  TicketController.getTicketStatsByProject,
);

/**
 * @route   PUT /api/tickets/:id/workflow
 * @desc    Update workflow step (tenant-aware)
 * @access  Private (ticket assignee or admin)
 * @param   id - Ticket ID
 * @body    { stepName: string, updates: any }
 */
router.put("/:id/workflow", requirePermission(Permissions.TICKET_UPDATE), TicketController.updateWorkflowStep);

/**
 * @route   POST /api/tickets/:id/comments
 * @desc    Add comment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { comment: string, attachments?: any[] }
 */
router.post("/:id/comments", requirePermission(Permissions.TICKET_UPDATE), TicketController.addComment);

/**
 * @route   PUT /api/tickets/:ticketId/comments/:commentId
 * @desc    Update comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 * @body    { comment: string }
 */
router.put("/:ticketId/comments/:commentId", requirePermission(Permissions.TICKET_UPDATE), TicketController.updateComment);

/**
 * @route   DELETE /api/tickets/:ticketId/comments/:commentId
 * @desc    Delete comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 */
router.delete("/:ticketId/comments/:commentId", requirePermission(Permissions.TICKET_UPDATE), TicketController.deleteComment);

/**
 * @route   GET /api/tickets/:id/links
 * @desc    Get related links for ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/links", requirePermission(Permissions.TICKET_READ), TicketController.getRelatedLinks);

/**
 * @route   POST /api/tickets/:id/links
 * @desc    Add related link to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { type, description, url }
 */
router.post("/:id/links", requirePermission(Permissions.TICKET_UPDATE), TicketController.addRelatedLink);

/**
 * @route   PUT /api/tickets/:ticketId/links/:linkId
 * @desc    Update related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 * @body    { description, url }
 */
router.put("/:ticketId/links/:linkId", requirePermission(Permissions.TICKET_UPDATE), TicketController.updateRelatedLink);

/**
 * @route   DELETE /api/tickets/:ticketId/links/:linkId
 * @desc    Delete related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 */
router.delete("/:ticketId/links/:linkId", requirePermission(Permissions.TICKET_UPDATE), TicketController.deleteRelatedLink);

/**
 * @route   POST /api/tickets/:id/attachments
 * @desc    Upload attachment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { file: string (base64), fileName: string }
 */
router.post("/:id/attachments", requirePermission(Permissions.TICKET_UPDATE), TicketController.uploadAttachment);

/**
 * @route   GET /api/tickets/:id/attachments
 * @desc    Get attachments for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/attachments", requirePermission(Permissions.TICKET_READ), TicketController.getAttachments);

/**
 * @route   DELETE /api/tickets/:ticketId/attachments/:attachmentId
 * @desc    Delete attachment (tenant-aware)
 * @access  Private (attachment uploader or admin)
 * @param   ticketId - Ticket ID
 * @param   attachmentId - Attachment ID
 */
router.delete(
  "/:ticketId/attachments/:attachmentId",
  requirePermission(Permissions.TICKET_UPDATE),
  TicketController.deleteAttachment,
);

/**
 * @route   PUT /api/tickets/:ticketId/attachments/:attachmentId
 * @desc    Rename attachment (tenant-aware)
 * @access  Private (attachment uploader or admin)
 * @param   ticketId - Ticket ID
 * @param   attachmentId - Attachment ID
 * @body    { newFileName: string }
 */
router.put(
  "/:ticketId/attachments/:attachmentId",
  requirePermission(Permissions.TICKET_UPDATE),
  TicketController.renameAttachment,
);

export default router;
