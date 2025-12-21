"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ticketController_1 = require("@/controllers/ticketController");
const auth_1 = require("@/middleware/auth");
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
router.get('/dashboard/stats', ticketController_1.TicketController.getDashboardStats);
/**
 * @route   GET /api/tickets/kanban
 * @desc    Get tickets optimized for Kanban view (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   projectId, assigneeId, priority, search, limitPerColumn
 */
router.get('/kanban', ticketController_1.TicketController.getKanbanTickets);
/**
 * @route   GET /api/tickets
 * @desc    Get all tickets with filtering, sorting, and pagination (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority, projectId, assigneeId, createdById, search, sortBy, sortOrder, startDate, endDate
 */
router.get('/', ticketController_1.TicketController.getTickets);
/**
 * @route   GET /api/tickets/my
 * @desc    Get tickets assigned to current user (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @query   page, limit, status, priority
 */
router.get('/my', ticketController_1.TicketController.getMyTickets);
/**
 * @route   GET /api/tickets/:id
 * @desc    Get ticket by ID with full details (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get('/:id', ticketController_1.TicketController.getTicketById);
/**
 * @route   POST /api/tickets/upload-image
 * @desc    Upload image to R2 for ticket description (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { image: string (base64), ticketId?: string }
 */
router.post('/upload-image', ticketController_1.TicketController.uploadImage);
/**
 * @route   POST /api/tickets
 * @desc    Create a new ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    CreateTicketData
 */
router.post('/', ticketController_1.TicketController.createTicket);
/**
 * @route   PUT /api/tickets/:id
 * @desc    Update ticket (tenant-aware)
 * @access  Private (ticket creator, assignee, or admin)
 * @param   id - Ticket ID
 * @body    UpdateTicketData
 */
router.put('/:id', ticketController_1.TicketController.updateTicket);
/**
 * @route   DELETE /api/tickets/:id
 * @desc    Delete ticket (tenant-aware)
 * @access  Private (admin only)
 * @param   id - Ticket ID
 */
router.delete('/:id', auth_1.requireAdmin, ticketController_1.TicketController.deleteTicket);
/**
 * @route   PATCH /api/tickets/bulk/status
 * @desc    Bulk update ticket status (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @body    { ticketIds: string[], status: string }
 */
router.patch('/bulk/status', ticketController_1.TicketController.bulkUpdateStatus);
/**
 * @route   GET /api/tickets/projects/:projectId/stats
 * @desc    Get ticket statistics by project (tenant-aware)
 * @access  Private (project members only)
 * @param   projectId - Project ID
 */
router.get('/projects/:projectId/stats', ticketController_1.TicketController.getTicketStatsByProject);
/**
 * @route   PUT /api/tickets/:id/workflow
 * @desc    Update workflow step (tenant-aware)
 * @access  Private (ticket assignee or admin)
 * @param   id - Ticket ID
 * @body    { stepName: string, updates: any }
 */
router.put('/:id/workflow', ticketController_1.TicketController.updateWorkflowStep);
/**
 * @route   POST /api/tickets/:id/comments
 * @desc    Add comment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { comment: string, attachments?: any[] }
 */
router.post('/:id/comments', ticketController_1.TicketController.addComment);
/**
 * @route   PUT /api/tickets/:ticketId/comments/:commentId
 * @desc    Update comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 * @body    { comment: string }
 */
router.put('/:ticketId/comments/:commentId', ticketController_1.TicketController.updateComment);
/**
 * @route   DELETE /api/tickets/:ticketId/comments/:commentId
 * @desc    Delete comment (tenant-aware)
 * @access  Private (comment owner only)
 * @param   ticketId - Ticket ID
 * @param   commentId - Comment ID
 */
router.delete('/:ticketId/comments/:commentId', ticketController_1.TicketController.deleteComment);
/**
 * @route   GET /api/tickets/:id/links
 * @desc    Get related links for ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get('/:id/links', ticketController_1.TicketController.getRelatedLinks);
/**
 * @route   POST /api/tickets/:id/links
 * @desc    Add related link to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { type, description, url }
 */
router.post('/:id/links', ticketController_1.TicketController.addRelatedLink);
/**
 * @route   PUT /api/tickets/:ticketId/links/:linkId
 * @desc    Update related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 * @body    { description, url }
 */
router.put('/:ticketId/links/:linkId', ticketController_1.TicketController.updateRelatedLink);
/**
 * @route   DELETE /api/tickets/:ticketId/links/:linkId
 * @desc    Delete related link (tenant-aware)
 * @access  Private (link creator or admin)
 * @param   ticketId - Ticket ID
 * @param   linkId - Link ID
 */
router.delete('/:ticketId/links/:linkId', ticketController_1.TicketController.deleteRelatedLink);
/**
 * @route   POST /api/tickets/:id/attachments
 * @desc    Upload attachment to ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 * @body    { file: string (base64), fileName: string }
 */
router.post('/:id/attachments', ticketController_1.TicketController.uploadAttachment);
/**
 * @route   GET /api/tickets/:id/attachments
 * @desc    Get attachments for a ticket (tenant-aware)
 * @access  Private (authenticated users within tenant)
 * @param   id - Ticket ID
 */
router.get('/:id/attachments', ticketController_1.TicketController.getAttachments);
/**
 * @route   DELETE /api/tickets/:ticketId/attachments/:attachmentId
 * @desc    Delete attachment (tenant-aware)
 * @access  Private (attachment uploader or admin)
 * @param   ticketId - Ticket ID
 * @param   attachmentId - Attachment ID
 */
router.delete('/:ticketId/attachments/:attachmentId', ticketController_1.TicketController.deleteAttachment);
exports.default = router;
//# sourceMappingURL=tickets.js.map