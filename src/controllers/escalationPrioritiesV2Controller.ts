import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { EscalationPriorityModel } from "@/models/escalationPriorities.model";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "../utils/transactionHistory";

/**
 * Create a new escalation priority
 */
export const createEscalationPriority = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const createdById = req.user?.id;

        if (!tenantId || !createdById) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized: Missing tenant or user info",
            };
            res.status(401).json(response);
            return;
        }

        const { displayName, priorityWeight, visualColor, status } = req.body;

        if (!displayName) {
            const response: ApiResponse = {
                success: false,
                message: "displayName is required",
            };
            res.status(400).json(response);
            return;
        }

        if (priorityWeight === undefined || priorityWeight === null) {
            const response: ApiResponse = {
                success: false,
                message: "priorityWeight is required",
            };
            res.status(400).json(response);
            return;
        }

        if (typeof priorityWeight !== "number" || !Number.isInteger(priorityWeight)) {
            const response: ApiResponse = {
                success: false,
                message: "priorityWeight must be a valid integer",
            };
            res.status(400).json(response);
            return;
        }

        const priority = await EscalationPriorityModel.create({
            tenantId,
            createdById,
            displayName,
            priorityWeight,
            visualColor,
            status,
        });

        const response: ApiResponse = {
            success: true,
            message: "Escalation priority created successfully",
            data: priority,
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.WORK,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.CREATE,
            actionLabel: `Created escalation priority "${priority.displayname}"`,
            entityType: EntityType.ESCALATION_PRIORITY,
            entityId: priority.id,
            entityLabel: priority.displayname,
            afterData: {
                displayName: priority.displayname,
                priorityWeight: priority.priorityweight,
                visualColor: priority.visualcolor,
                status: priority.status,
            },
        });

        res.status(201).json(response);
    } catch (error: any) {
        console.error("Error in createEscalationPriority:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get all escalation priorities for the tenant
 */
export const getAllEscalationPriorities = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;

        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized: Missing tenant info",
            };
            res.status(401).json(response);
            return;
        }

        const priorities = await EscalationPriorityModel.findAll(tenantId);

        const response: ApiResponse = {
            success: true,
            message: "Escalation priorities fetched successfully",
            data: priorities,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getAllEscalationPriorities:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get a single escalation priority by ID
 */
export const getEscalationPriorityById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized: Missing tenant info",
            };
            res.status(401).json(response);
            return;
        }

        const priority = await EscalationPriorityModel.findById(id, tenantId);

        if (!priority) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation priority not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation priority fetched successfully",
            data: priority,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getEscalationPriorityById:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Update an escalation priority
 */
export const updateEscalationPriority = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const updatedById = req.user?.id;
        const { id } = req.params;

        if (!tenantId || !updatedById) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized: Missing tenant or user info",
            };
            res.status(401).json(response);
            return;
        }

        const { displayName, priorityWeight, visualColor, status } = req.body;

        if (
            !displayName &&
            priorityWeight === undefined &&
            visualColor === undefined &&
            status === undefined
        ) {
            const response: ApiResponse = {
                success: false,
                message: "No fields provided to update",
            };
            res.status(400).json(response);
            return;
        }

        if (priorityWeight !== undefined && (!Number.isInteger(priorityWeight))) {
            const response: ApiResponse = {
                success: false,
                message: "priorityWeight must be a valid integer",
            };
            res.status(400).json(response);
            return;
        }

        const existingPriority = await EscalationPriorityModel.findById(id, tenantId);

        const updated = await EscalationPriorityModel.update(
            id,
            tenantId,
            { displayName, priorityWeight, visualColor, status },
            updatedById
        );

        if (!updated) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation priority not found or nothing to update",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation priority updated successfully",
            data: updated,
        };

        // ─── Activity log ───────────────────────────────────────────────
        if (existingPriority) {
            const beforeSnap = {
                displayName: existingPriority.displayname,
                priorityWeight: existingPriority.priorityweight,
                visualColor: existingPriority.visualcolor,
                status: existingPriority.status,
            };
            const afterSnap = {
                displayName: updated.displayname,
                priorityWeight: updated.priorityweight,
                visualColor: updated.visualcolor,
                status: updated.status,
            };
            const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

            recordTransaction({
                req,
                section: Section.WORK,
                module: Module.ESCALATIONS,
                page: Page.ESCALATION_SETTINGS,
                action: Action.UPDATE,
                actionLabel: `Updated escalation priority "${updated.displayname}"`,
                entityType: EntityType.ESCALATION_PRIORITY,
                entityId: id,
                entityLabel: updated.displayname,
                beforeData: before,
                afterData: after,
                changedFields,
            });
        }

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in updateEscalationPriority:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Soft delete — sets status to false
 */
export const softDeleteEscalationPriority = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const updatedById = req.user?.id;
        const { id } = req.params;

        if (!tenantId || !updatedById) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized: Missing tenant or user info",
            };
            res.status(401).json(response);
            return;
        }

        const result = await EscalationPriorityModel.softDelete(id, tenantId, updatedById);

        if (!result) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation priority not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation priority deactivated successfully",
            data: result,
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.WORK,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.STATUS_CHANGE,
            actionLabel: `Deactivated escalation priority "${result.displayname}"`,
            entityType: EntityType.ESCALATION_PRIORITY,
            entityId: id,
            entityLabel: result.displayname,
            beforeData: { status: true },
            afterData: { status: false },
            changedFields: ["status"],
        });

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in softDeleteEscalationPriority:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Hard delete — permanently removes the record
 */
export const deleteEscalationPriority = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized: Missing tenant info",
            };
            res.status(401).json(response);
            return;
        }

        const existingPriority = await EscalationPriorityModel.findById(id, tenantId);
        const priorityName = existingPriority ? existingPriority.displayname : id;

        const deleted = await EscalationPriorityModel.delete(id, tenantId);

        if (!deleted) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation priority not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation priority deleted successfully",
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.WORK,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.DELETE,
            actionLabel: `Deleted escalation priority "${priorityName}"`,
            entityType: EntityType.ESCALATION_PRIORITY,
            entityId: id,
            entityLabel: priorityName,
        });

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in deleteEscalationPriority:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};