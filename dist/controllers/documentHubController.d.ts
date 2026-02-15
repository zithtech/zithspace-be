import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class DocumentHubController {
    /**
     * Create a new Document HUb (tenant-aware)
     */
    static createDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    static getDocumentHubById(req: AuthRequest, res: Response): Promise<void>;
    static createTreeNode(req: AuthRequest, res: Response): Promise<void>;
    static updateTreeNode(req: AuthRequest, res: Response): Promise<void>;
    static getDocument(req: AuthRequest, res: Response): Promise<void>;
    static updateDocument(req: AuthRequest, res: Response): Promise<void>;
    static getDocumentHistory(req: AuthRequest, res: Response): Promise<void>;
    static getAllDocumentHubs(req: AuthRequest, res: Response): Promise<void>;
    static deleteDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    static restoreDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    static deleteDocument(req: AuthRequest, res: Response): Promise<void>;
    static restoreDocument(req: AuthRequest, res: Response): Promise<void>;
    static getTrash(req: AuthRequest, res: Response): Promise<void>;
    static shareDocument(req: AuthRequest, res: Response): Promise<void>;
    static revokeShare(req: AuthRequest, res: Response): Promise<void>;
    static getPublicDocument(req: any, res: Response): Promise<void>;
}
