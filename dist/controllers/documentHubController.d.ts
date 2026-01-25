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
}
