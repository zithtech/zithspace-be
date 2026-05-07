import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class DocumentHubController {
    /**
     * Generate a documentation draft from a free-form prompt.
     * Returns { hubName, fileTitle, contentHtml }. Does NOT persist anything —
     * the client makes follow-up calls to create the hub and write the file.
     */
    static aiGenerateDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Rewrite a selected excerpt of a document according to a user instruction.
     * Used by the inline Zai menu in the editor when a user selects text.
     * Does NOT persist anything — the client applies the result.
     */
    static aiRewriteSelection(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Create a new Document HUb (tenant-aware)
     */
    static createDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    static getDocumentHubById(req: AuthRequest, res: Response): Promise<void>;
    static createTreeNode(req: AuthRequest, res: Response): Promise<void>;
    static updateTreeNode(req: AuthRequest, res: Response): Promise<void>;
    static getDocument(req: AuthRequest, res: Response): Promise<void>;
    static updateDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Star a document hub for the current user (raw SQL — no Prisma model).
     * Idempotent: a duplicate (user, hub) pair is a no-op.
     */
    static starDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Remove the current user's star from a document hub (raw SQL).
     */
    static unstarDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete a single version from a document's history. Uses a raw SQL DELETE
     * (with parameterised values) to keep the query explicit and side-effect-
     * free. The latest version is protected — that's the live document; the
     * client should call the document-delete endpoint instead.
     */
    static deleteDocumentHistoryEntry(req: AuthRequest, res: Response): Promise<void>;
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
    /**
     * Share entire document hub
     */
    static shareDocumentHub(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Revoke document hub sharing
     */
    static revokeHubShare(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Get public document hub by share token
     */
    static getPublicDocumentHub(req: any, res: Response): Promise<void>;
    /**
     * Get content of a document within a public hub
     */
    static getPublicHubDocumentContent(req: any, res: Response): Promise<void>;
}
