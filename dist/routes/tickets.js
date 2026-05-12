"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ticketController_1 = require("@/controllers/ticketController");
const ticketCodeController_1 = require("@/controllers/ticketCodeController");
const auth_1 = require("@/middleware/auth");
const permission_1 = require("@/middleware/permission");
const permissions_1 = require("@/types/permissions");
const tenantContext_1 = require("@/middleware/tenantContext");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/tickets/dashboard/stats
 * @desc    Get dashboard statistics (tenant-aware)
 * @access  Private (authenticated users within tenant)
 */
router.get("/dashboard/stats", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getDashboardStats);
/**
 * @route   GET /api/tickets/kanban
 * @desc    Get tickets optimized for Kanban view (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, assigneeId, priority, search, limitPerColumn
 */
router.get("/kanban", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getKanbanTickets);
/**
 * @route   GET /api/tickets
 * @desc    Get all tickets with filtering, sorting, and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority, projectId, assigneeId, createdById, search, sortBy, sortOrder, startDate, endDate
 */
router.get("/", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getTickets);
/**
 * @route   GET /api/tickets/my
 * @desc    Get tickets assigned to current user (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority
 */
router.get("/my", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getMyTickets);
/**
 * @route   GET /api/tickets/epics
 * @desc    Get all Epic tickets with progress (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, status
 */
router.get("/epics", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getEpics);
/**
 * @route   GET /api/tickets/tags
 * @desc    Get distinct tags used across all tickets in the tenant
 * @access  Private (authenticated users within tenant)
 */
router.get("/tags", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getAllTags);
/**
 * @route   GET /api/tickets/:id/epic-progress
 * @desc    Get Epic with detailed story progress (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Epic ticket ID
 */
router.get("/:id/epic-progress", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getEpicProgress);
/**
 * @route   GET /api/tickets/:id/sub-tasks
 * @desc    Get sub-tasks for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Parent ticket ID
 */
router.get("/:id/sub-tasks", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getSubTasks);
/**
 * @route   GET /api/tickets/:id/comments
 * @desc    Get comments for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/comments", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getComments);
/**
 * @route   GET /api/tickets/:id/workflow
 * @desc    Get workflow steps for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/workflow", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getWorkflowSteps);
/**
 * @route   GET /api/tickets/:id/activity
 * @desc    Get activity log for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/activity", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getActivityLog);
/**
 * @route   GET /api/tickets/:id
 * @desc    Get ticket by ID with full details (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getTicketById);
// Code Integration Routes
/**
 * @route   GET /api/tickets/:id/code
 * @desc    Get all code metadata (branches, PRs)
 */
router.get("/:id/code", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketCodeController_1.TicketCodeController.getTicketCodeMetadata);
/**
 * @route   POST /api/tickets/:id/code/branches
 * @desc    Link a branch
 */
router.post("/:id/code/branches", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketCodeController_1.TicketCodeController.addBranch);
/**
 * @route   DELETE /api/tickets/:id/code/branches/:branchId
 * @desc    Unlink a branch
 */
router.delete("/:id/code/branches/:branchId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketCodeController_1.TicketCodeController.removeBranch);
/**
 * @route   POST /api/tickets/:id/code/pull-requests
 * @desc    Link a PR
 */
router.post("/:id/code/pull-requests", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketCodeController_1.TicketCodeController.addPullRequest);
/**
 * @route   DELETE /api/tickets/:id/code/pull-requests/:prId
 * @desc    Unlink a PR
 */
router.delete("/:id/code/pull-requests/:prId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketCodeController_1.TicketCodeController.removePullRequest);
/**
 * @route   POST /api/tickets/upload-image
 * @desc    Upload image to R2 for ticket description (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { image: string (base64), ticketId?: string }
 */
router.post("/upload-image", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_CREATE), ticketController_1.TicketController.uploadImage);
/**
 * @route   POST /api/tickets/ai-generate
 * @desc    Generate a structured ticket draft from a free-form description (no persistence)
 * @access  Private (authenticated users within tenant)
 * @body    { description: string, title?: string }
 */
router.post("/ai-generate", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_CREATE), ticketController_1.TicketController.aiGenerateTicket);
/**
 * @route   POST /api/tickets/ai-generate-subtasks
 * @desc    Regenerate the subtask list for a Zai-drafted ticket with caller-specified shape (count + hoursEach)
 * @access  Private (authenticated users within tenant)
 * @body    { description: string, count?: number, hoursEach?: number }
 */
