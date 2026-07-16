"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentHubController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const socketService_1 = require("@/services/socketService");
const aiDocumentService_1 = require("@/services/aiDocumentService");
const puppeteer_1 = __importDefault(require("puppeteer"));
const crypto_1 = __importDefault(require("crypto"));
const transactionHistory_1 = require("@/utils/transactionHistory");
const generateHtmlFromBlocks = (blocks) => {
    let html = "";
    for (const block of blocks) {
        if (!block.type)
            continue;
        let contentHtml = "";
        if (Array.isArray(block.content)) {
            contentHtml = block.content
                .map((c) => {
                let text = c.text || "";
                if (c.styles) {
                    if (c.styles.bold)
                        text = `<strong>${text}</strong>`;
                    if (c.styles.italic)
                        text = `<em>${text}</em>`;
                    if (c.styles.underline)
                        text = `<u>${text}</u>`;
                    if (c.styles.strike)
                        text = `<s>${text}</s>`;
                    if (c.styles.code)
                        text = `<code>${text}</code>`;
                }
                if (c.type === "link") {
                    text = `<a href="${c.href}">${text}</a>`;
                }
                return text;
            })
                .join("");
        }
        else if (typeof block.content === "string") {
            contentHtml = block.content;
        }
        switch (block.type) {
            case "paragraph":
                html += `<p>${contentHtml}</p>`;
                break;
            case "heading":
                const level = block.props?.level || 1;
                html += `<h${level}>${contentHtml}</h${level}>`;
                break;
            case "bulletListItem":
                html += `<li>${contentHtml}</li>`; // Ideally wrapped in <ul> but this works for basic rendering
                break;
            case "numberedListItem":
                html += `<li>${contentHtml}</li>`; // Ideally wrapped in <ol>
                break;
            default:
                html += `<p>${contentHtml}</p>`;
                break;
        }
        if (block.children && block.children.length > 0) {
            html += `<div style="margin-left: 20px;">${generateHtmlFromBlocks(block.children)}</div>`;
        }
    }
    return html;
};
class DocumentHubController {
    /**
     * Generate a documentation draft from a free-form prompt.
     * Returns { hubName, fileTitle, contentHtml }. Does NOT persist anything —
     * the client makes follow-up calls to create the hub and write the file.
     */
    static async aiGenerateDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { prompt } = req.body;
            const seed = (prompt || "").trim();
            if (!seed || seed.length < 5) {
                res.status(400).json({
                    success: false,
                    error: "Prompt is required (min 5 characters)",
                });
                return;
            }
            if (seed.length > 8000) {
                res.status(400).json({
                    success: false,
                    error: "Prompt is too long (max 8000 characters)",
                });
                return;
            }
            const { draft, source, fallbackReason } = await (0, aiDocumentService_1.generateDocumentDraft)(seed);
            res.status(200).json({
                success: true,
                data: { ...draft, source, fallbackReason },
                message: "Document draft generated",
            });
        }
        catch (error) {
            console.error("AI generate document error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to generate document draft",
            });
        }
    }
    /**
     * Rewrite a selected excerpt of a document according to a user instruction.
     * Used by the inline Zai menu in the editor when a user selects text.
     * Does NOT persist anything — the client applies the result.
     */
    static async aiRewriteSelection(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { text, instruction } = req.body;
            const cleanText = (text || "").trim();
            const cleanInstruction = (instruction || "").trim();
            if (!cleanText || cleanText.length < 2) {
                res.status(400).json({
                    success: false,
                    error: "Selected text is required (min 2 characters)",
                });
                return;
            }
            if (cleanText.length > 8000) {
                res.status(400).json({
                    success: false,
                    error: "Selected text is too long (max 8000 characters)",
                });
                return;
            }
            if (!cleanInstruction || cleanInstruction.length < 2) {
                res.status(400).json({
                    success: false,
                    error: "Instruction is required",
                });
                return;
            }
            if (cleanInstruction.length > 500) {
                res.status(400).json({
                    success: false,
                    error: "Instruction is too long (max 500 characters)",
                });
                return;
            }
            const result = await (0, aiDocumentService_1.rewriteSelection)(cleanText, cleanInstruction);
            res.status(200).json({
                success: true,
                data: result,
                message: "Selection rewritten",
            });
        }
        catch (error) {
            console.error("AI rewrite selection error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to rewrite selection",
            });
        }
    }
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
            const { name, projectId, ticketId, visibility: bodyVisibility, source: bodySource } = req.body ?? {};
            const visibility = bodyVisibility || 'public';
            // FE passes `source: "ai"` when the hub was generated through Zai.
            // Anything else (including omitted) is treated as a manual creation.
            const creationSource = bodySource === "ai" ? "ai" : "manual";
            let hubShareToken = null;
            if (visibility === 'public') {
                hubShareToken = crypto_1.default.randomBytes(32).toString('hex');
            }
            // Validate required fields
            if (!name || name.trim() === "") {
                res.status(400).json({
                    success: false,
                    error: "Document HUb Name is required",
                });
                return;
            }
            // Check if a document hub with the same name already exists
            const existingHub = await database_1.prisma.documentHub.findFirst({
                where: {
                    tenantId: req.tenantId,
                    name: name.trim(),
                    isDeleted: false,
                },
            });
            if (existingHub) {
                res.status(400).json({
                    success: false,
                    error: "This hub name already exists.",
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
                    visibility: visibility,
                    shareToken: hubShareToken,
                },
                include: {
                    createdBy: {
                        select: { id: true, name: true, workEmail: true, avatarUrl: true },
                    },
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                },
            });
            let docShareToken = null;
            if (visibility === 'public') {
                docShareToken = crypto_1.default.randomBytes(32).toString('hex');
            }
            // Create "Overview" document
            const doc = await database_1.prisma.document.create({
                data: {
                    tenantId: req.tenantId,
                    documentHubId: documentHub.id,
                    title: "Overview",
                    content: [
                        {
                            id: "overview-heading",
                            type: "heading",
                            props: { level: 1, textColor: "default", backgroundColor: "default", textAlignment: "left" },
                            content: [{ type: "text", text: "Overview", styles: {} }],
                            children: [],
                        },
                        {
                            id: "overview-p1",
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
                    visibility: visibility,
                    shareToken: docShareToken,
                },
            });
            const documentTree = await database_1.prisma.documentTree.create({
                data: {
                    tenantId: req.tenantId,
                    documentHubId: documentHub.id,
                    createdById: req.user.id,
                    title: "Overview",
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
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.DOCUMENT_HUB,
                page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Document hub created${creationSource === "ai" ? " via Zai" : ""}`,
                entityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                entityId: documentHub.id,
                entityLabel: documentHub.name,
                parentEntityType: projectId ? transactionHistory_1.EntityType.PROJECT : null,
                parentEntityId: projectId ?? null,
                afterData: {
                    name: documentHub.name,
                    visibility,
                    projectId,
                    ticketId,
                },
                metadata: { source: creationSource },
                statusCode: 201,
            });
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
                    ticket: {
                        select: { id: true, title: true, status: true, ticketNumber: true },
                    },
                    createdBy: {
                        select: { id: true, name: true, workEmail: true, avatarUrl: true },
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
            const { documentHubId, parentId, type, title, source: bodySource } = req.body;
            const creationSource = bodySource === "ai" ? "ai" : "manual";
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
            // Create document for all node types (files, folders, sections) so they can all have editable content
            const doc = await database_1.prisma.document.create({
                data: {
                    tenantId: req.tenantId,
                    documentHubId,
                    title,
                    content: [], // Default empty content for Blocknote
                    createdById: req.user.id,
                    visibility: "public",
                    shareToken: crypto_1.default.randomBytes(32).toString("hex"),
                },
            });
            let documentId = doc.id;
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
            // Update parent hub's updatedAt
            await database_1.prisma.documentHub.update({
                where: { id: documentHubId },
                data: { updatedAt: new Date() },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:node_created", newNode);
            // Look up the hub name so the activity row reads "<thing> in <Hub Name>"
            const hubForLog = await database_1.prisma.documentHub.findUnique({
                where: { id: documentHubId },
                select: { name: true },
            });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.DOCUMENT_HUB,
                page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Document ${type} created${creationSource === "ai" ? " via Zai" : ""}${hubForLog?.name ? ` in ${hubForLog.name}` : ""}`,
                entityType: type === "file" ? transactionHistory_1.EntityType.DOCUMENT : transactionHistory_1.EntityType.DOCUMENT_TREE_NODE,
                entityId: type === "file" ? documentId : newNode.id,
                entityLabel: title,
                parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                parentEntityId: documentHubId,
                afterData: { title, type, parentId: parentId || null },
                metadata: { source: creationSource, hubName: hubForLog?.name ?? null },
                statusCode: 201,
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
            const { title, parentId } = req.body;
            // Either title OR a parentId update must be supplied.
            if (title === undefined && parentId === undefined) {
                res.status(400).json({
                    success: false,
                    error: "Provide title or parentId to update",
                });
                return;
            }
            const node = await database_1.prisma.documentTree.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
                include: { documentHub: { select: { name: true } } },
            });
            if (!node) {
                res.status(404).json({
                    success: false,
                    error: "Node not found",
                });
                return;
            }
            // --- Validate parentId move (drag-drop) ---
            if (parentId !== undefined) {
                if (parentId === id) {
                    res.status(400).json({
                        success: false,
                        error: "Cannot move a node into itself",
                    });
                    return;
                }
                if (parentId !== null) {
                    const parent = await database_1.prisma.documentTree.findFirst({
                        where: {
                            id: parentId,
                            tenantId: req.tenantId,
                            isDeleted: false,
                        },
                    });
                    if (!parent) {
                        res.status(404).json({
                            success: false,
                            error: "Parent node not found",
                        });
                        return;
                    }
                    if (parent.documentHubId !== node.documentHubId) {
                        res.status(400).json({
                            success: false,
                            error: "Cannot move a node across hubs",
                        });
                        return;
                    }
                    // Files can't host children, only folders/sections.
                    if (parent.type === "file") {
                        res.status(400).json({
                            success: false,
                            error: "Files cannot contain other items",
                        });
                        return;
                    }
                    // Cycle check: walk the parent chain — `id` must not appear.
                    let cursor = parent;
                    while (cursor) {
                        if (cursor.id === id) {
                            res.status(400).json({
                                success: false,
                                error: "Cannot move a folder into one of its descendants",
                            });
                            return;
                        }
                        if (!cursor.parentId)
                            break;
                        cursor = await database_1.prisma.documentTree.findFirst({
                            where: {
                                id: cursor.parentId,
                                tenantId: req.tenantId,
                                isDeleted: false,
                            },
                        });
                    }
                }
            }
            const updateData = {};
            if (title !== undefined)
                updateData.title = title;
            if (parentId !== undefined)
                updateData.parentId = parentId;
            const updatedNode = await database_1.prisma.documentTree.update({
                where: { id },
                data: updateData,
            });
            // If it's a file and has a documentId, update the document title too
            if (title !== undefined &&
                node.type === "file" &&
                node.documentId) {
                await database_1.prisma.document.update({
                    where: { id: node.documentId },
                    data: { title },
                });
            }
            // Update parent hub's updatedAt
            await database_1.prisma.documentHub.update({
                where: { id: node.documentHubId },
                data: { updatedAt: new Date() },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:node_updated", updatedNode);
            {
                const before = {};
                const after = {};
                if (title !== undefined) {
                    before.title = node.title;
                    after.title = updatedNode.title;
                }
                if (parentId !== undefined) {
                    before.parentId = node.parentId;
                    after.parentId = updatedNode.parentId;
                }
                const diff = (0, transactionHistory_1.diffShallow)(before, after);
                if (diff.changedFields.length > 0) {
                    const hubName = node.documentHub?.name;
                    const inHub = hubName ? ` in ${hubName}` : "";
                    (0, transactionHistory_1.recordTransaction)({
                        req,
                        section: transactionHistory_1.Section.WORK,
                        module: transactionHistory_1.Module.DOCUMENT_HUB,
                        page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                        action: parentId !== undefined ? transactionHistory_1.Action.MOVE : transactionHistory_1.Action.UPDATE,
                        actionLabel: `Document ${node.type} ${parentId !== undefined ? "moved" : "updated"}${inHub}${diff.changedFields.length ? ` (${diff.changedFields.join(", ")})` : ""}`,
                        entityType: node.type === "file" ? transactionHistory_1.EntityType.DOCUMENT : transactionHistory_1.EntityType.DOCUMENT_TREE_NODE,
                        entityId: node.type === "file" && node.documentId ? node.documentId : node.id,
                        entityLabel: updatedNode.title,
                        parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                        parentEntityId: node.documentHubId,
                        beforeData: diff.before,
                        afterData: diff.after,
                        changedFields: diff.changedFields,
                        metadata: hubName ? { hubName } : null,
                        statusCode: 200,
                    });
                }
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
            const { content, title, expectedVersion } = req.body;
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    isDeleted: false,
                },
                include: { documentHub: { select: { name: true } } },
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
            // Optimistic concurrency: when the client sends an expectedVersion, refuse
            // the write if it doesn't match the current row. The frontend autosave
            // pipeline uses this to halt and prompt the user instead of silently
            // overwriting changes from a concurrent editor / browser tab.
            if (expectedVersion !== undefined &&
                expectedVersion !== null &&
                document.version !== expectedVersion) {
                res.status(409).json({
                    success: false,
                    error: "Document was modified by another session",
                    data: {
                        currentVersion: document.version,
                        expectedVersion,
                        document,
                    },
                });
                return;
            }
            // Atomic version check + bump in a single SQL statement so two concurrent
            // requests can't both pass the check above and then both overwrite.
            // updateMany returns the affected row count; 0 means somebody else won.
            const writeWhere = { id, tenantId: req.tenantId };
            if (expectedVersion !== undefined && expectedVersion !== null) {
                writeWhere.version = expectedVersion;
            }
            const updateResult = await database_1.prisma.document.updateMany({
                where: writeWhere,
                data: {
                    ...(content !== undefined ? { content } : {}),
                    ...(title !== undefined ? { title } : {}),
                    version: { increment: 1 },
                    updatedAt: new Date(),
                },
            });
            if (updateResult.count === 0) {
                // Race lost — someone updated the document between our read and write.
                const fresh = await database_1.prisma.document.findFirst({
                    where: { id, tenantId: req.tenantId, isDeleted: false },
                });
                res.status(409).json({
                    success: false,
                    error: "Document was modified by another session",
                    data: {
                        currentVersion: fresh ? fresh.version : null,
                        expectedVersion,
                        document: fresh,
                    },
                });
                return;
            }
            const updatedDocument = await database_1.prisma.document.findFirst({
                where: { id, tenantId: req.tenantId },
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
            // Update parent hub's updatedAt
            await database_1.prisma.documentHub.update({
                where: { id: document.documentHubId },
                data: { updatedAt: new Date() },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:document_updated", updatedDocument);
            // Audit log: only log structural changes. Content-only edits already
            // generate a `document_history` row per save and would flood the
            // activity feed otherwise. We log when the title changes.
            if (title !== undefined && title !== document.title) {
                const hubName = document.documentHub?.name;
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_DETAIL,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Document renamed${hubName ? ` in ${hubName}` : ""}`,
                    entityType: transactionHistory_1.EntityType.DOCUMENT,
                    entityId: id,
                    entityLabel: title,
                    parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    parentEntityId: document.documentHubId,
                    beforeData: { title: document.title },
                    afterData: { title },
                    changedFields: ["title"],
                    metadata: hubName ? { hubName } : null,
                    statusCode: 200,
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
    /**
     * Star a document hub for the current user (raw SQL — no Prisma model).
     * Idempotent: a duplicate (user, hub) pair is a no-op.
     */
    static async starDocumentHub(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id: hubId } = req.params;
            // Verify the hub exists and belongs to this tenant before recording a
            // star against it.
            // The Prisma-managed `document_hub` table stores id/tenantId as TEXT,
            // not UUID — so do NOT cast the parameters here.
            const hubRows = await database_1.prisma.$queryRaw `
        SELECT id FROM document_hub
        WHERE id = ${hubId}
          AND "tenantId" = ${req.tenantId}
          AND (is_deleted = false OR is_deleted IS NULL)
        LIMIT 1
      `;
            if (!hubRows.length) {
                res.status(404).json({
                    success: false,
                    error: "Document hub not found",
                });
                return;
            }
            // Generate the UUID in Node so we don't depend on the pgcrypto extension
            // being enabled on the database.
            const newId = crypto_1.default.randomUUID();
            await database_1.prisma.$executeRaw `
        INSERT INTO document_hub_stars (id, user_id, hub_id, tenant_id)
        VALUES (
          ${newId}::uuid,
          ${req.user.id}::uuid,
          ${hubId}::uuid,
          ${req.tenantId}::uuid
        )
        ON CONFLICT (user_id, hub_id) DO NOTHING
      `;
            res.status(200).json({
                success: true,
                message: "Hub starred",
            });
        }
        catch (error) {
            console.error("Star hub error:", error?.message || error, error?.code);
            res.status(500).json({
                success: false,
                error: error?.message || "Failed to star hub",
            });
        }
    }
    /**
     * Remove the current user's star from a document hub (raw SQL).
     */
    static async unstarDocumentHub(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id: hubId } = req.params;
            await database_1.prisma.$executeRaw `
        DELETE FROM document_hub_stars
        WHERE user_id = ${req.user.id}::uuid
          AND hub_id  = ${hubId}::uuid
          AND tenant_id = ${req.tenantId}::uuid
      `;
            res.status(200).json({
                success: true,
                message: "Hub unstarred",
            });
        }
        catch (error) {
            console.error("Unstar hub error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to unstar hub",
            });
        }
    }
    /**
     * Delete a single version from a document's history. Uses a raw SQL DELETE
     * (with parameterised values) to keep the query explicit and side-effect-
     * free. The latest version is protected — that's the live document; the
     * client should call the document-delete endpoint instead.
     */
    static async deleteDocumentHistoryEntry(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id: documentId, historyId } = req.params;
            // The Prisma-managed `document_history` table stores id/documentId/
            // tenantId as TEXT — do NOT cast the parameters to ::uuid.
            const rows = await database_1.prisma.$queryRaw `
          SELECT id, "createdAt" AS created_at
          FROM document_history
          WHERE id = ${historyId}
            AND "documentId" = ${documentId}
            AND "tenantId" = ${req.tenantId}
          LIMIT 1
        `;
            if (!rows.length) {
                res.status(404).json({
                    success: false,
                    error: "History entry not found",
                });
                return;
            }
            // Refuse to delete the most-recent version — it represents the live
            // document state and removing it would leave the doc in an inconsistent
            // history.
            const latest = await database_1.prisma.$queryRaw `
        SELECT id
        FROM document_history
        WHERE "documentId" = ${documentId}
          AND "tenantId" = ${req.tenantId}
        ORDER BY "createdAt" DESC
        LIMIT 1
      `;
            if (latest.length && latest[0].id === historyId) {
                res.status(400).json({
                    success: false,
                    error: "Cannot delete the latest version",
                });
                return;
            }
            await database_1.prisma.$executeRaw `
        DELETE FROM document_history
        WHERE id = ${historyId}
          AND "documentId" = ${documentId}
          AND "tenantId" = ${req.tenantId}
      `;
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.DOCUMENT_HUB,
                page: transactionHistory_1.Page.DOCUMENT_DETAIL,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: "Document version deleted",
                entityType: transactionHistory_1.EntityType.DOCUMENT_HISTORY_ENTRY,
                entityId: historyId,
                parentEntityType: transactionHistory_1.EntityType.DOCUMENT,
                parentEntityId: documentId,
                metadata: { versionCreatedAt: rows[0]?.created_at },
                statusCode: 200,
            });
            res.status(200).json({
                success: true,
                message: "Version deleted",
            });
        }
        catch (error) {
            console.error("Delete history entry error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete version",
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
                            avatarUrl: true,
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
            // Optional ticketId filter — used by the ticket detail drawer to list
            // hubs linked to a specific ticket. Trim and validate as UUID-ish so
            // a typo doesn't drop us into a query that surprisingly returns all rows.
            const ticketIdFilter = typeof req.query.ticketId === "string" && req.query.ticketId.trim()
                ? req.query.ticketId.trim()
                : undefined;
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
                    ...(ticketIdFilter ? { ticketId: ticketIdFilter } : {}),
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
                        select: { id: true, name: true, workEmail: true, avatarUrl: true },
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
                        select: { id: true, type: true, title: true, parentId: true, position: true },
                        orderBy: { position: "asc" },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
            const filteredDocumentHubs = documentHubs;
            // Fetch this user's stars in one shot via raw SQL and decorate the
            // hubs with `isStarred`.
            const starredRows = await database_1.prisma.$queryRaw `
        SELECT hub_id FROM document_hub_stars
        WHERE user_id = ${req.user.id}::uuid
          AND tenant_id = ${req.tenantId}::uuid
      `;
            const starredSet = new Set(starredRows.map((r) => r.hub_id));
            const enrichedHubs = filteredDocumentHubs.map((hub) => ({
                ...hub,
                isStarred: starredSet.has(hub.id),
            }));
            res.status(200).json({
                success: true,
                data: enrichedHubs,
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
            const isPermanent = req.query.permanent === 'true';
            const documentHub = await database_1.prisma.documentHub.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    ...(isPermanent ? {} : { isDeleted: false }),
                },
            });
            if (!documentHub) {
                res.status(404).json({
                    success: false,
                    error: "Document Hub not found",
                });
                return;
            }
            if (isPermanent) {
                await database_1.prisma.$transaction(async (tx) => {
                    await tx.$executeRaw `DELETE FROM document_hub_stars WHERE hub_id = ${id}::uuid`;
                    await tx.documentTree.deleteMany({ where: { documentHubId: id } });
                    await tx.$executeRaw `DELETE FROM document_history WHERE "documentId" IN (SELECT id FROM documents WHERE "documentHubId" = ${id})`;
                    await tx.document.deleteMany({ where: { documentHubId: id } });
                    await tx.documentHub.delete({ where: { id } });
                });
                socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:deleted", { id, permanent: true });
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                    action: transactionHistory_1.Action.PERMANENT_DELETE,
                    actionLabel: "Document hub permanently deleted",
                    entityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    entityId: id,
                    entityLabel: documentHub.name,
                    statusCode: 200,
                });
                res.status(200).json({
                    success: true,
                    message: "Document Hub permanently deleted",
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
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.DOCUMENT_HUB,
                page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: "Document hub moved to trash",
                entityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                entityId: id,
                entityLabel: documentHub.name,
                beforeData: { isDeleted: false },
                afterData: { isDeleted: true },
                changedFields: ["isDeleted"],
                metadata: { softDelete: true },
                statusCode: 200,
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
            const { name, projectId, ticketId } = req.body;
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
            // Check authorization (only creator can update hub for now)
            if (documentHub.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "You don't have permission to update this Document Hub",
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
            const updateData = {
                updatedAt: new Date(),
            };
            if (name !== undefined) {
                if (name.trim() === "") {
                    throw new types_1.ValidationError("Document Hub Name cannot be empty");
                }
                updateData.name = name;
            }
            if (projectId !== undefined) {
                updateData.projectId = projectId;
            }
            if (ticketId !== undefined) {
                updateData.ticketId = ticketId;
            }
            const updatedDocumentHub = await database_1.prisma.documentHub.update({
                where: { id },
                data: updateData,
                include: {
                    project: {
                        select: { id: true, name: true, code: true },
                    },
                    ticket: {
                        select: { id: true, title: true, status: true, ticketNumber: true },
                    },
                    createdBy: {
                        select: { id: true, name: true, workEmail: true, avatarUrl: true },
                    },
                }
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:updated", updatedDocumentHub);
            {
                const before = {};
                const after = {};
                if (name !== undefined) {
                    before.name = documentHub.name;
                    after.name = updatedDocumentHub.name;
                }
                if (projectId !== undefined) {
                    before.projectId = documentHub.projectId;
                    after.projectId = updatedDocumentHub.projectId;
                }
                if (ticketId !== undefined) {
                    before.ticketId = documentHub.ticketId;
                    after.ticketId = updatedDocumentHub.ticketId;
                }
                const diff = (0, transactionHistory_1.diffShallow)(before, after);
                if (diff.changedFields.length > 0) {
                    (0, transactionHistory_1.recordTransaction)({
                        req,
                        section: transactionHistory_1.Section.WORK,
                        module: transactionHistory_1.Module.DOCUMENT_HUB,
                        page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                        action: transactionHistory_1.Action.UPDATE,
                        actionLabel: `Document hub updated (${diff.changedFields.join(", ")})`,
                        entityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                        entityId: id,
                        entityLabel: updatedDocumentHub.name,
                        beforeData: diff.before,
                        afterData: diff.after,
                        changedFields: diff.changedFields,
                        statusCode: 200,
                    });
                }
            }
            res.status(200).json({
                success: true,
                data: updatedDocumentHub,
                debug: {
                    receivedTicketId: ticketId,
                    updatedAt: updateData.updatedAt
                },
                message: "Document Hub updated successfully",
            });
        }
        catch (error) {
            console.error("Update document hub error:", error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
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
            const isPermanent = req.query.permanent === 'true';
            const node = await database_1.prisma.documentTree.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    ...(isPermanent ? {} : { isDeleted: false }),
                },
                include: { documentHub: { select: { name: true } } },
            });
            if (!node) {
                res.status(404).json({
                    success: false,
                    error: "Node not found",
                });
                return;
            }
            // Check ownership
            if (node.createdById !== req.user.id) {
                res.status(403).json({
                    success: false,
                    error: "Only authorized users can delete this item",
                });
                return;
            }
            // Use a transaction for atomic recursive deletion
            await database_1.prisma.$transaction(async (tx) => {
                await DocumentHubController.deleteNodeRecursive(tx, id, req.tenantId, req.user.id, node.type, node.documentId, isPermanent);
            });
            // Update parent hub's updatedAt
            await database_1.prisma.documentHub.update({
                where: { id: node.documentHubId },
                data: { updatedAt: new Date() },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:node_deleted", { id });
            {
                const hubName = node.documentHub?.name;
                const inHub = hubName ? ` from ${hubName}` : "";
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                    action: isPermanent ? transactionHistory_1.Action.PERMANENT_DELETE : transactionHistory_1.Action.DELETE,
                    actionLabel: `Document ${node.type} ${isPermanent ? "permanently deleted" : "moved to trash"}${inHub}`,
                    entityType: node.type === "file" ? transactionHistory_1.EntityType.DOCUMENT : transactionHistory_1.EntityType.DOCUMENT_TREE_NODE,
                    entityId: node.type === "file" && node.documentId ? node.documentId : node.id,
                    entityLabel: node.title,
                    parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    parentEntityId: node.documentHubId,
                    beforeData: isPermanent ? null : { isDeleted: false },
                    afterData: isPermanent ? null : { isDeleted: true },
                    changedFields: isPermanent ? undefined : ["isDeleted"],
                    metadata: { softDelete: !isPermanent, nodeType: node.type, hubName: hubName ?? null },
                    statusCode: 200,
                });
            }
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
    nodeId, tenantId, deletedById, nodeType, documentId, isPermanent = false) {
        // 1. Get all children of this node
        const children = await tx.documentTree.findMany({
            where: {
                parentId: nodeId,
                tenantId,
            },
        });
        // 2. Recursively delete each child
        for (const child of children) {
            await DocumentHubController.deleteNodeRecursive(tx, child.id, tenantId, deletedById, child.type, child.documentId, isPermanent);
        }
        if (isPermanent) {
            await tx.documentTree.delete({ where: { id: nodeId } });
            if (nodeType === "file" && documentId) {
                try {
                    await tx.$executeRaw `DELETE FROM document_history WHERE "documentId" = ${documentId}`;
                    await tx.document.delete({ where: { id: documentId } });
                }
                catch (error) {
                    console.error(`Failed to permanently delete document ${documentId}:`, error);
                }
            }
        }
        else {
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
            const isPermanent = req.query.permanent === 'true';
            const document = await database_1.prisma.document.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    ...(isPermanent ? {} : { isDeleted: false }),
                },
                include: { documentHub: { select: { name: true } } },
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
                    error: "Only authorized users can delete this item",
                });
                return;
            }
            if (isPermanent) {
                await database_1.prisma.$transaction(async (tx) => {
                    await tx.documentTree.deleteMany({ where: { documentId: id } });
                    await tx.$executeRaw `DELETE FROM document_history WHERE "documentId" = ${id}`;
                    await tx.document.delete({ where: { id } });
                });
                await database_1.prisma.documentHub.update({
                    where: { id: document.documentHubId },
                    data: { updatedAt: new Date() },
                });
                socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:document_deleted", { id, permanent: true });
                {
                    const hubName = document.documentHub?.name;
                    (0, transactionHistory_1.recordTransaction)({
                        req,
                        section: transactionHistory_1.Section.WORK,
                        module: transactionHistory_1.Module.DOCUMENT_HUB,
                        page: transactionHistory_1.Page.DOCUMENT_DETAIL,
                        action: transactionHistory_1.Action.PERMANENT_DELETE,
                        actionLabel: `Document permanently deleted${hubName ? ` from ${hubName}` : ""}`,
                        entityType: transactionHistory_1.EntityType.DOCUMENT,
                        entityId: id,
                        entityLabel: document.title,
                        parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                        parentEntityId: document.documentHubId,
                        metadata: hubName ? { hubName } : null,
                        statusCode: 200,
                    });
                }
                res.status(200).json({
                    success: true,
                    message: "Document permanently deleted",
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
            // Update parent hub's updatedAt
            await database_1.prisma.documentHub.update({
                where: { id: document.documentHubId },
                data: { updatedAt: new Date() },
            });
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:document_deleted", { id });
            {
                const hubName = document.documentHub?.name;
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_DETAIL,
                    action: transactionHistory_1.Action.DELETE,
                    actionLabel: `Document moved to trash${hubName ? ` from ${hubName}` : ""}`,
                    entityType: transactionHistory_1.EntityType.DOCUMENT,
                    entityId: id,
                    entityLabel: document.title,
                    parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    parentEntityId: document.documentHubId,
                    beforeData: { isDeleted: false },
                    afterData: { isDeleted: true },
                    changedFields: ["isDeleted"],
                    metadata: { softDelete: true, hubName: hubName ?? null },
                    statusCode: 200,
                });
            }
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
                            select: { id: true, name: true, avatarUrl: true },
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
                            select: { id: true, name: true, avatarUrl: true },
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
                                deletedBy: { select: { id: true, name: true, avatarUrl: true } },
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
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:restored", documentHub);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.DOCUMENT_HUB,
                page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                action: transactionHistory_1.Action.RESTORE,
                actionLabel: "Document hub restored from trash",
                entityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                entityId: id,
                entityLabel: documentHub.name,
                beforeData: { isDeleted: true },
                afterData: { isDeleted: false },
                changedFields: ["isDeleted"],
                statusCode: 200,
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
                include: { documentHub: { select: { name: true } } },
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
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:document_restored", { id });
            {
                const hubName = document.documentHub?.name;
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                    action: transactionHistory_1.Action.RESTORE,
                    actionLabel: `Document restored from trash${hubName ? ` to ${hubName}` : ""}`,
                    entityType: transactionHistory_1.EntityType.DOCUMENT,
                    entityId: id,
                    entityLabel: document.title,
                    parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    parentEntityId: document.documentHubId,
                    beforeData: { isDeleted: true },
                    afterData: { isDeleted: false },
                    changedFields: ["isDeleted"],
                    metadata: hubName ? { hubName } : null,
                    statusCode: 200,
                });
            }
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
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:node_restored", { id, documentHubId });
            {
                const hubForLog = await database_1.prisma.documentHub.findUnique({
                    where: { id: documentHubId },
                    select: { name: true },
                });
                const hubName = hubForLog?.name;
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                    action: transactionHistory_1.Action.RESTORE,
                    actionLabel: `Document ${node.type} restored from trash${hubName ? ` to ${hubName}` : ""}`,
                    entityType: node.type === "file" ? transactionHistory_1.EntityType.DOCUMENT : transactionHistory_1.EntityType.DOCUMENT_TREE_NODE,
                    entityId: node.type === "file" && node.documentId ? node.documentId : node.id,
                    entityLabel: node.title,
                    parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    parentEntityId: documentHubId,
                    beforeData: { isDeleted: true },
                    afterData: { isDeleted: false },
                    changedFields: ["isDeleted"],
                    metadata: { nodeType: node.type, restoredToHubId: documentHubId, parentId: parentId || null, hubName: hubName ?? null },
                    statusCode: 200,
                });
            }
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
                include: { documentHub: { select: { name: true } } },
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
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:document_updated", updatedDocument);
            if (visibility !== document.visibility) {
                const hubName = document.documentHub?.name;
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_DETAIL,
                    action: visibility === "public" ? transactionHistory_1.Action.SHARE : transactionHistory_1.Action.UNSHARE,
                    actionLabel: `Document ${visibility === "public" ? "shared" : "made private"}${hubName ? ` in ${hubName}` : ""}`,
                    entityType: transactionHistory_1.EntityType.DOCUMENT,
                    entityId: id,
                    entityLabel: document.title,
                    parentEntityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    parentEntityId: document.documentHubId,
                    beforeData: { visibility: document.visibility },
                    afterData: { visibility },
                    changedFields: ["visibility"],
                    metadata: hubName ? { hubName } : null,
                    statusCode: 200,
                });
            }
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
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:document_updated", { id, visibility: 'private' });
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
                        select: { name: true, avatarUrl: true }
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
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:updated", updatedHub);
            if (visibility !== hub.visibility) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                    action: visibility === "public" ? transactionHistory_1.Action.SHARE : transactionHistory_1.Action.UNSHARE,
                    actionLabel: `Document hub ${visibility === "public" ? "shared" : "made private"}`,
                    entityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    entityId: id,
                    entityLabel: hub.name,
                    beforeData: { visibility: hub.visibility },
                    afterData: { visibility },
                    changedFields: ["visibility"],
                    statusCode: 200,
                });
            }
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
            // Emit socket event
            socketService_1.socketService.emitToTenant(req.tenantId, "documenthub:updated", { id, visibility: 'private' });
            if (hub.visibility !== "private") {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.DOCUMENT_HUB,
                    page: transactionHistory_1.Page.DOCUMENT_HUB_LIST,
                    action: transactionHistory_1.Action.UNSHARE,
                    actionLabel: "Document hub sharing revoked",
                    entityType: transactionHistory_1.EntityType.DOCUMENT_HUB,
                    entityId: id,
                    entityLabel: hub.name,
                    beforeData: { visibility: hub.visibility },
                    afterData: { visibility: "private" },
                    changedFields: ["visibility"],
                    statusCode: 200,
                });
            }
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
                        select: { name: true, avatarUrl: true }
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
                        select: { name: true, avatarUrl: true }
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
    /**
     * Download Document as PDF using Puppeteer
     */
    static async downloadDocumentPdf(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Unauthorized" });
                return;
            }
            const { id } = req.params; // documentId
            const document = await database_1.prisma.document.findUnique({
                where: { id, tenantId: req.tenantId }
            });
            if (!document) {
                res.status(404).json({ success: false, error: "Document not found" });
                return;
            }
            // Convert BlockNote JSON content to HTML
            const blocks = document.content || [];
            const contentHtml = generateHtmlFromBlocks(blocks);
            const title = document.title || "Document";
            // Wrap in a basic HTML template
            const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
              body { 
                font-family: 'Inter', Arial, sans-serif; 
                padding: 40px; 
                color: #1e293b; 
                line-height: 1.6;
              }
              h1, h2, h3, h4, h5, h6 { 
                color: #0f172a; 
                margin-top: 1.5em; 
                margin-bottom: 0.5em; 
              }
              h1 { font-size: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
              p { margin-bottom: 1rem; }
              strong { font-weight: 600; }
              em { font-style: italic; }
              code { background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
              a { color: #3b82f6; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <h1>${title}</h1>
            ${contentHtml}
          </body>
        </html>
      `;
            // Launch Puppeteer
            const browser = await puppeteer_1.default.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: true
            });
            const page = await browser.newPage();
            await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
            });
            await browser.close();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/[^a-zA-Z0-9-_\.]/g, '_')}.pdf"`);
            res.end(pdfBuffer);
        }
        catch (error) {
            console.error("PDF generation error:", error);
            res.status(500).json({ success: false, error: "Failed to generate PDF" });
        }
    }
}
exports.DocumentHubController = DocumentHubController;
//# sourceMappingURL=documentHubController.js.map