import { Response } from "express";

import * as EscalationDb from "../models/escalation.model";
import { AuthRequest, ApiResponse } from "@/types";
import { uploadEscalationDocumentToR2 } from "../utils/r2Client";
import { nanoid } from "nanoid";
import { emailService } from "@/utils/emailService";


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

        const payload: EscalationDb.CreateEscalationData = {
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

        const escalation = await EscalationDb.createEscalation(payload);

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
                EscalationDb.getTargetUsers(tenantId, targetMemberIds),
                EscalationDb.getEscalationById(escalation.id, tenantId)
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

        const escalations = await EscalationDb.getEscalations(tenantId);

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

        const escalation = await EscalationDb.getEscalationById(id, tenantId);

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

        const payload: EscalationDb.UpdateEscalationData = {
            subject, description, categoryId, priorityId, statusId, projectId
        };

        const updated = await EscalationDb.updateEscalation(id, tenantId, payload, updatedById);

        if (!updated) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation update failed or not found",
            };
            res.status(400).json(response);
            return;
        }

        const response: ApiResponse = {
            success: true,
            message: "Escalation updated successfully",
            data: updated,
        };
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

        const isDeleted = await EscalationDb.deleteEscalation(id, tenantId);

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
            message: "Escalation moved to trash successfully",
        };
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

/**
 * Get all trashed escalations
 */
export const getTrashEscalations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized",
            };
            res.status(401).json(response);
            return;
        }
        const escalations = await EscalationDb.getTrashEscalations(tenantId);
        const response: ApiResponse = {
            success: true,
            message: "Trash escalations fetched successfully",
            data: escalations,
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in getTrashEscalations:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Restore a single escalation from trash
 */
export const restoreEscalation = async (req: AuthRequest, res: Response): Promise<void> => {
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
        const restored = await EscalationDb.restoreEscalation(id, tenantId);
        if (!restored) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation not found in trash",
            };
            res.status(404).json(response);
            return;
        }
        const response: ApiResponse = {
            success: true,
            message: "Escalation restored successfully",
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in restoreEscalation:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Permanently delete a single escalation
 */
export const permanentDeleteEscalation = async (req: AuthRequest, res: Response): Promise<void> => {
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
        const deleted = await EscalationDb.permanentDeleteEscalation(id, tenantId);
        if (!deleted) {
            const response: ApiResponse = {
                success: false,
                message: "Escalation not found in trash",
            };
            res.status(404).json(response);
            return;
        }
        const response: ApiResponse = {
            success: true,
            message: "Escalation permanently deleted successfully",
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in permanentDeleteEscalation:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Empty escalation trash
 */
export const emptyTrash = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized",
            };
            res.status(401).json(response);
            return;
        }
        const count = await EscalationDb.emptyEscalationTrash(tenantId);
        const response: ApiResponse = {
            success: true,
            message: `Trash emptied: ${count} escalations permanently deleted`,
            data: { deletedCount: count },
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in emptyTrash:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Bulk restore escalations from trash
 */
export const bulkRestoreEscalations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const { ids } = req.body;
        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized",
            };
            res.status(401).json(response);
            return;
        }
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const response: ApiResponse = {
                success: false,
                message: "Invalid or empty IDs list",
            };
            res.status(400).json(response);
            return;
        }
        const count = await EscalationDb.bulkRestoreEscalations(ids, tenantId);
        const response: ApiResponse = {
            success: true,
            message: `${count} escalations restored successfully`,
            data: { restoredCount: count },
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in bulkRestoreEscalations:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};

/**
 * Bulk permanently delete escalations
 */
export const bulkPermanentDeleteEscalations = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tenantId = req.user?.tenantId;
        const { ids } = req.body;
        if (!tenantId) {
            const response: ApiResponse = {
                success: false,
                message: "Unauthorized",
            };
            res.status(401).json(response);
            return;
        }
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            const response: ApiResponse = {
                success: false,
                message: "Invalid or empty IDs list",
            };
            res.status(400).json(response);
            return;
        }
        const count = await EscalationDb.bulkPermanentDeleteEscalations(ids, tenantId);
        const response: ApiResponse = {
            success: true,
            message: `${count} escalations permanently deleted`,
            data: { deletedCount: count },
        };
        res.status(200).json(response);
    } catch (error: any) {
        console.error("Error in bulkPermanentDeleteEscalations:", error.message);
        const response: ApiResponse = {
            success: false,
            message: "Internal server error",
            error: error.message,
        };
        res.status(500).json(response);
    }
};
