import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class ClientV2Controller {
    static getClients(req: AuthRequest, res: Response): Promise<void>;
    static getClientById(req: AuthRequest, res: Response): Promise<void>;
    static createClient(req: AuthRequest, res: Response): Promise<void>;
    static updateClient(req: AuthRequest, res: Response): Promise<void>;
    static addContact(req: AuthRequest, res: Response): Promise<void>;
    static updateContact(req: AuthRequest, res: Response): Promise<void>;
    static deleteContact(req: AuthRequest, res: Response): Promise<void>;
    static addDocument(req: AuthRequest, res: Response): Promise<void>;
    static deleteDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * PATCH /api/clients-v2/:clientId/documents/:documentId
     * Updates editable metadata: fileName, category, documentType. The file
     * itself is not replaced — that would be a re-upload.
     */
    static updateDocument(req: AuthRequest, res: Response): Promise<void>;
    static downloadDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Delete a client and all its associated data
     */
    static deleteClient(req: AuthRequest, res: Response): Promise<void>;
    static getProjects(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Lightweight project counts for the Client Management dashboard cards.
     * Raw psql — does not touch Prisma.
     * Returns { total, active } scoped to the current tenant.
     */
    static getProjectStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Live duplicate check for project name/code within the current tenant.
     * Either or both query params may be present; only fields ≥ 3 chars are evaluated.
     * Returns { codeExists, nameExists } so the FE can surface inline feedback as the user types.
     * Raw psql — does not touch Prisma.
     */
    static checkProjectAvailability(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/clients-v2/:clientId/projects/importable
     * Lists projects in this tenant that are NOT yet linked to this client,
     * plus a flag indicating how many other clients they're already linked to
     * (so staff can see "this project is shared with 2 other clients" when
     * importing). Excludes soft-deleted projects.
     * Raw psql — does not touch Prisma.
     */
    static getImportableProjects(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/clients-v2/:clientId/projects/import
     * body: { projectIds: string[], billingType?, budget? }
     *
     * Bulk-creates `client_projects` rows linking the listed existing
     * projects to this client. Skips projects already linked (idempotent —
     * useful if the picker drifted). Returns the count of new mappings.
     * Raw psql.
     */
    static importProjects(req: AuthRequest, res: Response): Promise<void>;
    static addProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * @route   PUT /api/clients-v2/projects/:projectId
     * @desc    Update an existing project and its client mapping
     */
    static updateProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * @route   DELETE /api/clients-v2/projects/:projectId
     * @desc    Delete a project and its client mapping
     */
    static deleteProject(req: AuthRequest, res: Response): Promise<void>;
    static addAllocation(req: AuthRequest, res: Response): Promise<void>;
    static updateAllocation(req: AuthRequest, res: Response): Promise<void>;
    static getEmployeesForSelect(req: AuthRequest, res: Response): Promise<void>;
    static getClientInvoices(req: AuthRequest, res: Response): Promise<void>;
}
export default ClientV2Controller;
