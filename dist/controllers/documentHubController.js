"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentHubController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const socketService_1 = require("@/services/socketService");
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
                        where: {
                            isDeleted: false,
                        },
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
                    document: {
                        isDeleted: false
                    }
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
                        select: { id: true, type: true, title: true },
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
                message: "Document Hub restored",
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
            await database_1.prisma.$transaction(async (tx) => {
                // Soft delete document
                await tx.document.update({
                    where: { id },
                    data: {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedById: req.user.id,
                    },
                });
                // Soft delete associated tree node if exists
                const treeNode = await tx.documentTree.findUnique({
                    where: { documentId: id },
                });
                if (treeNode) {
                    await tx.documentTree.update({
                        where: { id: treeNode.id },
                        data: {
                            isDeleted: true,
                            deletedAt: new Date(),
                            deletedById: req.user.id,
                        },
                    });
                }
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
                error: `Failed to delete document: ${error.message}`,
            });
        }
    }
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
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found in trash",
                });
                return;
            }
            await database_1.prisma.$transaction(async (tx) => {
                await tx.document.update({
                    where: { id },
                    data: {
                        isDeleted: false,
                        deletedAt: null,
                        deletedById: null,
                    },
                });
                const treeNode = await tx.documentTree.findFirst({
                    where: { documentId: id },
                });
                if (treeNode) {
                    await tx.documentTree.update({
                        where: { id: treeNode.id },
                        data: {
                            isDeleted: false,
                            deletedAt: null,
                            deletedById: null,
                        },
                    });
                }
            });
            res.status(200).json({
                success: true,
                message: "Document restored",
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
    static async getTrash(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const deletedHubs = await database_1.prisma.documentHub.findMany({
                where: {
                    tenantId: req.tenantId,
                    isDeleted: true,
                },
                include: {
                    deletedBy: {
                        select: { id: true, name: true },
                    },
                    project: {
                        select: { id: true, name: true },
                    },
                },
                orderBy: {
                    deletedAt: "desc",
                },
            });
            const deletedDocuments = await database_1.prisma.document.findMany({
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
            const response = {
                hubs: deletedHubs,
                documents: deletedDocuments,
            };
            res.status(200).json({
                success: true,
                data: response,
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
    // ========== DOCUMENT SHARING ==========
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
            if (!visibility || !["private", "internal", "public"].includes(visibility)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid visibility. Must be one of: private, internal, public",
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
            const updateData = {
                visibility,
                sharedById: req.user.id,
                sharedAt: new Date(),
            };
            // Generate a share token for public documents
            if (visibility === "public") {
                // Only generate a new token if one doesn't exist
                if (!document.shareToken) {
                    updateData.shareToken = crypto.randomUUID();
                }
            }
            else {
                // Clear share token for non-public visibility
                updateData.shareToken = null;
            }
            const updatedDocument = await database_1.prisma.document.update({
                where: { id },
                data: updateData,
                select: {
                    id: true,
                    visibility: true,
                    shareToken: true,
                    sharedAt: true,
                    sharedBy: {
                        select: { id: true, name: true },
                    },
                },
            });
            res.status(200).json({
                success: true,
                data: updatedDocument,
                message: `Document visibility set to ${visibility}`,
            });
        }
        catch (error) {
            console.error("Share document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to share document",
            });
        }
    }
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
                    visibility: "private",
                    shareToken: null,
                    sharedById: null,
                    sharedAt: null,
                },
            });
            res.status(200).json({
                success: true,
                message: "Document sharing revoked. Set to private.",
            });
        }
        catch (error) {
            console.error("Revoke share error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to revoke share",
            });
        }
    }
    static async getPublicDocument(req, res) {
        try {
            const { shareToken } = req.params;
            if (!shareToken) {
                res.status(400).json({
                    success: false,
                    error: "Share token is required",
                });
                return;
            }
            const document = await database_1.prisma.document.findFirst({
                where: {
                    shareToken,
                    visibility: "public",
                    isDeleted: false,
                },
                select: {
                    id: true,
                    title: true,
                    content: true,
                    visibility: true,
                    createdAt: true,
                    updatedAt: true,
                    createdBy: {
                        select: { name: true },
                    },
                    documentHub: {
                        select: { name: true },
                    },
                },
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found or not publicly shared",
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
                error: "Failed to get public document",
            });
        }
    }
}
exports.DocumentHubController = DocumentHubController;
//# sourceMappingURL=documentHubController.js.map