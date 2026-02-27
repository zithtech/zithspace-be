import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class CalendarController {
    /**
     * GET /api/calendar/:provider/status
     * Returns whether the current user has connected a specific provider.
     */
    static getStatus(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/calendar/:provider/connect
     * Initiates the OAuth flow for a provider.
     */
    static connect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/calendar/:provider/callback
     * Handles the OAuth callback from a provider.
     */
    static callback(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/calendar/:provider/disconnect
     */
    static disconnect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/calendar/events
     * Fetches events from local database (which are synced from providers).
     */
    static getEvents(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/calendar/events
     * Creates a new event on a specific provider.
     */
    static createEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * PUT /api/calendar/events/:id
     */
    static updateEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * DELETE /api/calendar/events/:id
     */
    static deleteEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/calendar/sync
     * Syncs all connected calendars for the current user.
     */
    static syncEvents(req: AuthRequest, res: Response): Promise<void>;
}
