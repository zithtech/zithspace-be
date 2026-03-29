"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentHubController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const socketService_1 = require("@/services/socketService");
const crypto_1 = __importDefault(require("crypto"));
class DocumentHubController {
    /**
     * Create a new Document HUb (tenant-aware)
     */
    static async createDocumentHub(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { name, projectId, ticketId } = req.body ?? {};
            // Validate required fields
            if (!name || name.trim() === "") {
                res.status(400).json({
                    success: false,
                    error: "Document HUb Name is required",
                });
                return;
            }
            // Validate project if provided
            if (projectId) {
                const project = await database_1.prisma.project.findFirst({
                    where: {
                        id: projectId,
                        tenantId: req.tenantId,
                    },
                });
                if (!project) {
                    throw new types_1.ValidationError("Project not found in this tenant");
                }
            }
            // Create documentHub
            const documentHub = await database_1.prisma.documentHub.create({
                data: {
                    tenantId: req.tenantId,
                    name,
                    projectId: projectId,
                    ticketId: ticketId,
                    createdById: req.user.id,
                },
                include: {
                    createdBy: {
                        select: { id: true, name: true, workEmail: true },
                    },
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                },
            });
            // Create "Getting Started" document
            const doc = await database_1.prisma.document.create({
                data: {
                    tenantId: req.tenantId,
                    documentHubId: documentHub.id,
                    title: "Getting Started",
                    content: [
                        {
                            id: "getting-started-heading",
                            type: "heading",
                            props: { level: 1, textColor: "default", backgroundColor: "default", textAlignment: "left" },
                            content: [{ type: "text", text: "Getting Started", styles: {} }],
                            children: [],
                        },
                        {
                            id: "getting-started-p1",
                            type: "paragraph",
                            props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
                            content: [
                                {
                                    type: "text",
                                    text: "Welcome to your new documentation hub! Here is some placeholder text to get you started.",
                                    styles: {},
                                },
                            ],
                            children: [],
                        },
                    ],
                    createdById: req.user.id,
                },
            });
            const documentTree = await database_1.prisma.documentTree.create({
                data: {
                    tenantId: req.tenantId,
                    documentHubId: documentHub.id,
                    createdById: req.user.id,
                    title: "Getting Started",
                    position: 0,
                    type: "file",
                    documentId: doc.id,
                },
                include: {
                    createdBy: {
                        select: { id: true, name: true },
                    },
                },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:created", documentHub);
            res.status(201).json({
                success: true,
                data: documentHub,
                message: "Document Hub Created successfully",
            });
        }
        catch (error) {
            console.error("Create document hub error:", error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to create document hub",
            });
        }
    }
    static async getDocumentHubById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const documentHub = await database_1.prisma.documentHub.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
                include: {
                    treeNodes: {
                        where: { isDeleted: false },
                        orderBy: {
                            position: "asc",
                        },
                    },
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                    createdBy: {
                        select: { id: true, name: true, workEmail: true },
                    },
                },
            });
            if (!documentHub) {
                res.status(404).json({
                    success: false,
                    error: "Document Hub not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: documentHub,
            });
        }
        catch (error) {
            console.error("Get document hub error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get document hub",
            });
        }
    }
    static async createTreeNode(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { documentHubId, parentId, type, title } = req.body;
            if (!documentHubId || !title || !type) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            // Find last position in the same level
            const lastNode = await database_1.prisma.documentTree.findFirst({
                where: {
                    tenantId: req.tenantId,
                    documentHubId,
                    parentId: parentId || null,
                    isDeleted: false,
                },
                orderBy: {
                    position: "desc",
                },
            });
            const position = lastNode ? lastNode.position + 1 : 0;
            let documentId = null;
            if (type === "file") {
                // Create document if it's a file
                const doc = await database_1.prisma.document.create({
                    data: {
                        tenantId: req.tenantId,
                        documentHubId,
                        title,
                        content: [], // Default empty content for Blocknote
                        createdById: req.user.id,
                    },
                });
                documentId = doc.id;
            }
            const newNode = await database_1.prisma.documentTree.create({
                data: {
                    tenantId: req.tenantId,
                    documentHubId,
                    parentId: parentId || null,
                    title,
                    type,
                    position,
                    createdById: req.user.id,
                    documentId,
                },
            });
            res.status(201).json({
                success: true,
                data: newNode,
            });
        }
        catch (error) {
            console.error("Create tree node error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create tree node",
            });
        }
    }
    static async updateTreeNode(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { title } = req.body;
            if (!title) {
                res.status(400).json({
                    success: false,
                    error: "Title is required",
                });
                return;
            }
            const node = await database_1.prisma.documentTree.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!node) {
                res.status(404).json({
                    success: false,
                    error: "Node not found",
                });
                return;
            }
            const updatedNode = await database_1.prisma.documentTree.update({
                where: { id },
                data: { title },
            });
            // If it's a file and has a documentId, update the document title too
            if (node.type === "file" && node.documentId) {
                await database_1.prisma.document.update({
                    where: { id: node.documentId },
                    data: { title },
                });
            }
            res.status(200).json({
                success: true,
                data: updatedNode,
            });
        }
        catch (error) {
            console.error("Update tree node error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update tree node",
            });
        }
    }
    static async getDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: document,
            });
        }
        catch (error) {
            console.error("Get document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get document",
            });
        }
    }
    static async updateDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { content, title } = req.body;
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found",
                });
                return;
            }
            const updatedDocument = await database_1.prisma.document.update({
                where: {
                    id,
                },
                data: {
                    content: content !== undefined ? content : document.content,
                    title: title !== undefined ? title : document.title,
                    updatedAt: new Date(),
                },
            });
            // Create history entry
            if (content !== undefined) {
                await database_1.prisma.documentHistory.create({
                    data: {
                        documentId: id,
                        tenantId: req.tenantId,
                        content: content,
                        createdById: req.user.id,
                    },
                });
            }
            res.status(200).json({
                success: true,
                data: updatedDocument,
                message: "Document updated successfully",
            });
        }
        catch (error) {
            console.error("Update document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update document",
            });
        }
    }
    static async getDocumentHistory(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const history = await database_1.prisma.documentHistory.findMany({
                where: {
                    documentId: id,
                    tenantId: req.tenantId,
                },
                include: {
                    createdBy: {
                        select: {
                            id: true,
                            name: true,
                            workEmail: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
            res.status(200).json({
                success: true,
                data: history,
            });
        }
        catch (error) {
            console.error("Get document history error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get document history",
            });
        }
    }
    static async getAllDocumentHubs(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const documentHubs = await database_1.prisma.documentHub.findMany({
                where: {
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
                include: {
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                    ticket: {
                        select: { id: true, title: true, status: true, ticketNumber: true },
                    },
                    createdBy: {
                        select: { id: true, name: true, workEmail: true },
                    },
                    treeNodes: {
                        where: { isDeleted: false },
                        select: { id: true, type: true },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
            res.status(200).json({
                success: true,
                data: documentHubs,
            });
        }
        catch (error) {
            console.error("Get all document hubs error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get all document hubs",
            });
        }
    }
    static async deleteDocumentHub(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const documentHub = await database_1.prisma.documentHub.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!documentHub) {
                res.status(404).json({
                    success: false,
                    error: "Document Hub not found",
                });
                return;
            }
            await database_1.prisma.documentHub.update({
                where: { id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedById: req.user.id,
                },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:deleted", { id });
            res.status(200).json({
                success: true,
                message: "Document Hub moved to trash",
            });
        }
        catch (error) {
            console.error("Delete document hub error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete document hub",
            });
        }
    }
    static async deleteTreeNode(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const node = await database_1.prisma.documentTree.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!node) {
                res.status(404).json({
                    success: false,
                    error: "Node not found",
                });
                return;
            }
            // Soft delete the node
            await database_1.prisma.documentTree.update({
                where: { id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedById: req.user.id,
                },
            });
            // If it's a file, also soft delete the associated document
            if (node.type === "file" && node.documentId) {
                await database_1.prisma.document.update({
                    where: { id: node.documentId },
                    data: {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedById: req.user.id,
                    },
                });
            }
            res.status(200).json({
                success: true,
                message: "Node moved to trash",
            });
        }
        catch (error) {
            console.error("Delete tree node error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete tree node",
            });
        }
    }
    /**
     * Delete individual document (soft delete)
     */
    static async deleteDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found",
                });
                return;
            }
            // Soft delete the document
            await database_1.prisma.document.update({
                where: { id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedById: req.user.id,
                },
            });
            // Also soft delete associated tree node if it exists
            await database_1.prisma.documentTree.updateMany({
                where: {
                    documentId: id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedById: req.user.id,
                },
            });
            res.status(200).json({
                success: true,
                message: "Document moved to trash",
            });
        }
        catch (error) {
            console.error("Delete document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete document",
            });
        }
    }
    /**
     * Get trash items (hubs and documents)
     */
    static async getTrash(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { type } = req.query;
            let hubs = [];
            let documents = [];
            if (!type || type === "hub") {
                hubs = await database_1.prisma.documentHub.findMany({
                    where: {
                        tenantId: req.tenantId,
                        isDeleted: true,
                    },
                    include: {
                        deletedBy: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: {
                        deletedAt: "desc",
                    },
                });
            }
            if (!type || type === "document") {
                documents = await database_1.prisma.document.findMany({
                    where: {
                        tenantId: req.tenantId,
                        isDeleted: true,
                    },
                    include: {
                        deletedBy: {
                            select: { id: true, name: true },
                        },
                        documentHub: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: {
                        deletedAt: "desc",
                    },
                });
            }
            res.status(200).json({
                success: true,
                data: { hubs, documents },
            });
        }
        catch (error) {
            console.error("Get trash error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get trash items",
            });
        }
    }
    /**
     * Restore document hub
     */
    static async restoreDocumentHub(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const documentHub = await database_1.prisma.documentHub.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: true,
                },
            });
            if (!documentHub) {
                res.status(404).json({
                    success: false,
                    error: "Document Hub not found in trash",
                });
                return;
            }
            await database_1.prisma.documentHub.update({
                where: { id },
                data: {
                    isDeleted: false,
                    deletedAt: null,
                    deletedById: null,
                },
            });
            res.status(200).json({
                success: true,
                message: "Document Hub restored successfully",
            });
        }
        catch (error) {
            console.error("Restore document hub error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to restore document hub",
            });
        }
    }
    /**
     * Restore document
     */
    static async restoreDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: true,
                },
                include: {
                    documentHub: true
                }
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found in trash",
                });
                return;
            }
            // If the parent hub is deleted, we might want to warn or prevent?
            // For now, restore the document.
            await database_1.prisma.document.update({
                where: { id },
                data: {
                    isDeleted: false,
                    deletedAt: null,
                    deletedById: null,
                },
            });
            // Also restore associated tree node if it exists
            await database_1.prisma.documentTree.updateMany({
                where: {
                    documentId: id,
                    tenantId: req.tenantId,
                    isDeleted: true,
                },
                data: {
                    isDeleted: false,
                    deletedAt: null,
                    deletedById: null,
                },
            });
            res.status(200).json({
                success: true,
                message: "Document restored successfully",
            });
        }
        catch (error) {
            console.error("Restore document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to restore document",
            });
        }
    }
    /**
     * Share document (update visibility and share token)
     */
    static async shareDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { visibility } = req.body;
            if (!['private', 'internal', 'public'].includes(visibility)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid visibility mode",
                });
                return;
            }
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found",
                });
                return;
            }
            let shareToken = document.shareToken;
            // Generate token if public and doesn't have one
            if (visibility === 'public') {
                if (!shareToken) {
                    shareToken = crypto_1.default.randomBytes(32).toString('hex');
                }
            }
            else {
                shareToken = null;
            }
            const updatedDocument = await database_1.prisma.document.update({
                where: { id },
                data: {
                    visibility,
                    shareToken,
                },
            });
            res.status(200).json({
                success: true,
                data: updatedDocument,
                message: `Document visibility updated to ${visibility}`,
            });
        }
        catch (error) {
            console.error("Share document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update sharing settings",
            });
        }
    }
    /**
     * Revoke sharing (set to private)
     */
    static async revokeShare(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found",
                });
                return;
            }
            await database_1.prisma.document.update({
                where: { id },
                data: {
                    visibility: 'private',
                    shareToken: null,
                },
            });
            res.status(200).json({
                success: true,
                message: "Document sharing revoked",
            });
        }
        catch (error) {
            console.error("Revoke share error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to revoke sharing",
            });
        }
    }
    /**
     * Get public document by share token
     */
    static async getPublicDocument(req, res) {
        try {
            const { token } = req.params;
            const document = await database_1.prisma.document.findFirst({
                where: {
                    shareToken: token,
                    visibility: 'public',
                    isDeleted: false,
                },
                include: {
                    documentHub: {
                        select: { name: true }
                    },
                    createdBy: {
                        select: { name: true }
                    }
                }
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Public document not found or access expired",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: document,
            });
        }
        catch (error) {
            console.error("Get public document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch public document",
            });
        }
    }
}
exports.DocumentHubController = DocumentHubController;
//# sourceMappingURL=documentHubController.js.map