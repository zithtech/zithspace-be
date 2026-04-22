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
            // Fetch accessible documents for this user
            const accessibleDocs = await database_1.prisma.document.findMany({
                where: {
                    documentHubId: id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                    OR: [
                        { visibility: "public" },
                        { createdById: req.user.id },
                    ],
                },
                select: { id: true },
            });
            const accessibleDocIds = accessibleDocs.map((doc) => doc.id);
            const documentHub = await database_1.prisma.documentHub.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                    OR: [
                        { visibility: "public" },
                        { createdById: req.user.id },
                    ],
                },
                include: {
                    treeNodes: {
                        where: {
                            isDeleted: false,
                            OR: [
                                { type: { not: "file" } },
                                { documentId: { in: accessibleDocIds } },
                            ],
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
            // If user is not the creator, prune empty folders/sections in the tree
            if (documentHub.createdById !== req.user.id) {
                const nodes = documentHub.treeNodes;
                const visibleNodeIds = new Set();
                const nodeMap = new Map();
                nodes.forEach(node => nodeMap.set(node.id, { ...node, children: [] }));
                // Link children
                nodes.forEach(node => {
                    if (node.parentId && nodeMap.has(node.parentId)) {
                        nodeMap.get(node.parentId).children.push(node.id);
                    }
                });
                const isNodeVisible = (nodeId) => {
                    const node = nodeMap.get(nodeId);
                    if (!node)
                        return false;
                    if (node.type === 'file') {
                        // Accessible file nodes are already filtered by the query, but double check
                        return !!node.documentId && accessibleDocIds.includes(node.documentId);
                    }
                    // For folder/section, visible if any child is visible
                    return node.children.some((childId) => isNodeVisible(childId));
                };
                const filteredNodes = nodes.filter(node => isNodeVisible(node.id));
                documentHub.treeNodes = filteredNodes;
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
                    OR: [
                        {
                            visibility: "public",
                        },
                        {
                            createdById: req.user.id,
                        },
                    ],
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
            // Check authorization (only creator can update private document)
            if (document.visibility === "private" &&
                document.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to update this private document",
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
            // Fetch all accessible document IDs in this tenant for the user
            const accessibleDocs = await database_1.prisma.document.findMany({
                where: {
                    tenantId: req.tenantId,
                    isDeleted: false,
                    OR: [
                        { visibility: "public" },
                        { createdById: req.user.id },
                    ],
                },
                select: { id: true },
            });
            const accessibleDocIds = accessibleDocs.map((doc) => doc.id);
            const documentHubs = await database_1.prisma.documentHub.findMany({
                where: {
                    tenantId: req.tenantId,
                    isDeleted: false,
                    OR: [
                        { visibility: "public" },
                        { createdById: req.user.id },
                    ],
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
                    documents: {
                        where: { isDeleted: false },
                        select: { visibility: true, createdById: true }
                    },
                    treeNodes: {
                        where: {
                            isDeleted: false,
                            OR: [
                                { type: { not: "file" } },
                                { documentId: { in: accessibleDocIds } },
                            ],
                        },
                        select: { id: true, type: true },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
            // Filter DocumentHubs based on requirement:
            // If total number of documents <= 0, hub should be visible only to creator.
            // If all documents are private, hub should be visible only to creator.
            const filteredDocumentHubs = documentHubs.filter((hub) => {
                if (hub.createdById === req.user.id)
                    return true;
                const docs = hub.documents || [];
                if (docs.length <= 0)
                    return false;
                const hasPublicDoc = docs.some((doc) => doc.visibility === "public");
                if (!hasPublicDoc)
                    return false;
                return true;
            });
            res.status(200).json({
                success: true,
                data: filteredDocumentHubs,
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
    static async updateDocumentHub(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { name } = req.body;
            if (!name || name.trim() === "") {
                res.status(400).json({
                    success: false,
                    error: "Document Hub Name is required",
                });
                return;
            }
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
            // Check authorization (only creator can rename hub for now)
            if (documentHub.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to rename this Document Hub",
                });
                return;
            }
            const updatedDocumentHub = await database_1.prisma.documentHub.update({
                where: { id },
                data: {
                    name,
                    updatedAt: new Date(),
                },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:updated", updatedDocumentHub);
            res.status(200).json({
                success: true,
                data: updatedDocumentHub,
                message: "Document Hub renamed successfully",
            });
        }
        catch (error) {
            console.error("Update document hub error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update document hub",
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
            // Use a transaction for atomic recursive deletion
            await database_1.prisma.$transaction(async (tx) => {
                await DocumentHubController.deleteNodeRecursive(tx, id, req.tenantId, req.user.id, node.type, node.documentId);
            });
            res.status(200).json({
                success: true,
                message: "Node and its contents moved to trash",
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
    static async deleteNodeRecursive(tx, // Prisma transaction client
    nodeId, tenantId, deletedById, nodeType, documentId) {
        // 1. Get all children of this node
        const children = await tx.documentTree.findMany({
            where: {
                parentId: nodeId,
                tenantId,
            },
        });
        // 2. Recursively delete each child
        for (const child of children) {
            await DocumentHubController.deleteNodeRecursive(tx, child.id, tenantId, deletedById, child.type, child.documentId);
        }
        // 3. Mark current node as deleted using updateMany for robustness
        await tx.documentTree.updateMany({
            where: { id: nodeId, tenantId },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedById,
            },
        });
        // 4. If it's a file with an associated document, mark the document as deleted too
        if (nodeType === "file" && documentId) {
            try {
                await tx.document.updateMany({
                    where: {
                        id: documentId,
                        tenantId,
                    },
                    data: {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedById,
                    },
                });
            }
            catch (error) {
                console.error(`Failed to soft-delete document ${documentId}:`, error);
                // We don't throw here to allow the tree node deletion to commit
            }
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
            // Check ownership
            if (document.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to delete this document",
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
            let docsFromTree = [];
            let folders = [];
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
                        project: {
                            select: { id: true, name: true, code: true },
                        },
                    },
                    orderBy: {
                        deletedAt: "desc",
                    },
                });
            }
            if (!type || type === "document" || type === "folder") {
                // Fetch all deleted nodes to filter root ones
                const allDeletedNodes = await database_1.prisma.documentTree.findMany({
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
                        // For files, we need the document details
                    },
                });
                // Identify root level deleted items (parent is not deleted)
                const rootDeletedNodes = allDeletedNodes.filter(node => {
                    if (!node.parentId)
                        return true;
                    return !allDeletedNodes.some(n => n.id === node.parentId);
                });
                // Separate into documents and folders
                for (const node of rootDeletedNodes) {
                    if (node.type === "file") {
                        const doc = await database_1.prisma.document.findUnique({
                            where: { id: node.documentId || '' },
                            include: {
                                deletedBy: { select: { id: true, name: true } },
                                documentHub: { select: { id: true, name: true } }
                            }
                        });
                        if (doc)
                            docsFromTree.push(doc);
                    }
                    else {
                        folders.push(node);
                    }
                }
            }
            res.status(200).json({
                success: true,
                data: { hubs, documents: docsFromTree, folders },
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
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found in trash",
                });
                return;
            }
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
     * Restore tree node (folder/section)
     */
    static async restoreTreeNode(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { documentHubId, parentId } = req.body;
            if (!documentHubId) {
                res.status(400).json({
                    success: false,
                    error: "Target Document Hub ID is required",
                });
                return;
            }
            const node = await database_1.prisma.documentTree.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: true,
                },
            });
            if (!node) {
                res.status(404).json({
                    success: false,
                    error: "Folder/Section not found in trash",
                });
                return;
            }
            // Use a transaction for atomic recursive restoration
            await database_1.prisma.$transaction(async (tx) => {
                // Restore recursively and move to target hub
                await DocumentHubController.restoreNodeRecursive(tx, id, req.tenantId, documentHubId, parentId || null // Move the root of the restored branch to the selected parent
                );
            });
            res.status(200).json({
                success: true,
                message: "Folder and its contents restored successfully",
            });
        }
        catch (error) {
            console.error("Restore tree node error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to restore folder/section",
            });
        }
    }
    static async restoreNodeRecursive(tx, nodeId, tenantId, documentHubId, parentId = null) {
        // 1. Get the current node to know its type and documentId
        const node = await tx.documentTree.findUnique({
            where: { id: nodeId }
        });
        if (!node)
            return;
        // 2. Restore current node and update its hub and parent
        await tx.documentTree.update({
            where: { id: nodeId },
            data: {
                isDeleted: false,
                deletedAt: null,
                deletedById: null,
                documentHubId,
                parentId,
            },
        });
        // 3. If it's a file, restore the document and update its hub
        if (node.type === "file" && node.documentId) {
            await tx.document.update({
                where: { id: node.documentId },
                data: {
                    isDeleted: false,
                    deletedAt: null,
                    deletedById: null,
                    documentHubId,
                },
            });
        }
        // 4. Find all deleted children that WERE deleted (presumably as part of this branch)
        const children = await tx.documentTree.findMany({
            where: {
                parentId: nodeId,
                tenantId,
                isDeleted: true, // Only restore those that are currently deleted
            },
        });
        // 5. Recursively restore children, keeping the hierarchy but updating the hub
        for (const child of children) {
            await DocumentHubController.restoreNodeRecursive(tx, child.id, tenantId, documentHubId, nodeId // Keep as child of the current restored node
            );
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
            if (!['private', 'public'].includes(visibility)) {
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
            // Check ownership
            if (document.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to change sharing settings",
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
            // Check ownership
            if (document.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to revoke sharing",
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
                        select: {
                            name: true,
                            shareToken: true,
                            visibility: true
                        }
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
    /**
     * Share entire document hub
     */
    static async shareDocumentHub(req, res) {
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
            if (!['private', 'public'].includes(visibility)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid visibility mode",
                });
                return;
            }
            const hub = await database_1.prisma.documentHub.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!hub) {
                res.status(404).json({
                    success: false,
                    error: "Document Hub not found",
                });
                return;
            }
            // Check ownership
            if (hub.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to change sharing settings",
                });
                return;
            }
            let shareToken = hub.shareToken;
            // Generate token if public and doesn't have one
            if (visibility === 'public') {
                if (!shareToken) {
                    shareToken = crypto_1.default.randomBytes(32).toString('hex');
                }
            }
            else {
                shareToken = null;
            }
            const updatedHub = await database_1.prisma.documentHub.update({
                where: { id },
                data: {
                    visibility: visibility,
                    shareToken: shareToken,
                },
            });
            res.status(200).json({
                success: true,
                data: updatedHub,
            });
        }
        catch (error) {
            console.error("Share document hub error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update hub sharing settings",
            });
        }
    }
    /**
     * Revoke document hub sharing
     */
    static async revokeHubShare(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const hub = await database_1.prisma.documentHub.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
            });
            if (!hub) {
                res.status(404).json({
                    success: false,
                    error: "Document Hub not found",
                });
                return;
            }
            // Check ownership
            if (hub.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to revoke sharing",
                });
                return;
            }
            await database_1.prisma.documentHub.update({
                where: { id },
                data: {
                    visibility: 'private',
                    shareToken: null,
                },
            });
            res.status(200).json({
                success: true,
                message: "Hub sharing revoked",
            });
        }
        catch (error) {
            console.error("Revoke hub share error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to revoke hub sharing",
            });
        }
    }
    /**
     * Get public document hub by share token
     */
    static async getPublicDocumentHub(req, res) {
        try {
            const { token } = req.params;
            const hub = await database_1.prisma.documentHub.findFirst({
                where: {
                    shareToken: token,
                    visibility: 'public',
                    isDeleted: false,
                },
                include: {
                    createdBy: {
                        select: { name: true }
                    },
                    treeNodes: {
                        where: { isDeleted: false },
                        orderBy: { position: "asc" }
                    }
                }
            });
            if (!hub) {
                res.status(404).json({
                    success: false,
                    error: "Public hub not found or access expired",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: hub,
            });
        }
        catch (error) {
            console.error("Get public hub error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch public hub",
            });
        }
    }
    /**
     * Get content of a document within a public hub
     */
    static async getPublicHubDocumentContent(req, res) {
        try {
            const { token, documentId } = req.params;
            // 1. Verify the hub exists and is public
            const hub = await database_1.prisma.documentHub.findFirst({
                where: {
                    shareToken: token,
                    visibility: 'public',
                    isDeleted: false,
                },
            });
            if (!hub) {
                res.status(404).json({
                    success: false,
                    error: "Public hub not found or access expired",
                });
                return;
            }
            // 2. Verify the document belongs to this hub
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id: documentId,
                    documentHubId: hub.id,
                    isDeleted: false,
                },
                include: {
                    createdBy: {
                        select: { name: true }
                    }
                }
            });
            if (!document) {
                res.status(404).json({
                    success: false,
                    error: "Document not found in this hub",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: document,
            });
        }
        catch (error) {
            console.error("Get public hub document content error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch document content",
            });
        }
    }
}
exports.DocumentHubController = DocumentHubController;
//# sourceMappingURL=documentHubController.js.map