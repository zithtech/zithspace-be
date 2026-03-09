import { Response } from "express";
import { AuthRequest } from "@/types";
export declare class ClientV2Controller {
    static getClients(req: AuthRequest, res: Response): Promise<void>;
    static getClientById(req: AuthRequest, res: Response): Promise<void>;
    static createClient(req: AuthRequest, res: Response): Promise<void>;
    static updateClient(req: AuthRequest, res: Response): Promise<void>;
    static addContact(req: AuthRequest, res: Response): Promise<void>;
    static updateContact(req: AuthRequest, res: Response): Promise<void>;
    static addDocument(req: AuthRequest, res: Response): Promise<void>;
    static deleteDocument(req: AuthRequest, res: Response): Promise<void>;
    static getProjects(req: AuthRequest, res: Response): Promise<void>;
    static addProject(req: AuthRequest, res: Response): Promise<void>;
    /**
     * @route   PUT /api/clients-v2/projects/:projectId
     * @desc    Update an existing project and its client mapping
     */
    static updateProject(req: AuthRequest, res: Response): Promise<void>;
    static addAllocation(req: AuthRequest, res: Response): Promise<void>;
    static updateAllocation(req: AuthRequest, res: Response): Promise<void>;
    static getEmployeesForSelect(req: AuthRequest, res: Response): Promise<void>;
}
export default ClientV2Controller;
