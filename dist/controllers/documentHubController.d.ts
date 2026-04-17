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
    static updateDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    static deleteTreeNode(req: AuthRequest, res: Response): Promise<void>;
    private static deleteNodeRecursive;
    /**
     * Delete individual document (soft delete)
     */
    static deleteDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get trash items (hubs and documents)
     */
    static getTrash(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Restore document hub
     */
    static restoreDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Restore document
     */
    static restoreDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Restore tree node (folder/section)
     */
    static restoreTreeNode(req: AuthRequest, res: Response): Promise<void>;
    private static restoreNodeRecursive;
    /**
     * Share document (update visibility and share token)
     */
    static shareDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Revoke sharing (set to private)
     */
    static revokeShare(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get public document by share token
     */
    static getPublicDocument(req: any, res: Response): Promise<void>;
}
