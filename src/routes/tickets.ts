import { Router } from "express";
import { TicketController } from "@/controllers/ticketController";
import { TicketCodeController } from "@/controllers/ticketCodeController";
import {
  authenticateToken,
  requireAuth,
  requireAdmin,
} from "@/middleware/auth";
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
router.get("/dashboard/stats", TicketController.getDashboardStats);

/**
 * @route   GET /api/tickets/kanban
 * @desc    Get tickets optimized for Kanban view (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, assigneeId, priority, search, limitPerColumn
 */
router.get("/kanban", TicketController.getKanbanTickets);

/**
 * @route   GET /api/tickets
 * @desc    Get all tickets with filtering, sorting, and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority, projectId, assigneeId, createdById, search, sortBy, sortOrder, startDate, endDate
 */
router.get("/", TicketController.getTickets);

/**
 * @route   GET /api/tickets/my
 * @desc    Get tickets assigned to current user (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority
 */
router.get("/my", TicketController.getMyTickets);

/**
 * @route   GET /api/tickets/epics
 * @desc    Get all Epic tickets with progress (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, status
 */
router.get("/epics", TicketController.getEpics);

/**
 * @route   GET /api/tickets/:id/epic-progress
 * @desc    Get Epic with detailed story progress (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Epic ticket ID
 */
router.get("/:id/epic-progress", TicketController.getEpicProgress);

/**
 * @route   GET /api/tickets/:id/sub-tasks
 * @desc    Get sub-tasks for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Parent ticket ID
 */
router.get("/:id/sub-tasks", TicketController.getSubTasks);

/**
 * @route   GET /api/tickets/:id/comments
 * @desc    Get comments for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/comments", TicketController.getComments);

/**
 * @route   GET /api/tickets/:id/workflow
 * @desc    Get workflow steps for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/workflow", TicketController.getWorkflowSteps);

/**
 * @route   GET /api/tickets/:id/activity
 * @desc    Get activity log for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/activity", TicketController.getActivityLog);

/**
 * @route   GET /api/tickets/:id
 * @desc    Get ticket by ID with full details (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id", TicketController.getTicketById);

// Code Integration Routes

/**
 * @route   GET /api/tickets/:id/code
 * @desc    Get all code metadata (branches, PRs)
 */
router.get("/:id/code", TicketCodeController.getTicketCodeMetadata);

/**
 * @route   POST /api/tickets/:id/code/branches
 * @desc    Link a branch
 */
router.post("/:id/code/branches", TicketCodeController.addBranch);

/**
 * @route   DELETE /api/tickets/:id/code/branches/:branchId
 * @desc    Unlink a branch
 */
router.delete(
  "/:id/code/branches/:branchId",
  TicketCodeController.removeBranch,
);

/**
 * @route   POST /api/tickets/:id/code/pull-requests
 * @desc    Link a PR
 */
router.post("/:id/code/pull-requests", TicketCodeController.addPullRequest);

/**
 * @route   DELETE /api/tickets/:id/code/pull-requests/:prId
 * @desc    Unlink a PR
 */
router.delete(
  "/:id/code/pull-requests/:prId",
  TicketCodeController.removePullRequest,
);

/**
 * @route   POST /api/tickets/upload-image
 * @desc    Upload image to R2 for ticket description (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { image: string (base64), ticketId?: string }
 */
router.post("/upload-image", TicketController.uploadImage);

/**
 * @route   POST /api/tickets
 * @desc    Create a new ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateTicketData
 */
router.post("/", TicketController.createTicket);

/**
 * @route   PUT /api/tickets/:id
 * @desc    Update ticket (tenant-aware)
 * @access  Private (ticket creator, assignee, or admin)
 * @param   id - Ticket ID
 * @body    UpdateTicketData
 */
router.put("/:id", TicketController.updateTicket);

/**
 * @route   DELETE /api/tickets/:id
 * @desc    Delete ticket (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Ticket ID
 */
router.delete("/:id", requireAdmin, TicketController.deleteTicket);

/**
 * @route   PATCH /api/tickets/bulk/status
 * @desc    Bulk update ticket status (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[], status: string }
 */
router.patch("/bulk/status", TicketController.bulkUpdateStatus);

/**
 * @route   GET /api/tickets/projects/:projectId/stats
 * @desc    Get ticket statistics by project (tenant-aware)
 * @access  Private (project members only)
 * @param   projectId - Project ID
 */
router.get(
  "/projects/:projectId/stats",
  TicketController.getTicketStatsByProject,
);

/**
 * @route   PUT /api/tickets/:id/workflow
 * @desc    Update workflow step (tenant-aware)
 * @access  Private (ticket assignee or admin)
 * @param   id - Ticket ID
 * @body    { stepName: string, updates: any }
 */
router.put("/:id/workflow", TicketController.updateWorkflowStep);

/**
 * @route   POST /api/tickets/:id/comments
 * @desc    Add comment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { comment: string, attachments?: any[] }
 */
router.post("/:id/comments", TicketController.addComment);

/**
 * @route   PUT /api/tickets/:ticketId/comments/:commentId
 * @desc    Update comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 * @body    { comment: string }
 */
router.put("/:ticketId/comments/:commentId", TicketController.updateComment);

/**
 * @route   DELETE /api/tickets/:ticketId/comments/:commentId
 * @desc    Delete comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 */
router.delete("/:ticketId/comments/:commentId", TicketController.deleteComment);

/**
 * @route   GET /api/tickets/:id/links
 * @desc    Get related links for ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/links", TicketController.getRelatedLinks);

/**
 * @route   POST /api/tickets/:id/links
 * @desc    Add related link to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { type, description, url }
 */
router.post("/:id/links", TicketController.addRelatedLink);

/**
 * @route   PUT /api/tickets/:ticketId/links/:linkId
 * @desc    Update related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 * @body    { description, url }
 */
router.put("/:ticketId/links/:linkId", TicketController.updateRelatedLink);

/**
 * @route   DELETE /api/tickets/:ticketId/links/:linkId
 * @desc    Delete related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 */
router.delete("/:ticketId/links/:linkId", TicketController.deleteRelatedLink);

/**
 * @route   POST /api/tickets/:id/attachments
 * @desc    Upload attachment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { file: string (base64), fileName: string }
 */
router.post("/:id/attachments", TicketController.uploadAttachment);

/**
 * @route   GET /api/tickets/:id/attachments
 * @desc    Get attachments for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/attachments", TicketController.getAttachments);

/**
 * @route   DELETE /api/tickets/:ticketId/attachments/:attachmentId
 * @desc    Delete attachment (tenant-aware)
 * @access  Private (attachment uploader or admin)
 * @param   ticketId - Ticket ID
 * @param   attachmentId - Attachment ID
 */
router.delete(
  "/:ticketId/attachments/:attachmentId",
  TicketController.deleteAttachment,
);

export default router;
