import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class CalendarController {
    /**
     * GET /api/zoho/status
     * Returns whether the current user has connected their Zoho account.
     */
    static getStatus(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/zoho/connect
     * Redirects user to Zoho OAuth2 authorization page.
     */
    static connect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/zoho/callback
     * Handles Zoho OAuth2 callback, exchanges code for tokens.
     */
    static callback(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/zoho/disconnect
     * Clears Zoho tokens from the user record.
     */
    static disconnect(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/zoho/events
     * Fetches events from Zoho Calendar and syncs to DB.
     * NOTE: Zoho Calendar API does NOT support range_start/range_end query params
     * on the events list endpoint — they cause EXTRA_PARAM_FOUND.
     * We fetch all events from Zoho, upsert to DB, then filter by date in DB.
     */
    static getEvents(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/zoho/events
     * Creates a new event on Zoho Calendar and saves to DB.
     */
    static createEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * PUT /api/zoho/events/:id
     * Updates an event on Zoho Calendar and in DB.
     * Zoho requires an If-Match: <etag> header — fetch the ETag first via GET.
     */
    static updateEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * DELETE /api/zoho/events/:id
     * Deletes an event from Zoho Calendar and from DB.
     * Zoho requires an If-Match: <etag> header — fetch the ETag first via GET.
     */
    static deleteEvent(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/zoho/sync
     * Full sync: fetches all events from Zoho and upserts into DB.
     */
    static syncEvents(req: AuthRequest, res: Response): Promise<void>;
}
