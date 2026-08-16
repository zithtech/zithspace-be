import { Response } from "express";

import pool from "@/config/dbpool";
import { findHubByName, createDocumentHubModel, getDocumentHubById, getAllDocumentHubsModel, getDocumentHubStarsModel, updateDocumentHubModel } from "@/models/documentHub.model";
import { createDocumentModel } from "@/models/document.model";
import { createDocumentTreeModel, getLastNodePositionModel, getDocumentTreeByIdModel, updateDocumentTreeModel } from "@/models/documentTree.model";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import { socketService } from "@/services/socketService";
import { generateDocumentDraft, rewriteSelection } from "@/services/aiDocumentService";
import { entitlementService, EntitlementError } from "@/services/EntitlementService";
import { AIPricingEngine } from "@/ai/pricing/AIPricingEngine";
import { AIFeature } from "@/ai/types/AIFeature";
import puppeteer from "puppeteer";
import crypto from "crypto";
import {
  recordTransaction,
  diffShallow,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from "@/utils/transactionHistory";

const generateHtmlFromBlocks = (blocks: any[]): string => {
  let html = "";
  for (const block of blocks) {
    if (!block.type) continue;

    let contentHtml = "";
    if (Array.isArray(block.content)) {
      contentHtml = block.content
        .map((c: any) => {
          let text = c.text || "";
          if (c.styles) {
            if (c.styles.bold) text = `<strong>${text}</strong>`;
            if (c.styles.italic) text = `<em>${text}</em>`;
            if (c.styles.underline) text = `<u>${text}</u>`;
            if (c.styles.strike) text = `<s>${text}</s>`;
            if (c.styles.code) text = `<code>${text}</code>`;
          }
          if (c.type === "link") {
            text = `<a href="${c.href}">${text}</a>`;
          }
          return text;
        })
        .join("");
    } else if (typeof block.content === "string") {
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

export class DocumentHubController {
  /**
   * Generate a documentation draft from a free-form prompt.
   * Returns { hubName, fileTitle, contentHtml }. Does NOT persist anything —
   * the client makes follow-up calls to create the hub and write the file.
   */
  static async aiGenerateDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { prompt } = req.body as { prompt?: string };
      const seed = (prompt || "").trim();

      if (!seed || seed.length < 5) {
        res.status(400).json({
          success: false,
          error: "Prompt is required (min 5 characters)",
        } as ApiResponse);
        return;
      }
      if (seed.length > 8000) {
        res.status(400).json({
          success: false,
          error: "Prompt is too long (max 8000 characters)",
        } as ApiResponse);
        return;
      }

      await entitlementService.checkLimit(req.tenantId, 'ai_credits_month');
      const aiResponse = await generateDocumentDraft(seed, req.tenantId);
      const draft = aiResponse.data;
      const pricingResult = await AIPricingEngine.calculate(aiResponse);
      await entitlementService.incrementUsage(req.tenantId, 'ai_credits_month', AIFeature.DOCUMENT_SUMMARY, pricingResult);

      res.status(200).json({
        success: true,
        data: { ...draft, source: aiResponse.provider, fallbackReason: aiResponse.metadata?.finishReason },
        message: "Document draft generated",
      } as ApiResponse);
    } catch (error: any) {
      if (error instanceof EntitlementError) {
        res.status(403).json({ success: false, error: 'AI limit reached', details: { current: error.current, allowed: error.allowed } } as ApiResponse);
        return;
      }
      console.error("AI generate document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate document draft",
      } as ApiResponse);
    }
  }

  /**
   * Rewrite a selected excerpt of a document according to a user instruction.
   * Used by the inline Zai menu in the editor when a user selects text.
   * Does NOT persist anything — the client applies the result.
   */
  static async aiRewriteSelection(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { text, instruction } = req.body as {
        text?: string;
        instruction?: string;
      };
      const cleanText = (text || "").trim();
      const cleanInstruction = (instruction || "").trim();

      if (!cleanText || cleanText.length < 2) {
        res.status(400).json({
          success: false,
          error: "Selected text is required (min 2 characters)",
        } as ApiResponse);
        return;
      }
      if (cleanText.length > 8000) {
        res.status(400).json({
          success: false,
          error: "Selected text is too long (max 8000 characters)",
        } as ApiResponse);
        return;
      }
      if (!cleanInstruction || cleanInstruction.length < 2) {
        res.status(400).json({
          success: false,
          error: "Instruction is required",
        } as ApiResponse);
        return;
      }
      if (cleanInstruction.length > 500) {
        res.status(400).json({
          success: false,
          error: "Instruction is too long (max 500 characters)",
        } as ApiResponse);
        return;
      }

      await entitlementService.checkLimit(req.tenantId, 'ai_credits_month');
      const aiResponse = await rewriteSelection(cleanText, cleanInstruction, req.tenantId);
      const result = aiResponse.data;
      const pricingResult = await AIPricingEngine.calculate(aiResponse);
      await entitlementService.incrementUsage(req.tenantId, 'ai_credits_month', AIFeature.DOCUMENT_SUMMARY, pricingResult);

      res.status(200).json({
        success: true,
        data: { ...result, source: aiResponse.provider, fallbackReason: aiResponse.metadata?.finishReason },
        message: "Selection rewritten",
      } as ApiResponse);
    } catch (error: any) {
      if (error instanceof EntitlementError) {
        res.status(403).json({ success: false, error: 'AI limit reached', details: { current: error.current, allowed: error.allowed } } as ApiResponse);
        return;
      }
      console.error("AI rewrite selection error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to rewrite selection",
      } as ApiResponse);
    }
  }

  /**
   * Create a new Document HUb (tenant-aware)
   */

  static async createDocumentHub(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { name, projectId, ticketId, visibility: bodyVisibility, source: bodySource } = req.body ?? {};
      const visibility = bodyVisibility || 'public';
      // FE passes `source: "ai"` when the hub was generated through Zai.
      // Anything else (including omitted) is treated as a manual creation.
      const creationSource: "manual" | "ai" = bodySource === "ai" ? "ai" : "manual";

      let hubShareToken = null;
      if (visibility === 'public') {
        hubShareToken = crypto.randomBytes(32).toString('hex');
      }

      // Validate required fields
      if (!name || name.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Document HUb Name is required",
        } as ApiResponse);
        return;
      }

      // Check if a document hub with the same name already exists
      const existingHub = await findHubByName(name.trim(), req.tenantId);

      if (existingHub) {
        res.status(400).json({
          success: false,
          error: "This hub name already exists.",
        } as ApiResponse);
        return;
      }

      // Validate project if provided
      if (projectId) {
        const projectQuery = await pool.query(
          'SELECT id FROM projects WHERE id = $1 AND tenant_id = $2',
          [projectId, req.tenantId]
        );

        if (projectQuery.rows.length === 0) {
          throw new ValidationError("Project not found in this tenant");
        }
      }
      // Create documentHub
      const documentHub = await createDocumentHubModel({
        tenantId: req.tenantId,
        name,
        projectId: projectId,
        ticketId: ticketId,
        createdById: req.user.id,
        visibility: visibility as any,
        shareToken: hubShareToken as any,
      });

      let docShareToken = null;
      if (visibility === 'public') {
        docShareToken = crypto.randomBytes(32).toString('hex');
      }

      // Create "Overview" document
      const doc = await createDocumentModel({
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
        visibility: visibility as any,
        shareToken: docShareToken as any,
      });

      const documentTree = await createDocumentTreeModel({
        tenantId: req.tenantId,
        documentHubId: documentHub.id,
        createdById: req.user.id,
        title: "Overview",
        sequence: 0,
        type: "file",
        documentId: doc.id,
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:created",
        documentHub,
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.DOCUMENT_HUB,
        page: Page.DOCUMENT_HUB_LIST,
        action: Action.CREATE,
        actionLabel: `Document hub created${creationSource === "ai" ? " via Zai" : ""}`,
        entityType: EntityType.DOCUMENT_HUB,
        entityId: documentHub.id,
        entityLabel: documentHub.name,
        parentEntityType: projectId ? EntityType.PROJECT : null,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create document hub error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create document hub",
      } as ApiResponse);
    }
  }
  static async getDocumentHubById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const documentHub = await getDocumentHubById(id, req.tenantId, req.user.id);

      if (!documentHub) {
        res.status(404).json({
          success: false,
          error: "Document Hub not found",
        } as ApiResponse);
        return;
      }


      res.status(200).json({
        success: true,
        data: documentHub,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get document hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get document hub",
      } as ApiResponse);
    }
  }

  static async createTreeNode(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { documentHubId, parentId, type, title, source: bodySource } = req.body;
      const creationSource: "manual" | "ai" = bodySource === "ai" ? "ai" : "manual";

      if (!documentHubId || !title || !type) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        } as ApiResponse);
        return;
      }

      // Find last position in the same level
      const lastPosition = await getLastNodePositionModel(documentHubId, req.tenantId, parentId || null);
      const position = lastPosition !== null ? lastPosition + 1 : 0;

      // Create document for all node types (files, folders, sections) so they can all have editable content
      const doc = await createDocumentModel({
        tenantId: req.tenantId,
        documentHubId,
        title,
        content: [], // Default empty content for Blocknote
        createdById: req.user.id,
        visibility: "public",
        shareToken: require("crypto").randomBytes(32).toString("hex"),
      });
      let documentId = doc.id;

      const newNode = await createDocumentTreeModel({
        tenantId: req.tenantId,
        documentHubId,
        parentId: parentId || null,
        title,
        type,
        position,
        createdById: req.user.id,
        documentId,
      });

      // Update parent hub's updatedAt
      await updateDocumentHubModel(documentHubId, req.tenantId, { updatedAt: new Date() });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_created",
        newNode,
      );

      // Look up the hub name so the activity row reads "<thing> in <Hub Name>"
      const hubQuery = await pool.query(
        'SELECT name FROM document_hub WHERE id = $1 AND "tenantId" = $2', 
        [documentHubId, req.tenantId]
      );
      const hubForLog = hubQuery.rows.length > 0 ? hubQuery.rows[0] : null;

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.DOCUMENT_HUB,
        page: Page.DOCUMENT_HUB_LIST,
        action: Action.CREATE,
        actionLabel: `Document ${type} created${creationSource === "ai" ? " via Zai" : ""}${hubForLog?.name ? ` in ${hubForLog.name}` : ""}`,
        entityType: type === "file" ? EntityType.DOCUMENT : EntityType.DOCUMENT_TREE_NODE,
        entityId: type === "file" ? documentId! : newNode.id,
        entityLabel: title,
        parentEntityType: EntityType.DOCUMENT_HUB,
        parentEntityId: documentHubId,
        afterData: { title, type, parentId: parentId || null },
        metadata: { source: creationSource, hubName: hubForLog?.name ?? null },
        statusCode: 201,
      });

      res.status(201).json({
        success: true,
        data: newNode,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create tree node error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create tree node",
      } as ApiResponse);
    }
  }
  static async updateTreeNode(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { title, parentId } = req.body as {
        title?: string;
        parentId?: string | null;
      };

      // Either title OR a parentId update must be supplied.
      if (title === undefined && parentId === undefined) {
        res.status(400).json({
          success: false,
          error: "Provide title or parentId to update",
        } as ApiResponse);
        return;
      }

      const node = await getDocumentTreeByIdModel(id, req.tenantId);

      if (!node) {
        res.status(404).json({
          success: false,
          error: "Node not found",
        } as ApiResponse);
        return;
      }

      // Fetch hub name for log
      const hubQuery = await pool.query(
        'SELECT name FROM document_hub WHERE id = $1 AND "tenantId" = $2', 
        [node.documentHubId, req.tenantId]
      );
      const hubName = hubQuery.rows.length > 0 ? hubQuery.rows[0].name : "Unknown Hub";

      // --- Validate parentId move (drag-drop) ---
      if (parentId !== undefined) {
        if (parentId === id) {
          res.status(400).json({
            success: false,
            error: "Cannot move a node into itself",
          } as ApiResponse);
          return;
        }

        if (parentId !== null) {
          const parent = await getDocumentTreeByIdModel(parentId, req.tenantId);

          if (!parent) {
            res.status(404).json({
              success: false,
              error: "Parent node not found",
            } as ApiResponse);
            return;
          }

          if (parent.documentHubId !== node.documentHubId) {
            res.status(400).json({
              success: false,
              error: "Cannot move a node across hubs",
            } as ApiResponse);
            return;
          }

          // Files can't host children, only folders/sections.
          if (parent.type === "file") {
            res.status(400).json({
              success: false,
              error: "Files cannot contain other items",
            } as ApiResponse);
            return;
          }

          // Cycle check: walk the parent chain — `id` must not appear.
          let cursor: typeof parent | null = parent;
          while (cursor) {
            if (cursor.id === id) {
              res.status(400).json({
                success: false,
                error: "Cannot move a folder into one of its descendants",
              } as ApiResponse);
              return;
            }
            if (!cursor.parentId) break;
            cursor = await getDocumentTreeByIdModel(cursor.parentId, req.tenantId);
          }
        }
      }

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (parentId !== undefined) updateData.parentId = parentId;

      const updatedNode = await updateDocumentTreeModel(id, req.tenantId, updateData);

      // If it's a file and has a documentId, update the document title too
      if (
        title !== undefined &&
        node.type === "file" &&
        node.documentId
      ) {
        await pool.query(
          'UPDATE documents SET title = $1, "updatedAt" = NOW() WHERE id = $2', 
          [title, node.documentId]
        );
      }

      // Update parent hub's updatedAt
      await updateDocumentHubModel(node.documentHubId, req.tenantId, { updatedAt: new Date() });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_updated",
        updatedNode,
      );

      {
        const before: Record<string, any> = {};
        const after: Record<string, any> = {};
        if (title !== undefined) { before.title = node.title; after.title = updatedNode.title; }
        if (parentId !== undefined) { before.parentId = node.parentId; after.parentId = updatedNode.parentId; }
        const diff = diffShallow(before, after);
        if (diff.changedFields.length > 0) {
          const hubName = (node as any).documentHub?.name as string | undefined;
          const inHub = hubName ? ` in ${hubName}` : "";
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.DOCUMENT_HUB,
            page: Page.DOCUMENT_HUB_LIST,
            action: parentId !== undefined ? Action.MOVE : Action.UPDATE,
            actionLabel: `Document ${node.type} ${parentId !== undefined ? "moved" : "updated"}${inHub}${diff.changedFields.length ? ` (${diff.changedFields.join(", ")})` : ""}`,
            entityType: node.type === "file" ? EntityType.DOCUMENT : EntityType.DOCUMENT_TREE_NODE,
            entityId: node.type === "file" && node.documentId ? node.documentId : node.id,
            entityLabel: updatedNode.title,
            parentEntityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update tree node error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update tree node",
      } as ApiResponse);
    }
  }

  static async getDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const documentQuery = await pool.query(
        `SELECT * FROM documents WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false
         AND (visibility = 'public' OR "createdById" = $3 OR $3 = ANY(shared_with))`,
        [id, req.tenantId, req.user.id]
      );

      if (documentQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document not found",
        } as ApiResponse);
        return;
      }

      const document = documentQuery.rows[0];

      // Manual visibility check
      if (document.visibility !== "public" && document.createdById !== req.user.id) {
        res.status(404).json({
          success: false,
          error: "Document not found",
        } as ApiResponse);
        return;
      }

      // Map keys to camelCase for the frontend
      const mappedDocument = {
        id: document.id,
        tenantId: document.tenantId,
        documentHubId: document.documentHubId,
        title: document.title,
        content: document.content,
        version: document.version,
        createdById: document.createdById,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        deletedAt: document.deleted_at,
        deletedById: document.deleted_by_id,
        isDeleted: document.is_deleted,
        visibility: document.visibility,
        shareToken: document.share_token,
      };

      res.status(200).json({
        success: true,
        data: mappedDocument,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get document",
      } as ApiResponse);
    }
  }

  static async updateDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { content, title, expectedVersion } = req.body as {
        content?: any;
        title?: string;
        expectedVersion?: number;
      };

      const documentQuery = await pool.query(
        'SELECT d.*, dh.name as hub_name FROM documents d JOIN document_hub dh ON d."documentHubId" = dh.id WHERE d.id = $1 AND d."tenantId" = $2 AND d.is_deleted = false',
        [id, req.tenantId]
      );

      if (documentQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document not found",
        } as ApiResponse);
        return;
      }

      const document = documentQuery.rows[0];

      // Check authorization (only creator can update private document)
      if (
        document.visibility === "private" &&
        document.createdById !== req.user.id
      ) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to update this private document",
        } as ApiResponse);
        return;
      }

      // Optimistic concurrency: when the client sends an expectedVersion, refuse
      // the write if it doesn't match the current row. The frontend autosave
      // pipeline uses this to halt and prompt the user instead of silently
      // overwriting changes from a concurrent editor / browser tab.
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        Number(document.version) !== Number(expectedVersion)
      ) {
        res.status(409).json({
          success: false,
          error: "Document was modified by another session",
          data: {
            currentVersion: Number(document.version),
            expectedVersion: Number(expectedVersion),
            document,
          },
        } as ApiResponse);
        return;
      }

      // Atomic version check + bump in a single SQL statement so two concurrent
      // requests can't both pass the check above and then both overwrite.
      let updateQueryStr = 'UPDATE documents SET version = version + 1, "updatedAt" = NOW()';
      const queryParams: any[] = [id, req.tenantId];
      let paramIndex = 3;

      if (content !== undefined) {
        updateQueryStr += `, content = $${paramIndex++}`;
        queryParams.push(JSON.stringify(content));
      }
      if (title !== undefined) {
        updateQueryStr += `, title = $${paramIndex++}`;
        queryParams.push(title);
      }

      updateQueryStr += ` WHERE id = $1 AND "tenantId" = $2`;
      
      if (expectedVersion !== undefined && expectedVersion !== null) {
        updateQueryStr += ` AND version = $${paramIndex++}`;
        queryParams.push(Number(expectedVersion));
      }

      updateQueryStr += ' RETURNING *';

      const updateResult = await pool.query(updateQueryStr, queryParams);

      if (updateResult.rows.length === 0) {
        // Race lost — someone updated the document between our read and write.
        const freshQuery = await pool.query(
          'SELECT * FROM documents WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false',
          [id, req.tenantId]
        );
        const fresh = freshQuery.rows.length > 0 ? freshQuery.rows[0] : null;
        res.status(409).json({
          success: false,
          error: "Document was modified by another session",
          data: {
            currentVersion: fresh ? fresh.version : null,
            expectedVersion,
            document: fresh,
          },
        } as ApiResponse);
        return;
      }

      const updatedDocument = updateResult.rows[0];

      // Create history entry
      if (content !== undefined) {
        await pool.query(
          `INSERT INTO document_history (id, "documentId", "tenantId", content, "createdById", "createdAt") 
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [require('crypto').randomUUID(), id, req.tenantId, JSON.stringify(content), req.user.id]
        );
      }

      // Update parent hub's updatedAt (non-fatal if it fails)
      try {
        await updateDocumentHubModel(document.documentHubId, req.tenantId, { updatedAt: new Date() });
      } catch (err) {
        console.error("Failed to update hub updatedAt timestamp:", err);
      }

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_updated",
        updatedDocument,
      );

      // Audit log: only log structural changes. Content-only edits already
      // generate a `document_history` row per save and would flood the
      // activity feed otherwise. We log when the title changes.
      if (title !== undefined && title !== document.title) {
        const hubName = (document as any).documentHub?.name as string | undefined;
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_DETAIL,
          action: Action.UPDATE,
          actionLabel: `Document renamed${hubName ? ` in ${hubName}` : ""}`,
          entityType: EntityType.DOCUMENT,
          entityId: id,
          entityLabel: title,
          parentEntityType: EntityType.DOCUMENT_HUB,
          parentEntityId: document.documentHubId,
          beforeData: { title: document.title },
          afterData: { title },
          changedFields: ["title"],
          metadata: hubName ? { hubName } : null,
          statusCode: 200,
        });
      }

      const mappedUpdatedDocument = {
        id: updatedDocument.id,
        tenantId: updatedDocument.tenantId,
        documentHubId: updatedDocument.documentHubId,
        title: updatedDocument.title,
        content: updatedDocument.content,
        version: updatedDocument.version,
        createdById: updatedDocument.createdById,
        createdAt: updatedDocument.createdAt,
        updatedAt: updatedDocument.updatedAt,
        deletedAt: updatedDocument.deleted_at,
        deletedById: updatedDocument.deleted_by_id,
        isDeleted: updatedDocument.is_deleted,
        visibility: updatedDocument.visibility,
        shareToken: updatedDocument.share_token,
      };

      res.status(200).json({
        success: true,
        data: mappedUpdatedDocument,
        message: "Document updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update document",
      } as ApiResponse);
    }
  }

  /**
   * Star a document hub for the current user (raw SQL — no Prisma model).
   * Idempotent: a duplicate (user, hub) pair is a no-op.
   */
  static async starDocumentHub(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
      const { id: hubId } = req.params;

      const hubQuery = await pool.query(
        `SELECT id FROM document_hub WHERE id = $1 AND "tenantId" = $2 AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1`,
        [hubId, req.tenantId]
      );
      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document hub not found",
        } as ApiResponse);
        return;
      }

      const newId = require('crypto').randomUUID();
      await pool.query(
        `INSERT INTO document_hub_stars (id, user_id, hub_id, tenant_id) 
         VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, hub_id) DO NOTHING`,
        [newId, req.user.id, hubId, req.tenantId]
      );

      res.status(200).json({
        success: true,
        message: "Hub starred",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Star hub error:", error?.message || error, error?.code);
      res.status(500).json({
        success: false,
        error: error?.message || "Failed to star hub",
      } as ApiResponse);
    }
  }

  /**
   * Remove the current user's star from a document hub (raw SQL).
   */
  static async unstarDocumentHub(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }
      const { id: hubId } = req.params;

      await pool.query(
        `DELETE FROM document_hub_stars WHERE user_id = $1 AND hub_id = $2 AND tenant_id = $3`,
        [req.user.id, hubId, req.tenantId]
      );

      res.status(200).json({
        success: true,
        message: "Hub unstarred",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Unstar hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to unstar hub",
      } as ApiResponse);
    }
  }

  /**
   * Delete a single version from a document's history. Uses a raw SQL DELETE
   * (with parameterised values) to keep the query explicit and side-effect-
   * free. The latest version is protected — that's the live document; the
   * client should call the document-delete endpoint instead.
   */
  static async deleteDocumentHistoryEntry(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id: documentId, historyId } = req.params;

      const historyQuery = await pool.query(
        `SELECT id, "createdAt" AS created_at FROM document_history WHERE id = $1 AND "documentId" = $2 AND "tenantId" = $3 LIMIT 1`,
        [historyId, documentId, req.tenantId]
      );

      if (historyQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "History entry not found",
        } as ApiResponse);
        return;
      }

      // Refuse to delete the most-recent version — it represents the live
      // document state and removing it would leave the doc in an inconsistent
      // history.
      const latestQuery = await pool.query(
        `SELECT id FROM document_history WHERE "documentId" = $1 AND "tenantId" = $2 ORDER BY "createdAt" DESC LIMIT 1`,
        [documentId, req.tenantId]
      );
      
      const latest = latestQuery.rows;
      if (latest.length && latest[0].id === historyId) {
        res.status(400).json({
          success: false,
          error: "Cannot delete the latest version",
        } as ApiResponse);
        return;
      }

      await pool.query(
        `DELETE FROM document_history WHERE id = $1 AND "documentId" = $2 AND "tenantId" = $3`,
        [historyId, documentId, req.tenantId]
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.DOCUMENT_HUB,
        page: Page.DOCUMENT_DETAIL,
        action: Action.DELETE,
        actionLabel: "Document version deleted",
        entityType: EntityType.DOCUMENT_HISTORY_ENTRY,
        entityId: historyId,
        parentEntityType: EntityType.DOCUMENT,
        parentEntityId: documentId,
        metadata: { versionCreatedAt: historyQuery.rows[0].created_at },
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        message: "Version deleted",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete history entry error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete version",
      } as ApiResponse);
    }
  }

  static async getDocumentHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const historyQuery = await pool.query(
        `SELECT dh.id, dh."documentId", dh."tenantId", dh.content, dh."createdById", dh."createdAt",
                u.name AS "createdByName",
                u.work_email AS "createdByEmail",
                u.avatar_url AS "createdByAvatar"
         FROM document_history dh
         LEFT JOIN users u ON dh."createdById" = u.id
         WHERE dh."documentId" = $1 AND dh."tenantId" = $2
         ORDER BY dh."createdAt" DESC`,
        [id, req.tenantId]
      );
      
      const history = historyQuery.rows.map(row => ({
        id: row.id,
        documentId: row.documentId,
        tenantId: row.tenantId,
        content: row.content,
        createdById: row.createdById,
        createdAt: row.createdAt,
        createdBy: {
          id: row.createdById,
          name: row.createdByName,
          workEmail: row.createdByEmail,
          avatarUrl: row.createdByAvatar,
        }
      }));

      res.status(200).json({
        success: true,
        data: history,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get document history error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get document history",
      } as ApiResponse);
    }
  }

  static async getAllDocumentHubs(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      // Optional ticketId filter — used by the ticket detail drawer to list
      // hubs linked to a specific ticket. Trim and validate as UUID-ish so
      // a typo doesn't drop us into a query that surprisingly returns all rows.
      const ticketIdFilter =
        typeof req.query.ticketId === "string" && req.query.ticketId.trim()
          ? req.query.ticketId.trim()
          : undefined;

      // Fetch all accessible document IDs in this tenant for the user
      const documentHubs = await getAllDocumentHubsModel(
        req.tenantId,
        req.user.id,
        ticketIdFilter
      );

      const starredRows = await getDocumentHubStarsModel(req.user.id, req.tenantId);
      const starredSet = new Set(starredRows.map((r: any) => r.hub_id));
      const enrichedHubs = documentHubs.map((hub) => ({
        ...hub,
        isStarred: starredSet.has(hub.id),
      }));

      res.status(200).json({
        success: true,
        data: enrichedHubs,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get document hubs error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get document hubs",
      } as ApiResponse);
    }
  }

  static async deleteDocumentHub(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const isPermanent = req.query.permanent === 'true';

      const hubQuery = await pool.query(
        `SELECT * FROM document_hub WHERE id = $1 AND "tenantId" = $2` + (isPermanent ? '' : ' AND is_deleted = false'),
        [id, req.tenantId]
      );

      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document Hub not found",
        } as ApiResponse);
        return;
      }

      const documentHub = hubQuery.rows[0];

      if (isPermanent) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM document_hub_stars WHERE hub_id = $1', [id]);
          await client.query('DELETE FROM document_tree WHERE "documentHubId" = $1', [id]);
          await client.query('DELETE FROM document_history WHERE "documentId" IN (SELECT id FROM documents WHERE "documentHubId" = $1)', [id]);
          await client.query('DELETE FROM documents WHERE "documentHubId" = $1', [id]);
          await client.query('DELETE FROM document_hub WHERE id = $1', [id]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }

        socketService.emitToTenant(
          req.tenantId,
          "documenthub:deleted",
          { id, permanent: true },
        );

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_HUB_LIST,
          action: Action.PERMANENT_DELETE,
          actionLabel: "Document hub permanently deleted",
          entityType: EntityType.DOCUMENT_HUB,
          entityId: id,
          entityLabel: documentHub.name,
          statusCode: 200,
        });

        res.status(200).json({
          success: true,
          message: "Document Hub permanently deleted",
        } as ApiResponse);
        return;
      }

      await updateDocumentHubModel(id, req.tenantId, {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: req.user.id,
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:deleted",
        { id },
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.DOCUMENT_HUB,
        page: Page.DOCUMENT_HUB_LIST,
        action: Action.DELETE,
        actionLabel: "Document hub moved to trash",
        entityType: EntityType.DOCUMENT_HUB,
        entityId: id,
        entityLabel: documentHub.name,
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        message: "Document Hub moved to trash",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete document hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete document hub",
      } as ApiResponse);
    }
  }

  static async updateDocumentHub(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { name, projectId, ticketId } = req.body;

      const hubQuery = await pool.query(
        `SELECT * FROM document_hub WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false`,
        [id, req.tenantId]
      );

      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document Hub not found",
        } as ApiResponse);
        return;
      }
      
      const documentHub = hubQuery.rows[0];

      // Check authorization (only creator can update hub for now)
      if (documentHub.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to update this Document Hub",
        } as ApiResponse);
        return;
      }

      // Validate project if provided
      if (projectId) {
        const projectQuery = await pool.query(
          `SELECT id FROM projects WHERE id = $1 AND tenant_id = $2`,
          [projectId, req.tenantId]
        );

        if (projectQuery.rows.length === 0) {
          throw new ValidationError("Project not found in this tenant");
        }
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        if (name.trim() === "") {
          throw new ValidationError("Document Hub Name cannot be empty");
        }
        updateData.name = name;
      }

      if (projectId !== undefined) {
        updateData.projectId = projectId;
      }

      if (ticketId !== undefined) {
        updateData.ticketId = ticketId;
      }

      const updatedDocumentHub = await updateDocumentHubModel(id, req.tenantId, updateData);

      const relatedQuery = await pool.query(`
        SELECT dh.*,
          json_build_object('id', p.id, 'name', p.name, 'code', p.code) as project,
          json_build_object('id', t.id, 'title', t.title, 'status', t.status, 'ticketNumber', t.ticket_number) as ticket,
          json_build_object('id', u.id, 'name', u.name, 'workEmail', u.work_email, 'avatarUrl', u.avatar_url) as "createdBy"
        FROM document_hub dh
        LEFT JOIN projects p ON dh."projectId" = p.id
        LEFT JOIN tickets t ON dh."ticketId" = t.id
        LEFT JOIN users u ON dh."createdById" = u.id
        WHERE dh.id = $1
      `, [id]);
      
      const socketPayload = relatedQuery.rows[0];

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:updated",
        socketPayload,
      );

      {
        const before: Record<string, any> = {};
        const after: Record<string, any> = {};
        if (name !== undefined) { before.name = documentHub.name; after.name = updatedDocumentHub.name; }
        if (projectId !== undefined) { before.projectId = documentHub.projectId; after.projectId = updatedDocumentHub.projectId; }
        if (ticketId !== undefined) { before.ticketId = documentHub.ticketId; after.ticketId = updatedDocumentHub.ticketId; }
        const diff = diffShallow(before, after);
        if (diff.changedFields.length > 0) {
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.DOCUMENT_HUB,
            page: Page.DOCUMENT_HUB_LIST,
            action: Action.UPDATE,
            actionLabel: `Document hub updated (${diff.changedFields.join(", ")})`,
            entityType: EntityType.DOCUMENT_HUB,
            entityId: id,
            entityLabel: updatedDocumentHub.name,
            beforeData: before,
            afterData: after,
            changedFields: diff.changedFields,
            statusCode: 200,
          });
        }
      }

      res.status(200).json({
        success: true,
        data: socketPayload,
        message: "Document Hub updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update document hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update document hub",
      } as ApiResponse);
    }
  }

  static async deleteTreeNode(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const isPermanent = req.query.permanent === 'true';

      const nodeQuery = await pool.query(
        `SELECT dt.*, dh.name as hub_name FROM document_tree dt JOIN document_hub dh ON dt."documentHubId" = dh.id WHERE dt.id = $1 AND dt."tenantId" = $2` + (isPermanent ? '' : ' AND dt.is_deleted = false'),
        [id, req.tenantId]
      );

      if (nodeQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Node not found",
        } as ApiResponse);
        return;
      }

      const node = nodeQuery.rows[0];

      // Check ownership
      if (node.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "Only authorized users can delete this item",
        } as ApiResponse);
        return;
      }

      // Use a transaction for atomic recursive deletion
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await DocumentHubController.deleteNodeRecursive(
          client,
          id,
          req.tenantId,
          req.user!.id,
          node.type,
          node.documentId,
          isPermanent
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Update parent hub's updatedAt
      await updateDocumentHubModel(node.documentHubId, req.tenantId, { updatedAt: new Date() });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_deleted",
        { id },
      );

      {
        const hubName = node.hub_name;
        const inHub = hubName ? ` from ${hubName}` : "";
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_HUB_LIST,
          action: isPermanent ? Action.PERMANENT_DELETE : Action.DELETE,
          actionLabel: `Document ${node.type} ${isPermanent ? "permanently deleted" : "moved to trash"}${inHub}`,
          entityType: node.type === "file" ? EntityType.DOCUMENT : EntityType.DOCUMENT_TREE_NODE,
          entityId: node.type === "file" && node.documentId ? node.documentId : node.id,
          entityLabel: node.title,
          parentEntityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete tree node error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete tree node",
      } as ApiResponse);
    }
  }

  private static async deleteNodeRecursive(
    tx: any, // PoolClient
    nodeId: string,
    tenantId: string,
    deletedById: string,
    nodeType?: string,
    documentId?: string | null,
    isPermanent: boolean = false,
  ): Promise<void> {
    // 1. Get all children of this node
    const childrenQuery = await tx.query(
      `SELECT id, type, "documentId" FROM document_tree WHERE "parentId" = $1 AND "tenantId" = $2`,
      [nodeId, tenantId]
    );

    // 2. Recursively delete each child
    for (const child of childrenQuery.rows) {
      await DocumentHubController.deleteNodeRecursive(
        tx,
        child.id,
        tenantId,
        deletedById,
        child.type,
        child.documentId,
        isPermanent
      );
    }

    if (isPermanent) {
      await tx.query(`DELETE FROM document_tree WHERE id = $1`, [nodeId]);
      if (nodeType === "file" && documentId) {
        try {
          await tx.query(`DELETE FROM document_history WHERE "documentId" = $1`, [documentId]);
          await tx.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
        } catch (error) {
          console.error(`Failed to permanently delete document ${documentId}:`, error);
        }
      }
    } else {
      // 3. Mark current node as deleted using updateMany for robustness
      await tx.query(
        `UPDATE document_tree SET is_deleted = true, deleted_at = NOW(), deleted_by_id = $1 WHERE id = $2 AND "tenantId" = $3`,
        [deletedById, nodeId, tenantId]
      );

      // 4. If it's a file with an associated document, mark the document as deleted too
      if (nodeType === "file" && documentId) {
        try {
          await tx.query(
            `UPDATE documents SET is_deleted = true, deleted_at = NOW(), deleted_by_id = $1 WHERE id = $2 AND "tenantId" = $3`,
            [deletedById, documentId, tenantId]
          );
        } catch (error) {
          console.error(`Failed to soft-delete document ${documentId}:`, error);
          // We don't throw here to allow the tree node deletion to commit
        }
      }
    }
  }

  /**
   * Delete individual document (soft delete)
   */
  static async deleteDocument(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const isPermanent = req.query.permanent === 'true';

      const documentQuery = await pool.query(
        `SELECT d.*, dh.name as hub_name FROM documents d JOIN document_hub dh ON d."documentHubId" = dh.id WHERE d.id = $1 AND d."tenantId" = $2` + (isPermanent ? '' : ' AND d.is_deleted = false'),
        [id, req.tenantId]
      );

      if (documentQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document not found",
        } as ApiResponse);
        return;
      }
      
      const document = documentQuery.rows[0];

      // Check ownership
      if (document.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "Only authorized users can delete this item",
        } as ApiResponse);
        return;
      }

      if (isPermanent) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`DELETE FROM document_tree WHERE "documentId" = $1`, [id]);
          await client.query(`DELETE FROM document_history WHERE "documentId" = $1`, [id]);
          await client.query(`DELETE FROM documents WHERE id = $1`, [id]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }

        await updateDocumentHubModel(document.documentHubId, req.tenantId, { updatedAt: new Date() });

        socketService.emitToTenant(
          req.tenantId,
          "documenthub:document_deleted",
          { id, permanent: true },
        );

        {
          const hubName = document.hub_name;
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.DOCUMENT_HUB,
            page: Page.DOCUMENT_DETAIL,
            action: Action.PERMANENT_DELETE,
            actionLabel: `Document permanently deleted${hubName ? ` from ${hubName}` : ""}`,
            entityType: EntityType.DOCUMENT,
            entityId: id,
            entityLabel: document.title,
            parentEntityType: EntityType.DOCUMENT_HUB,
            parentEntityId: document.documentHubId,
            metadata: hubName ? { hubName } : null,
            statusCode: 200,
          });
        }

        res.status(200).json({
          success: true,
          message: "Document permanently deleted",
        } as ApiResponse);
        return;
      }

      // Soft delete the document
      await pool.query(
        `UPDATE documents SET is_deleted = true, deleted_at = NOW(), deleted_by_id = $1 WHERE id = $2`,
        [req.user.id, id]
      );

      // Also soft delete associated tree node if it exists
      await pool.query(
        `UPDATE document_tree SET is_deleted = true, deleted_at = NOW(), deleted_by_id = $1 WHERE "documentId" = $2 AND "tenantId" = $3 AND is_deleted = false`,
        [req.user.id, id, req.tenantId]
      );

      // Update parent hub's updatedAt
      await updateDocumentHubModel(document.documentHubId, req.tenantId, { updatedAt: new Date() });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_deleted",
        { id },
      );

      {
        const hubName = (document as any).documentHub?.name as string | undefined;
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_DETAIL,
          action: Action.DELETE,
          actionLabel: `Document moved to trash${hubName ? ` from ${hubName}` : ""}`,
          entityType: EntityType.DOCUMENT,
          entityId: id,
          entityLabel: document.title,
          parentEntityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete document",
      } as ApiResponse);
    }
  }

  /**
   * Get trash items (hubs and documents)
   */
  static async getTrash(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { type } = req.query;

      let hubs: any[] = [];
      let docsFromTree: any[] = [];
      let folders: any[] = [];

      if (!type || type === "hub") {
        const hubsQuery = await pool.query(`
          SELECT dh.*,
            json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) as "deletedBy",
            json_build_object('id', p.id, 'name', p.name, 'code', p.code) as project
          FROM document_hub dh
          LEFT JOIN users u ON dh.deleted_by_id = u.id
          LEFT JOIN projects p ON dh."projectId" = p.id
          WHERE dh."tenantId" = $1 AND dh.is_deleted = true
          ORDER BY dh.deleted_at DESC
        `, [req.tenantId]);
        hubs = hubsQuery.rows.map(h => ({
          ...h,
          isDeleted: h.is_deleted,
          deletedAt: h.deleted_at,
          projectId: h.projectId,
          ticketId: h.ticketId
        }));
      }

      if (!type || type === "document" || type === "folder") {
        // Fetch all deleted nodes to filter root ones
        const allDeletedNodesQuery = await pool.query(`
          SELECT dt.*,
            json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) as "deletedBy",
            json_build_object('id', dh.id, 'name', dh.name) as "documentHub"
          FROM document_tree dt
          LEFT JOIN users u ON dt.deleted_by_id = u.id
          LEFT JOIN document_hub dh ON dt."documentHubId" = dh.id
          WHERE dt."tenantId" = $1 AND dt.is_deleted = true
        `, [req.tenantId]);
        const allDeletedNodes = allDeletedNodesQuery.rows.map(dt => ({
          ...dt,
          parentId: dt.parentId,
          documentId: dt.documentId,
          isDeleted: dt.is_deleted,
          deletedAt: dt.deleted_at
        }));

        // Identify root level deleted items (parent is not deleted)
        const rootDeletedNodes = allDeletedNodes.filter(node => {
          if (!node.parentId) return true;
          return !allDeletedNodes.some(n => n.id === node.parentId);
        });

        // Separate into documents and folders
        for (const node of rootDeletedNodes) {
          if (node.type === "file") {
            const docQuery = await pool.query(`
              SELECT d.*,
                json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u.avatar_url) as "deletedBy",
                json_build_object('id', dh.id, 'name', dh.name) as "documentHub"
              FROM documents d
              LEFT JOIN users u ON d.deleted_by_id = u.id
              LEFT JOIN document_hub dh ON d."documentHubId" = dh.id
              WHERE d.id = $1
            `, [node.documentId || '']);
            if (docQuery.rows.length > 0) {
              const doc = docQuery.rows[0];
              docsFromTree.push({
                ...doc,
                isDeleted: doc.is_deleted,
                deletedAt: doc.deleted_at,
                documentHubId: doc.documentHubId
              });
            }
          } else {
            folders.push(node);
          }
        }
      }

      res.status(200).json({
        success: true,
        data: { hubs, documents: docsFromTree, folders },
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get trash error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get trash items",
      } as ApiResponse);
    }
  }

  /**
   * Restore document hub
   */
  static async restoreDocumentHub(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const hubQuery = await pool.query(
        `SELECT * FROM document_hub WHERE id = $1 AND "tenantId" = $2 AND is_deleted = true`,
        [id, req.tenantId]
      );

      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document Hub not found in trash",
        } as ApiResponse);
        return;
      }

      const documentHub = hubQuery.rows[0];

      await updateDocumentHubModel(id, req.tenantId, {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:restored",
        documentHub,
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.DOCUMENT_HUB,
        page: Page.DOCUMENT_HUB_LIST,
        action: Action.RESTORE,
        actionLabel: "Document hub restored from trash",
        entityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Restore document hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to restore document hub",
      } as ApiResponse);
    }
  }

  /**
   * Restore document
   */
  static async restoreDocument(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const docQuery = await pool.query(
        `SELECT d.*, dh.name as hub_name FROM documents d JOIN document_hub dh ON d."documentHubId" = dh.id WHERE d.id = $1 AND d."tenantId" = $2 AND d.is_deleted = true`,
        [id, req.tenantId]
      );

      if (docQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document not found in trash",
        } as ApiResponse);
        return;
      }

      const document = docQuery.rows[0];

      await pool.query(
        `UPDATE documents SET is_deleted = false, deleted_at = NULL, deleted_by_id = NULL WHERE id = $1`,
        [id]
      );

      // Also restore associated tree node if it exists
      await pool.query(
        `UPDATE document_tree SET is_deleted = false, deleted_at = NULL, deleted_by_id = NULL WHERE "documentId" = $1 AND "tenantId" = $2 AND is_deleted = true`,
        [id, req.tenantId]
      );

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_restored",
        { id },
      );

      {
        const hubName = (document as any).documentHub?.name as string | undefined;
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_HUB_LIST,
          action: Action.RESTORE,
          actionLabel: `Document restored from trash${hubName ? ` to ${hubName}` : ""}`,
          entityType: EntityType.DOCUMENT,
          entityId: id,
          entityLabel: document.title,
          parentEntityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Restore document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to restore document",
      } as ApiResponse);
    }
  }

  /**
   * Restore tree node (folder/section)
   */
  static async restoreTreeNode(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { documentHubId, parentId } = req.body;

      if (!documentHubId) {
        res.status(400).json({
          success: false,
          error: "Target Document Hub ID is required",
        } as ApiResponse);
        return;
      }

      const nodeQuery = await pool.query(
        `SELECT * FROM document_tree WHERE id = $1 AND "tenantId" = $2 AND is_deleted = true`,
        [id, req.tenantId]
      );

      if (nodeQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Folder/Section not found in trash",
        } as ApiResponse);
        return;
      }

      const node = nodeQuery.rows[0];

      // Use a transaction for atomic recursive restoration
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Restore recursively and move to target hub
        await DocumentHubController.restoreNodeRecursive(
          client,
          id,
          req.tenantId,
          documentHubId,
          parentId || null // Move the root of the restored branch to the selected parent
        );
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_restored",
        { id, documentHubId },
      );

      {
        const hubForLogQuery = await pool.query(
          `SELECT name FROM document_hub WHERE id = $1`,
          [documentHubId]
        );
        const hubName = hubForLogQuery.rows.length > 0 ? hubForLogQuery.rows[0].name : undefined;
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_HUB_LIST,
          action: Action.RESTORE,
          actionLabel: `Document ${node.type} restored from trash${hubName ? ` to ${hubName}` : ""}`,
          entityType: node.type === "file" ? EntityType.DOCUMENT : EntityType.DOCUMENT_TREE_NODE,
          entityId: node.type === "file" && node.documentId ? node.documentId : node.id,
          entityLabel: node.title,
          parentEntityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Restore tree node error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to restore folder/section",
      } as ApiResponse);
    }
  }

  private static async restoreNodeRecursive(
    tx: any,
    nodeId: string,
    tenantId: string,
    documentHubId: string,
    parentId: string | null = null
  ): Promise<void> {
    // 1. Get the current node to know its type and documentId
    const nodeQuery = await tx.query(
      `SELECT type, "documentId" FROM document_tree WHERE id = $1`,
      [nodeId]
    );

    if (nodeQuery.rows.length === 0) return;
    const node = nodeQuery.rows[0];

    // 2. Restore current node and update its hub and parent
    await tx.query(
      `UPDATE document_tree SET is_deleted = false, deleted_at = NULL, deleted_by_id = NULL, "documentHubId" = $1, "parentId" = $2 WHERE id = $3`,
      [documentHubId, parentId, nodeId]
    );

    // 3. If it's a file, restore the document and update its hub
    if (node.type === "file" && node.documentId) {
      await tx.query(
        `UPDATE documents SET is_deleted = false, deleted_at = NULL, deleted_by_id = NULL, "documentHubId" = $1 WHERE id = $2`,
        [documentHubId, node.documentId]
      );
    }

    // 4. Find all deleted children that WERE deleted (presumably as part of this branch)
    const childrenQuery = await tx.query(
      `SELECT id FROM document_tree WHERE "parentId" = $1 AND "tenantId" = $2 AND is_deleted = true`,
      [nodeId, tenantId]
    );

    // 5. Recursively restore children, keeping the hierarchy but updating the hub
    for (const child of childrenQuery.rows) {
      await DocumentHubController.restoreNodeRecursive(
        tx, child.id, tenantId, documentHubId, nodeId
      );
    }
  }

  /**
   * Share document (update visibility and share token)
   */
  static async shareDocument(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { visibility, sharedWith = [] } = req.body;

      if (!['private', 'public'].includes(visibility)) {
        res.status(400).json({
          success: false,
          error: "Invalid visibility mode",
        } as ApiResponse);
        return;
      }

      const docQuery = await pool.query(
        `SELECT d.*, dh.name as hub_name FROM documents d JOIN document_hub dh ON d."documentHubId" = dh.id WHERE d.id = $1 AND d."tenantId" = $2 AND d.is_deleted = false`,
        [id, req.tenantId]
      );

      if (docQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document not found",
        } as ApiResponse);
        return;
      }

      const document = docQuery.rows[0];

      // Check ownership
      if (document.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to change sharing settings",
        } as ApiResponse);
        return;
      }

      let shareToken = document.shareToken;

      // Generate token if public and doesn't have one
      if (visibility === 'public') {
        if (!shareToken) {
          shareToken = crypto.randomBytes(32).toString('hex');
        }
      } else {
        shareToken = null;
      }

      const updatedDocQuery = await pool.query(
        `UPDATE documents SET visibility = $1, share_token = $2, shared_with = $3 WHERE id = $4 RETURNING *`,
        [visibility, shareToken, sharedWith, id]
      );
      const updatedDocument = updatedDocQuery.rows[0];

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_updated",
        updatedDocument,
      );

      if (visibility !== document.visibility) {
        const hubName = document.hub_name;
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_DETAIL,
          action: visibility === "public" ? Action.SHARE : Action.UNSHARE,
          actionLabel: `Document ${visibility === "public" ? "shared" : "made private"}${hubName ? ` in ${hubName}` : ""}`,
          entityType: EntityType.DOCUMENT,
          entityId: id,
          entityLabel: document.title,
          parentEntityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Share document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update sharing settings",
      } as ApiResponse);
    }
  }

  /**
   * Revoke sharing (set to private)
   */
  static async revokeShare(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const docQuery = await pool.query(
        `SELECT * FROM documents WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false`,
        [id, req.tenantId]
      );

      if (docQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document not found",
        } as ApiResponse);
        return;
      }

      const document = docQuery.rows[0];

      // Check ownership
      if (document.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to revoke sharing",
        } as ApiResponse);
        return;
      }

      await pool.query(
        `UPDATE documents SET visibility = 'private', share_token = NULL WHERE id = $1`,
        [id]
      );

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_updated",
        { id, visibility: 'private' },
      );

      res.status(200).json({
        success: true,
        message: "Document sharing revoked",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Revoke share error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to revoke sharing",
      } as ApiResponse);
    }
  }

  /**
   * Get public document by share token
   */
  static async getPublicDocument(req: any, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      const docQuery = await pool.query(`
        SELECT d.*, 
          json_build_object('name', dh.name, 'shareToken', dh.share_token, 'visibility', dh.visibility) as "documentHub",
          json_build_object('name', u.name, 'avatarUrl', u.avatar_url) as "createdBy"
        FROM documents d
        LEFT JOIN document_hub dh ON d."documentHubId" = dh.id
        LEFT JOIN users u ON d."createdById" = u.id
        WHERE d.share_token = $1 AND d.visibility = 'public' AND d.is_deleted = false
      `, [token]);

      if (docQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Public document not found or access expired",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: docQuery.rows[0],
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get public document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch public document",
      } as ApiResponse);
    }
  }

  /**
   * Share entire document hub
   */
  static async shareDocumentHub(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { visibility, sharedWith = [] } = req.body;

      if (!['private', 'public'].includes(visibility)) {
        res.status(400).json({
          success: false,
          error: "Invalid visibility mode",
        } as ApiResponse);
        return;
      }

      const hubQuery = await pool.query(
        `SELECT * FROM document_hub WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false`,
        [id, req.tenantId]
      );

      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document Hub not found",
        } as ApiResponse);
        return;
      }
      
      const hub = hubQuery.rows[0];

      // Check ownership
      if (hub.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to change sharing settings",
        } as ApiResponse);
        return;
      }

      let shareToken = hub.shareToken;

      // Generate token if public and doesn't have one
      if (visibility === 'public') {
        if (!shareToken) {
          shareToken = crypto.randomBytes(32).toString('hex');
        }
      } else {
        shareToken = null;
      }

      const updatedHubQuery = await pool.query(
        `UPDATE document_hub SET visibility = $1, share_token = $2, shared_with = $3 WHERE id = $4 RETURNING *`,
        [visibility, shareToken, sharedWith, id]
      );
      const updatedHub = updatedHubQuery.rows[0];

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:updated",
        updatedHub,
      );

      if (visibility !== hub.visibility) {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_HUB_LIST,
          action: visibility === "public" ? Action.SHARE : Action.UNSHARE,
          actionLabel: `Document hub ${visibility === "public" ? "shared" : "made private"}`,
          entityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Share document hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update hub sharing settings",
      } as ApiResponse);
    }
  }

  /**
   * Revoke document hub sharing
   */
  static async revokeHubShare(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const hubQuery = await pool.query(
        `SELECT * FROM document_hub WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false`,
        [id, req.tenantId]
      );

      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document Hub not found",
        } as ApiResponse);
        return;
      }

      const hub = hubQuery.rows[0];

      // Check ownership
      if (hub.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to revoke sharing",
        } as ApiResponse);
        return;
      }

      await pool.query(
        `UPDATE document_hub SET visibility = 'private', share_token = NULL WHERE id = $1`,
        [id]
      );

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:updated",
        { id, visibility: 'private' },
      );

      if (hub.visibility !== "private") {
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.DOCUMENT_HUB,
          page: Page.DOCUMENT_HUB_LIST,
          action: Action.UNSHARE,
          actionLabel: "Document hub sharing revoked",
          entityType: EntityType.DOCUMENT_HUB,
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Revoke hub share error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to revoke hub sharing",
      } as ApiResponse);
    }
  }

  /**
   * Get public document hub by share token
   */
  static async getPublicDocumentHub(req: any, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      const hubQuery = await pool.query(`
        SELECT dh.*,
          json_build_object('name', u.name, 'avatarUrl', u.avatar_url) as "createdBy"
        FROM document_hub dh
        LEFT JOIN users u ON dh."createdById" = u.id
        WHERE dh.share_token = $1 AND dh.visibility = 'public' AND dh.is_deleted = false
      `, [token]);

      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Public hub not found or access expired",
        } as ApiResponse);
        return;
      }
      
      const hub = hubQuery.rows[0];

        const treeNodesQuery = await pool.query(`
          SELECT dt.* FROM document_tree dt
          LEFT JOIN documents d ON dt."documentId" = d.id
          WHERE dt."documentHubId" = $1 AND dt.is_deleted = false
            AND (dt.type != 'file' OR d.visibility = 'public')
          ORDER BY dt.position ASC
        `, [hub.id]);

      hub.treeNodes = treeNodesQuery.rows;

      res.status(200).json({
        success: true,
        data: hub,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get public hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch public hub",
      } as ApiResponse);
    }
  }

  /**
   * Get content of a document within a public hub
   */
  static async getPublicHubDocumentContent(req: any, res: Response): Promise<void> {
    try {
      const { token, documentId } = req.params;

      // 1. Verify the hub exists and is public
      const hubQuery = await pool.query(`
        SELECT id FROM document_hub WHERE share_token = $1 AND visibility = 'public' AND is_deleted = false
      `, [token]);

      if (hubQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Public hub not found or access expired",
        } as ApiResponse);
        return;
      }
      const hub = hubQuery.rows[0];

      // 2. Verify the document belongs to this hub
      const docQuery = await pool.query(`
        SELECT d.*,
          json_build_object('name', u.name, 'avatarUrl', u.avatar_url) as "createdBy"
        FROM documents d
        LEFT JOIN users u ON d."createdById" = u.id
        WHERE d.id = $1 AND d."documentHubId" = $2 AND d.is_deleted = false
      `, [documentId, hub.id]);

      if (docQuery.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Document not found in this hub",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: docQuery.rows[0],
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get public hub document content error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch document content",
      } as ApiResponse);
    }
  }

  /**
   * Download Document as PDF using Puppeteer
   */
  static async downloadDocumentPdf(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }
      const { id } = req.params; // documentId
      const docQuery = await pool.query(
        `SELECT content, title FROM documents WHERE id = $1 AND "tenantId" = $2`,
        [id, req.tenantId]
      );

      if (docQuery.rows.length === 0) {
        res.status(404).json({ success: false, error: "Document not found" } as ApiResponse);
        return;
      }

      const document = docQuery.rows[0];
      // Convert BlockNote JSON content to HTML
      const blocks = (document.content as any[]) || [];
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
      const browser = await puppeteer.launch({
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
    } catch (error: any) {
      console.error("PDF generation error:", error);
      res.status(500).json({ success: false, error: "Failed to generate PDF" } as ApiResponse);
    }
  }
}
