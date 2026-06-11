import { Response } from 'express';
import { AuthRequest } from '@/types';
export declare class ClientV2Controller {
    static getClients(req: AuthRequest, res: Response): Promise<void>;
    static getClientById(req: AuthRequest, res: Response): Promise<void>;
    static createClient(req: AuthRequest, res: Response): Promise<void>;
    static updateClient(req: AuthRequest, res: Response): Promise<void>;
    static addContact(req: AuthRequest, res: Response): Promise<void>;
    static updateContact(req: AuthRequest, res: Response): Promise<void>;
    static addDocument(req: AuthRequest, res: Response): Promise<void>;
    static deleteDocument(req: AuthRequest, res: Response): Promise<void>;
    /**
     * PATCH /api/clients-v2/:clientId/documents/:documentId
     * Updates editable metadata: fileName, category, documentType.
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
     * Returns { total, active } scoped to the current tenant.
     */
    static getProjectStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Live duplicate check for project name/code within the current tenant.
     * Returns { codeExists, nameExists }.
     */
    static checkProjectAvailability(req: AuthRequest, res: Response): Promise<void>;
    /**
     * GET /api/clients-v2/:clientId/projects/importable
     * Lists projects not yet linked to this client.
     */
    static getImportableProjects(req: AuthRequest, res: Response): Promise<void>;
    /**
     * POST /api/clients-v2/:clientId/projects/import
     * Bulk-creates client_projects mappings for existing projects.
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
