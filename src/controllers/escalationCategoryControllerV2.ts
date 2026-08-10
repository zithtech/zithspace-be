import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { EscalationCategoryModel } from "@/models/escalationCategory.model";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';

/**
 * Create a new escalation category
 */
export const createEscalationCategory = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const { displayName, description, visualColor, status } = req.body;

        if (!displayName) {
            const response: ApiResponse = {
                success: false,
                message: "displayName is required",
            };
            res.status(400).json(response);
            return;
        }

        const category = await EscalationCategoryModel.create({
            tenantId,
            createdById,
            displayName,
            description,
            visualColor,
            status,
        });

        const response: ApiResponse = {
            success: true,
            message: "Escalation category created successfully",
            data: category,
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.HR,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.CREATE,
            actionLabel: `Created escalation category "${category.displayname}"`,
            entityType: EntityType.ESCALATION_CATEGORY,
            entityId: category.id,
            entityLabel: category.displayname,
            afterData: {
                displayName: category.displayname,
                description: category.description,
                visualColor: category.visualcolor,
                status: category.status,
            },
        });

        res.status(201).json(response);
    } catch (error: any) {
        console.error("Error in createEscalationCategory:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get all escalation categories for the tenant
 */
export const getAllEscalationCategories = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const categories = await EscalationCategoryModel.findAll(tenantId);

        const response: ApiResponse = {
            success: true,
            message: "Escalation categories fetched successfully",
            data: categories,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getAllEscalationCategories:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get a single escalation category by ID
 */
export const getEscalationCategoryById = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const category = await EscalationCategoryModel.findById(id, tenantId);

        if (!category) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation category not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation category fetched successfully",
            data: category,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getEscalationCategoryById:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Update an escalation category
 */
export const updateEscalationCategory = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const { displayName, description, visualColor, status } = req.body;

        if (!displayName && description === undefined && visualColor === undefined && status === undefined) {
            const response: ApiResponse = {
                success: false,
                message: "No fields provided to update",
            };
            res.status(400).json(response);
            return;
        }

        const existingCategory = await EscalationCategoryModel.findById(id, tenantId);

        const updated = await EscalationCategoryModel.update(
            id,
            tenantId,
            { displayName, description, visualColor, status },
            updatedById
        );

        if (!updated) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation category not found or nothing to update",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation category updated successfully",
            data: updated,
        };

        // ─── Activity log ───────────────────────────────────────────────
        if (existingCategory) {
            const beforeSnap = {
                displayName: existingCategory.displayname,
                description: existingCategory.description,
                visualColor: existingCategory.visualcolor,
                status: existingCategory.status,
            };
            const afterSnap = {
                displayName: updated.displayname,
                description: updated.description,
                visualColor: updated.visualcolor,
                status: updated.status,
            };
            const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

            recordTransaction({
                req,
                section: Section.HR,
                module: Module.ESCALATIONS,
                page: Page.ESCALATION_SETTINGS,
                action: Action.UPDATE,
                actionLabel: `Updated escalation category "${updated.displayname}"`,
                entityType: EntityType.ESCALATION_CATEGORY,
                entityId: id,
                entityLabel: updated.displayname,
                beforeData: before,
                afterData: after,
                changedFields,
            });
        }

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in updateEscalationCategory:", error.message);
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
export const softDeleteEscalationCategory = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const result = await EscalationCategoryModel.softDelete(id, tenantId, updatedById);

        if (!result) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation category not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation category deactivated successfully",
            data: result,
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.HR,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.STATUS_CHANGE,
            actionLabel: `Deactivated escalation category "${result.displayname}"`,
            entityType: EntityType.ESCALATION_CATEGORY,
            entityId: id,
            entityLabel: result.displayname,
            beforeData: { status: true },
            afterData: { status: false },
            changedFields: ["status"],
        });

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in softDeleteEscalationCategory:", error.message);
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
export const deleteEscalationCategory = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const existingCategory = await EscalationCategoryModel.findById(id, tenantId);
        const categoryName = existingCategory ? existingCategory.displayname : id;

        const deleted = await EscalationCategoryModel.delete(id, tenantId);

        if (!deleted) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation category not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation category deleted successfully",
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.HR,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_SETTINGS,
            action: Action.DELETE,
            actionLabel: `Deleted escalation category "${categoryName}"`,
            entityType: EntityType.ESCALATION_CATEGORY,
            entityId: id,
            entityLabel: categoryName,
        });

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in deleteEscalationCategory:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};