"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ticketController_1 = require("@/controllers/ticketController");
const router = (0, express_1.Router)();
/**
 * @route   GET /api/public/tickets/:id
 * @desc    Get public ticket details (no auth required)
 * @access  Public
 * @param   id - Ticket ID
 */
router.get('/:id', ticketController_1.TicketController.getPublicTicket);
exports.default = router;
//# sourceMappingURL=publicTickets.js.map