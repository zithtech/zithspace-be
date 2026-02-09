import { Router } from 'express';
import { TicketController } from '@/controllers/ticketController';

const router = Router();

/**
 * @route   GET /api/public/tickets/:id
 * @desc    Get public ticket details (no auth required)
 * @access  Public
 * @param   id - Ticket ID
 */
router.get('/:id', TicketController.getPublicTicket);

export default router;
