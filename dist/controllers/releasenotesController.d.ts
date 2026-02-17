import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ReleaseNotesController {
    /** GET all release notes (tenant-aware, paginated, filterable) */
    static getReleaseNotes(req: AuthRequest, res: Response): Promise<void>;
    /** GET release note by ID */
    static getReleaseNoteById(req: AuthRequest, res: Response): Promise<void>;
    /** CREATE release note */
    static createReleaseNote(req: AuthRequest, res: Response): Promise<void>;
    static updateReleaseNote(req: AuthRequest, res: Response): Promise<void>;
    static deleteReleaseNote(req: AuthRequest, res: Response): Promise<void>;
}
export default ReleaseNotesController;
