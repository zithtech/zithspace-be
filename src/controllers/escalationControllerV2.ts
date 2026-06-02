import { Response } from "express";

import { EscalationModel, CreateEscalationPayload, UpdateEscalationPayload } from "../models/escalationModel";
import { AuthRequest, ApiResponse } from "@/types";
import { uploadEscalationDocumentToR2 } from "../utils/r2Client";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';
import { nanoid } from "nanoid";
import { emailService } from "@/utils/emailService";
import { prisma } from "@/config/database";


/**
 * Create a new escalation with attachments
 */
export const createEscalation = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const {
            subject,
            description,
            categoryId,
            priorityId,
            projectId,
            statusId,
            targetMemberIds,
            ticketIds,
            attachments
        } = req.body;

        // Basic payload validation
        if (!subject || !description || !categoryId || !priorityId || !statusId || !targetMemberIds || targetMemberIds.length === 0) {
            const response: ApiResponse = {
                success: false,
                message: "Missing required fields (subject, description, categoryId, priorityId, statusId, targetMemberIds)",
            };
            res.status(400).json(response);
            return;
        }

        // Pre-generate UUID for Cloudflare R2 folder mapping (if escalations don't exist yet we make a temporal prefix)
        const tempEscalationId = nanoid(12);

        let documentUrl: string | undefined = undefined;

        // Handle Base64 Attachments
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            const uploadedUrls: string[] = [];
            for (const file of attachments) {
                if (file.fileBase64 && file.fileName) {
                    const url = await uploadEscalationDocumentToR2(
                        file.fileBase64,
                        file.fileName,
                        tenantId,
                        tempEscalationId
                    );
                    uploadedUrls.push(url);
                }
            }
            if (uploadedUrls.length > 0) {
                // Store array of URLs as a JSON string to fit in TEXT column
                documentUrl = JSON.stringify(uploadedUrls);
            }
        }

        const payload: CreateEscalationPayload = {
            tenantId,
            createdById,
            subject,
            description,
            categoryId,
            priorityId,
            statusId,
            projectId,
            targetMemberIds,
            ticketIds: ticketIds || [],
            documentUrl
        };

        const escalation = await EscalationModel.create(payload);

        // Notify target users about the escalation asynchronously
        if (targetMemberIds && targetMemberIds.length > 0) {
            const creatorName = req.user?.name || req.user?.email || "An administrator";
            
            // Format base64 attachments to Buffers for nodemailer
            const mailAttachments = (attachments && Array.isArray(attachments))
                ? attachments.filter(att => att.fileBase64 && att.fileName).map(att => ({
                    filename: att.fileName,
                    content: Buffer.from(att.fileBase64, 'base64')
                }))
                : [];

            // Query target users and full escalation details in parallel
            Promise.all([
                prisma.user.findMany({
                    where: {
                        id: { in: targetMemberIds },
                        tenantId: tenantId
                    },
                    select: {
                        name: true,
                        workEmail: true
                    }
                }),
                EscalationModel.findById(escalation.id, tenantId)
            ]).then(([targetUsers, fullEscalation]) => {
                targetUsers.forEach(user => {
                    if (user.workEmail) {
                        emailService.sendEscalationEmail({
                            to: user.workEmail,
                            userName: user.name,
                            escalationSubject: subject,
                            description: description,
                            creatorName: creatorName,
                            escalation: fullEscalation,
                            attachments: mailAttachments
                        }, tenantId).catch(err => {
                            console.error(`❌ Failed to send escalation email to ${user.workEmail}:`, err.message);
                        });
                    }
                });
            }).catch(err => {
                console.error("❌ Failed to resolve escalation details for emails:", err.message);
            });
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation created successfully",
            data: escalation,
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.WORK,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_LIST,
            action: Action.CREATE,
            actionLabel: `Created escalation "${escalation.short_summary}"`,
            entityType: EntityType.ESCALATION,
            entityId: escalation.id,
            entityLabel: escalation.short_summary,
            afterData: {
                subject: escalation.short_summary,
                description: escalation.detailed_description,
            },
        });

        res.status(201).json(response);
    } catch (error: any) {
        console.error("Error in createEscalation:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get all escalations
 */
export const getAllEscalations = async (req: AuthRequest, res: Response): Promise<void> => {
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

        const escalations = await EscalationModel.findAll(tenantId);

        const response: ApiResponse = {
            success: true,
            message: "Escalations fetched successfully",
            data: escalations,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getAllEscalations:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Get single escalation by ID
 */
export const getEscalationById = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized",
            };
            res.status(401).json(response);
            return;
        }

        const escalation = await EscalationModel.findById(id, tenantId);

        if (!escalation) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation not found",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation fetched successfully",
            data: escalation,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getEscalationById:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Update an escalation
 */
export const updateEscalation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const updatedById = req.user?.id;
        const { id } = req.params;

        if (!tenantId || !updatedById) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized",
            };
            res.status(401).json(response);
            return;
        }

        const {
            subject, description, categoryId, priorityId, statusId, projectId
        } = req.body;

        const payload: UpdateEscalationPayload = {
            subject, description, categoryId, priorityId, statusId, projectId
        };

        const existingEscalation = await EscalationModel.findById(id, tenantId);
        const updatedRaw = await EscalationModel.update(id, tenantId, payload, updatedById);

        if (!updatedRaw) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation update failed or not found",
            };
            res.status(400).json(response);
            return;
        }

        const updated = await EscalationModel.findById(id, tenantId);

        const response: ApiResponse = {
            success: true,
            message: "Escalation updated successfully",
            data: updatedRaw,
        };

        // ─── Activity log ───────────────────────────────────────────────
        if (existingEscalation && updated) {
            const beforeSnap = {
                subject: existingEscalation.short_summary,
                description: existingEscalation.detailed_description,
                category: existingEscalation.category_name,
                priority: existingEscalation.priority_name,
                status: existingEscalation.status_name,
            };
            const afterSnap = {
                subject: updated.short_summary,
                description: updated.detailed_description,
                category: updated.category_name,
                priority: updated.priority_name,
                status: updated.status_name,
            };
            const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

            recordTransaction({
                req,
                section: Section.WORK,
                module: Module.ESCALATIONS,
                page: Page.ESCALATION_LIST,
                action: Action.UPDATE,
                actionLabel: `Updated escalation "${updated.short_summary}"`,
                entityType: EntityType.ESCALATION,
                entityId: id,
                entityLabel: updated.short_summary,
                beforeData: before,
                afterData: after,
                changedFields,
            });
        }

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in updateEscalation:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Hard delete an escalation
 */
export const deleteEscalation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const { id } = req.params;

        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized",
            };
            res.status(401).json(response);
            return;
        }

        const existingEscalation = await EscalationModel.findById(id, tenantId);
        const escalationSubject = existingEscalation ? existingEscalation.short_summary : id;

        const isDeleted = await EscalationModel.delete(id, tenantId);

        if (!isDeleted) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation not found or already deleted",
            };
            res.status(404).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation deleted successfully",
        };

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
            req,
            section: Section.WORK,
            module: Module.ESCALATIONS,
            page: Page.ESCALATION_LIST,
            action: Action.DELETE,
            actionLabel: `Deleted escalation "${escalationSubject}"`,
            entityType: EntityType.ESCALATION,
            entityId: id,
            entityLabel: escalationSubject,
        });

        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in deleteEscalation:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};
