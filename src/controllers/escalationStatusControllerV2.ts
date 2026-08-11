import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { EscalationStatusModel } from "@/models/escalationStatus";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "../utils/transactionHistory";

/**
 * Create a new escalation status
 */
export const createEscalationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const { displayName, priorityWeight, visualColor, status, isFinal, isDefault } = req.body;

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

        const escalationStatus = await EscalationStatusModel.create({
            tenantId,
            createdById,
            displayName,
            priorityWeight,
            visualColor,
            status,
            isFinal,
            isDefault
        });

        const response: ApiResponse = {
            success: true,
            message: "Escalation status created successfully",
            data: escalationStatus,
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.HR,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.CREATE,
            actionLabel: `Created escalation status "${escalationStatus.displayname}"`,
            entityType: EntityType.ESCALATION_STATUS,
            entityId: escalationStatus.id,
            entityLabel: escalationStatus.displayname,
            afterData: {
                displayName: escalationStatus.displayname,
                priorityWeight: escalationStatus.priorityweight,
                visualColor: escalationStatus.visualcolor,
                status: escalationStatus.status,
                isFinal: escalationStatus.finalstate,
                isDefault: escalationStatus.defaultstatus,
            },
        });

        res.status(201).json(response);
    } catch (error: any) {
        console.error("Error in createEscalationStatus:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get all escalation statuses for the tenant
 */
export const getAllEscalationStatuses = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const statuses = await EscalationStatusModel.findAll(tenantId);

        const response: ApiResponse = {
            success: true,
            message: "Escalation statuses fetched successfully",
            data: statuses,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getAllEscalationStatuses:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get a single escalation status by ID
 */
export const getEscalationStatusById = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const escalationStatus = await EscalationStatusModel.findById(id, tenantId);

        if (!escalationStatus) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation status not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation status fetched successfully",
            data: escalationStatus,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getEscalationStatusById:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Update an escalation status
 */
export const updateEscalationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const { displayName, priorityWeight, visualColor, status, isFinal, isDefault } = req.body;

        if (
            !displayName &&
            priorityWeight === undefined &&
            visualColor === undefined &&
            status === undefined &&
            isFinal === undefined &&
            isDefault === undefined
        ) {
            const response: ApiResponse = {
                success: false,
                message: "No fields provided to update",
            };
            res.status(400).json(response);
            return;
        }

        if (priorityWeight !== undefined && !Number.isInteger(priorityWeight)) {
            const response: ApiResponse = {
                success: false,
                message: "priorityWeight must be a valid integer",
            };
            res.status(400).json(response);
            return;
        }

        const existingStatus = await EscalationStatusModel.findById(id, tenantId);

        const updated = await EscalationStatusModel.update(
            id,
            tenantId,
            { displayName, priorityWeight, visualColor, status, isFinal, isDefault },
            updatedById
        );

        if (!updated) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation status not found or nothing to update",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation status updated successfully",
            data: updated,
        };

        // ─── Activity log ───────────────────────────────────────────────
        if (existingStatus) {
            const beforeSnap = {
                displayName: existingStatus.displayname,
                priorityWeight: existingStatus.priorityweight,
                visualColor: existingStatus.visualcolor,
                status: existingStatus.status,
                isFinal: existingStatus.finalstate,
                isDefault: existingStatus.defaultstatus,
            };
            const afterSnap = {
                displayName: updated.displayname,
                priorityWeight: updated.priorityweight,
                visualColor: updated.visualcolor,
                status: updated.status,
                isFinal: updated.finalstate,
                isDefault: updated.defaultstatus,
            };
            const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

            recordTransaction({
                req,
                section: Section.HR,
                module: Module.ESCALATIONS,
                page: Page.ESCALATION_SETTINGS,
                action: Action.UPDATE,
                actionLabel: `Updated escalation status "${updated.displayname}"`,
                entityType: EntityType.ESCALATION_STATUS,
                entityId: id,
                entityLabel: updated.displayname,
                beforeData: before,
                afterData: after,
                changedFields,
            });
        }

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in updateEscalationStatus:", error.message);
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
export const softDeleteEscalationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const result = await EscalationStatusModel.softDelete(id, tenantId, updatedById);

        if (!result) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation status not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation status deactivated successfully",
            data: result,
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.HR,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.STATUS_CHANGE,
            actionLabel: `Deactivated escalation status "${result.displayname}"`,
            entityType: EntityType.ESCALATION_STATUS,
            entityId: id,
            entityLabel: result.displayname,
            beforeData: { status: true },
            afterData: { status: false },
            changedFields: ["status"],
        });

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in softDeleteEscalationStatus:", error.message);
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
export const deleteEscalationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const existingStatus = await EscalationStatusModel.findById(id, tenantId);
        const statusName = existingStatus ? existingStatus.displayname : id;

        const deleted = await EscalationStatusModel.delete(id, tenantId);

        if (!deleted) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation status not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation status deleted successfully",
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.HR,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.DELETE,
            actionLabel: `Deleted escalation status "${statusName}"`,
            entityType: EntityType.ESCALATION_STATUS,
            entityId: id,
            entityLabel: statusName,
        });

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in deleteEscalationStatus:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};