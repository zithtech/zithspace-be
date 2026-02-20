import { Response } from 'express';
import { AuthRequest as BaseAuthRequest } from '@/types';
import { Session } from 'express-session';
export type AuthRequest = BaseAuthRequest & {
    session: Session & {
        zohoState?: string;
        zohoTokens?: {
            accessToken: string;
            refreshToken: string;
            expiry: Date;
        };
    };
};
export declare class CalendarController {
    /**
     * Connect to Zoho - Redirect user to Zoho login page
     * GET /api/zoho/connect
     */
    /**
     * Connect to Zoho - Redirect user to Zoho login page
     * GET /api/zoho/connect
     */
    static connect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Handle OAuth callback from Zoho
     * GET /api/zoho/callback
     */
    static callback(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Helper: Refresh user token
     */
    private static refreshUserToken;
    /**
     * Helper: Get valid token (automatically refreshes if expired)
     */
    private static getValidToken;
    /**
     * Check Zoho connection status
     * GET /api/zoho/status
     */
    static status(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get all calendars from Zoho
     * GET /api/zoho/calendars
     */
    static getCalendars(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Associate Zoho tokens with logged-in user
     * POST /api/zoho/associate
     */
    static associateTokens(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get events from local database with pagination
     * GET /api/zoho/events
     */
    static getEvents(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get single event by ID
     * GET /api/zoho/events/:id
     */
    static getEventById(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Sync events from Zoho to local database
     * POST /api/zoho/events/sync
     */
    static syncEvents(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create event in Zoho and save to local DB
     * POST /api/zoho/events
     */
    static createEvent(req: any, res: Response): Promise<void>;
    /**
     * Update event in Zoho and local DB
     * PUT /api/zoho/events/:id
     */
    static updateEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete event from Zoho and local DB
     * DELETE /api/zoho/events/:id
     */
    static deleteEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Disconnect Zoho and clear all data
     * POST /api/zoho/disconnect
     */
    static disconnect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get events for dropdown/select (minimal data)
     * GET /api/zoho/events/select
     */
    static getEventsForSelect(req: AuthRequest, res: Response): Promise<void>;
}
export default CalendarController;