router.post("/ai-generate-subtasks", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_CREATE), ticketController_1.TicketController.aiGenerateSubtasks);
/**
 * @route   POST /api/tickets
 * @desc    Create a new ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateTicketData
 */
router.post("/", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_CREATE), ticketController_1.TicketController.createTicket);
/**
 * @route   PUT /api/tickets/:id
 * @desc    Update ticket (tenant-aware)
 * @access  Private (ticket creator, assignee, or admin)
 * @param   id - Ticket ID
 * @body    UpdateTicketData
 */
router.put("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.updateTicket);
/**
 * @route   DELETE /api/tickets/:id
 * @desc    Delete ticket (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Ticket ID
 */
router.delete("/:id", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_DELETE), ticketController_1.TicketController.deleteTicket);
/**
 * @route   PATCH /api/tickets/bulk/status
 * @desc    Bulk update ticket status (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[], status: string }
 */
router.patch("/bulk/status", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), ticketController_1.TicketController.bulkUpdateStatus);
router.patch("/bulk/archive", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), ticketController_1.TicketController.bulkArchive);
router.patch("/bulk/unarchive", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), ticketController_1.TicketController.bulkUnarchive);
router.patch("/bulk/delete", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_MANAGE), ticketController_1.TicketController.bulkDelete);
/**
 * @route   GET /api/tickets/projects/:projectId/stats
 * @desc    Get ticket statistics by project (tenant-aware)
 * @access  Private (project members only)
 * @param   projectId - Project ID
 */
router.get("/projects/:projectId/stats", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getTicketStatsByProject);
/**
 * @route   PUT /api/tickets/:id/workflow
 * @desc    Update workflow step (tenant-aware)
 * @access  Private (ticket assignee or admin)
 * @param   id - Ticket ID
 * @body    { stepName: string, updates: any }
 */
router.put("/:id/workflow", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.updateWorkflowStep);
/**
 * @route   POST /api/tickets/:id/comments
 * @desc    Add comment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { comment: string, attachments?: any[] }
 */
router.post("/:id/comments", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.addComment);
/**
 * @route   PUT /api/tickets/:ticketId/comments/:commentId
 * @desc    Update comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 * @body    { comment: string }
 */
router.put("/:ticketId/comments/:commentId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.updateComment);
/**
 * @route   DELETE /api/tickets/:ticketId/comments/:commentId
 * @desc    Delete comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 */
router.delete("/:ticketId/comments/:commentId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.deleteComment);
/**
 * @route   GET /api/tickets/:id/links
 * @desc    Get related links for ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/links", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getRelatedLinks);
/**
 * @route   POST /api/tickets/:id/links
 * @desc    Add related link to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { type, description, url }
 */
router.post("/:id/links", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.addRelatedLink);
/**
 * @route   PUT /api/tickets/:ticketId/links/:linkId
 * @desc    Update related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 * @body    { description, url }
 */
router.put("/:ticketId/links/:linkId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.updateRelatedLink);
/**
 * @route   DELETE /api/tickets/:ticketId/links/:linkId
 * @desc    Delete related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 */
router.delete("/:ticketId/links/:linkId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.deleteRelatedLink);
/**
 * @route   POST /api/tickets/:id/attachments
 * @desc    Upload attachment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { file: string (base64), fileName: string }
 */
router.post("/:id/attachments", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.uploadAttachment);
/**
 * @route   GET /api/tickets/:id/attachments
 * @desc    Get attachments for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get("/:id/attachments", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_READ), ticketController_1.TicketController.getAttachments);
/**
 * @route   DELETE /api/tickets/:ticketId/attachments/:attachmentId
 * @desc    Delete attachment (tenant-aware)
 * @access  Private (attachment uploader or admin)
 * @param   ticketId - Ticket ID
 * @param   attachmentId - Attachment ID
 */
router.delete("/:ticketId/attachments/:attachmentId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.deleteAttachment);
/**
 * @route   PUT /api/tickets/:ticketId/attachments/:attachmentId
 * @desc    Rename attachment (tenant-aware)
 * @access  Private (attachment uploader or admin)
 * @param   ticketId - Ticket ID
 * @param   attachmentId - Attachment ID
 * @body    { newFileName: string }
 */
router.put("/:ticketId/attachments/:attachmentId", (0, permission_1.requirePermission)(permissions_1.Permissions.TICKET_UPDATE), ticketController_1.TicketController.renameAttachment);
exports.default = router;
//# sourceMappingURL=tickets.js.map