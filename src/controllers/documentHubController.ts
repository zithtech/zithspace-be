import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import { socketService } from "@/services/socketService";
import { generateDocumentDraft, rewriteSelection } from "@/services/aiDocumentService";
import crypto from "crypto";

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

      const { draft, source, fallbackReason } = await generateDocumentDraft(seed);

      res.status(200).json({
        success: true,
        data: { ...draft, source, fallbackReason },
        message: "Document draft generated",
      } as ApiResponse);
    } catch (error: any) {
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

      const result = await rewriteSelection(cleanText, cleanInstruction);

      res.status(200).json({
        success: true,
        data: result,
        message: "Selection rewritten",
      } as ApiResponse);
    } catch (error: any) {
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

      const { name, projectId, ticketId, visibility: bodyVisibility } = req.body ?? {};
      const visibility = bodyVisibility || 'public';

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

      // Validate project if provided
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            tenantId: req.tenantId,
          },
        });

        if (!project) {
          throw new ValidationError("Project not found in this tenant");
        }
      }
      // Create documentHub
      const documentHub = await prisma.documentHub.create({
        data: {
          tenantId: req.tenantId,
          name,
          projectId: projectId,
          ticketId: ticketId,
          createdById: req.user.id,
          visibility: visibility as any,
          shareToken: hubShareToken as any,
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
        docShareToken = crypto.randomBytes(32).toString('hex');
      }

      // Create "Overview" document
      const doc = await prisma.document.create({
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
          visibility: visibility as any,
          shareToken: docShareToken as any,
        },
      });

      const documentTree = await prisma.documentTree.create({
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
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:created",
        documentHub,
      );

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

      // Fetch accessible documents for this user
      const accessibleDocs = await prisma.document.findMany({
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

      const documentHub = await prisma.documentHub.findFirst({
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
            select: { id: true, name: true, workEmail: true, avatarUrl: true },
          },
        },
      });

      if (!documentHub) {
        res.status(404).json({
          success: false,
          error: "Document Hub not found",
        } as ApiResponse);
        return;
      }

      // If user is not the creator, prune empty folders/sections in the tree
      if (documentHub.createdById !== req.user.id) {
        const nodes = documentHub.treeNodes;
        const visibleNodeIds = new Set<string>();
        const nodeMap = new Map<string, any>();

        nodes.forEach(node => nodeMap.set(node.id, { ...node, children: [] }));

        // Link children
        nodes.forEach(node => {
          if (node.parentId && nodeMap.has(node.parentId)) {
            nodeMap.get(node.parentId).children.push(node.id);
          }
        });

        const isNodeVisible = (nodeId: string): boolean => {
          const node = nodeMap.get(nodeId);
          if (!node) return false;

          if (node.type === 'file') {
            // Accessible file nodes are already filtered by the query, but double check
            return !!node.documentId && accessibleDocIds.includes(node.documentId);
          }

          // For folder/section, visible if any child is visible
          return node.children.some((childId: string) => isNodeVisible(childId));
        };

        const filteredNodes = nodes.filter(node => isNodeVisible(node.id));
        (documentHub as any).treeNodes = filteredNodes;
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

      const { documentHubId, parentId, type, title } = req.body;

      if (!documentHubId || !title || !type) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        } as ApiResponse);
        return;
      }

      // Find last position in the same level
      const lastNode = await prisma.documentTree.findFirst({
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
        const doc = await prisma.document.create({
          data: {
            tenantId: req.tenantId,
            documentHubId,
            title,
            content: [], // Default empty content for Blocknote
            createdById: req.user.id,
            visibility: "public",
            shareToken: crypto.randomBytes(32).toString("hex"),
          },
        });
        documentId = doc.id;
      }

      const newNode = await prisma.documentTree.create({
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

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_created",
        newNode,
      );

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

      const node = await prisma.documentTree.findFirst({
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
        } as ApiResponse);
        return;
      }

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
          const parent = await prisma.documentTree.findFirst({
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
            cursor = await prisma.documentTree.findFirst({
              where: {
                id: cursor.parentId,
                tenantId: req.tenantId,
                isDeleted: false,
              },
            });
          }
        }
      }

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (parentId !== undefined) updateData.parentId = parentId;

      const updatedNode = await prisma.documentTree.update({
        where: { id },
        data: updateData,
      });

      // If it's a file and has a documentId, update the document title too
      if (
        title !== undefined &&
        node.type === "file" &&
        node.documentId
      ) {
        await prisma.document.update({
          where: { id: node.documentId },
          data: { title },
        });
      }

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_updated",
        updatedNode,
      );

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

      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: document,
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

      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

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
        (document as any).version !== expectedVersion
      ) {
        res.status(409).json({
          success: false,
          error: "Document was modified by another session",
          data: {
            currentVersion: (document as any).version,
            expectedVersion,
            document,
          },
        } as ApiResponse);
        return;
      }

      // Atomic version check + bump in a single SQL statement so two concurrent
      // requests can't both pass the check above and then both overwrite.
      // updateMany returns the affected row count; 0 means somebody else won.
      const writeWhere: any = { id, tenantId: req.tenantId };
      if (expectedVersion !== undefined && expectedVersion !== null) {
        writeWhere.version = expectedVersion;
      }
      const updateResult = await prisma.document.updateMany({
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
        const fresh = await prisma.document.findFirst({
          where: { id, tenantId: req.tenantId, isDeleted: false },
        });
        res.status(409).json({
          success: false,
          error: "Document was modified by another session",
          data: {
            currentVersion: fresh ? (fresh as any).version : null,
            expectedVersion,
            document: fresh,
          },
        } as ApiResponse);
        return;
      }

      const updatedDocument = await prisma.document.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      // Create history entry
      if (content !== undefined) {
        await prisma.documentHistory.create({
          data: {
            documentId: id,
            tenantId: req.tenantId,
            content: content,
            createdById: req.user.id,
          },
        });
      }

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_updated",
        updatedDocument,
      );

      res.status(200).json({
        success: true,
        data: updatedDocument,
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

      // Verify the hub exists and belongs to this tenant before recording a
      // star against it.
      // The Prisma-managed `document_hub` table stores id/tenantId as TEXT,
      // not UUID — so do NOT cast the parameters here.
      const hubRows: Array<{ id: string }> = await prisma.$queryRaw`
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
        } as ApiResponse);
        return;
      }

      // Generate the UUID in Node so we don't depend on the pgcrypto extension
      // being enabled on the database.
      const newId = crypto.randomUUID();
      await prisma.$executeRaw`
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

      await prisma.$executeRaw`
        DELETE FROM document_hub_stars
        WHERE user_id = ${req.user.id}::uuid
          AND hub_id  = ${hubId}::uuid
          AND tenant_id = ${req.tenantId}::uuid
      `;

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

      // The Prisma-managed `document_history` table stores id/documentId/
      // tenantId as TEXT — do NOT cast the parameters to ::uuid.
      const rows: Array<{ id: string; created_at: Date }> =
        await prisma.$queryRaw`
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
        } as ApiResponse);
        return;
      }

      // Refuse to delete the most-recent version — it represents the live
      // document state and removing it would leave the doc in an inconsistent
      // history.
      const latest: Array<{ id: string }> = await prisma.$queryRaw`
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
        } as ApiResponse);
        return;
      }

      await prisma.$executeRaw`
        DELETE FROM document_history
        WHERE id = ${historyId}
          AND "documentId" = ${documentId}
          AND "tenantId" = ${req.tenantId}
      `;

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

      const history = await (prisma.documentHistory as any).findMany({
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
      const accessibleDocs = await prisma.document.findMany({
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

      const documentHubs = await prisma.documentHub.findMany({
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
        if (hub.createdById === req.user!.id) return true;

        const docs = hub.documents || [];
        if (docs.length <= 0) return false;

        const hasPublicDoc = docs.some((doc) => doc.visibility === "public");
        if (!hasPublicDoc) return false;

        return true;
      });

      // Fetch this user's stars in one shot via raw SQL and decorate the
      // hubs with `isStarred`.
      const starredRows: Array<{ hub_id: string }> = await prisma.$queryRaw`
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get all document hubs error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get all document hubs",
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

      const documentHub = await prisma.documentHub.findFirst({
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
        } as ApiResponse);
        return;
      }

      await prisma.documentHub.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id,
        },
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:deleted",
        { id },
      );

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

      const documentHub = await prisma.documentHub.findFirst({
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
        } as ApiResponse);
        return;
      }

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
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            tenantId: req.tenantId,
          },
        });

        if (!project) {
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

      const updatedDocumentHub = await prisma.documentHub.update({
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
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:updated",
        updatedDocumentHub,
      );

      res.status(200).json({
        success: true,
        data: updatedDocumentHub,
        debug: {
          receivedTicketId: ticketId,
          updatedAt: updateData.updatedAt
        },
        message: "Document Hub updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update document hub error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

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

      const node = await prisma.documentTree.findFirst({
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
        } as ApiResponse);
        return;
      }

      // Check ownership
      if (node.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "Only authorized users can delete this item",
        } as ApiResponse);
        return;
      }

      // Use a transaction for atomic recursive deletion
      await prisma.$transaction(async (tx) => {
        await DocumentHubController.deleteNodeRecursive(
          tx,
          id,
          req.tenantId,
          req.user!.id,
          node.type,
          node.documentId,
        );
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_deleted",
        { id },
      );

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
    tx: any, // Prisma transaction client
    nodeId: string,
    tenantId: string,
    deletedById: string,
    nodeType?: string,
    documentId?: string | null,
  ): Promise<void> {
    // 1. Get all children of this node
    const children = await tx.documentTree.findMany({
      where: {
        parentId: nodeId,
        tenantId,
      },
    });

    // 2. Recursively delete each child
    for (const child of children) {
      await DocumentHubController.deleteNodeRecursive(
        tx,
        child.id,
        tenantId,
        deletedById,
        child.type,
        child.documentId,
      );
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
      } catch (error) {
        console.error(`Failed to soft-delete document ${documentId}:`, error);
        // We don't throw here to allow the tree node deletion to commit
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

      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

      // Check ownership
      if (document.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "Only authorized users can delete this item",
        } as ApiResponse);
        return;
      }

      // Soft delete the document
      await prisma.document.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id,
        },
      });

      // Also soft delete associated tree node if it exists
      await prisma.documentTree.updateMany({
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

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_deleted",
        { id },
      );

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
        hubs = await prisma.documentHub.findMany({
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
        const allDeletedNodes = await prisma.documentTree.findMany({
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
          if (!node.parentId) return true;
          return !allDeletedNodes.some(n => n.id === node.parentId);
        });

        // Separate into documents and folders
        for (const node of rootDeletedNodes) {
          if (node.type === "file") {
            const doc = await prisma.document.findUnique({
              where: { id: node.documentId || '' },
              include: {
                deletedBy: { select: { id: true, name: true, avatarUrl: true } },
                documentHub: { select: { id: true, name: true } }
              }
            });
            if (doc) docsFromTree.push(doc);
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

      const documentHub = await prisma.documentHub.findFirst({
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
        } as ApiResponse);
        return;
      }

      await prisma.documentHub.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedById: null,
        },
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:restored",
        documentHub,
      );

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

      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

      await prisma.document.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedById: null,
        },
      });

      // Also restore associated tree node if it exists
      await prisma.documentTree.updateMany({
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
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_restored",
        { id },
      );

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

      const node = await prisma.documentTree.findFirst({
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
        } as ApiResponse);
        return;
      }

      // Use a transaction for atomic recursive restoration
      await prisma.$transaction(async (tx) => {
        // Restore recursively and move to target hub
        await DocumentHubController.restoreNodeRecursive(
          tx,
          id,
          req.tenantId,
          documentHubId,
          parentId || null // Move the root of the restored branch to the selected parent
        );
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:node_restored",
        { id, documentHubId },
      );

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
    const node = await tx.documentTree.findUnique({
      where: { id: nodeId }
    });

    if (!node) return;

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
      await DocumentHubController.restoreNodeRecursive(
        tx,
        child.id,
        tenantId,
        documentHubId,
        nodeId // Keep as child of the current restored node
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
      const { visibility } = req.body;

      if (!['private', 'public'].includes(visibility)) {
        res.status(400).json({
          success: false,
          error: "Invalid visibility mode",
        } as ApiResponse);
        return;
      }

      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

      // Check ownership
      if (document.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to change sharing settings",
        } as ApiResponse);
        return;
      }

      let shareToken = (document as any).shareToken;

      // Generate token if public and doesn't have one
      if (visibility === 'public') {
        if (!shareToken) {
          shareToken = crypto.randomBytes(32).toString('hex');
        }
      } else {
        shareToken = null;
      }

      const updatedDocument = await prisma.document.update({
        where: { id },
        data: {
          visibility,
          shareToken,
        },
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:document_updated",
        updatedDocument,
      );

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

      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

      // Check ownership
      if (document.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to revoke sharing",
        } as ApiResponse);
        return;
      }

      await prisma.document.update({
        where: { id },
        data: {
          visibility: 'private',
          shareToken: null,
        },
      });

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

      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: document,
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
      const { visibility } = req.body;

      if (!['private', 'public'].includes(visibility)) {
        res.status(400).json({
          success: false,
          error: "Invalid visibility mode",
        } as ApiResponse);
        return;
      }

      const hub = await prisma.documentHub.findFirst({
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
        } as ApiResponse);
        return;
      }

      // Check ownership
      if (hub.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to change sharing settings",
        } as ApiResponse);
        return;
      }

      let shareToken = (hub as any).shareToken;

      // Generate token if public and doesn't have one
      if (visibility === 'public') {
        if (!shareToken) {
          shareToken = crypto.randomBytes(32).toString('hex');
        }
      } else {
        shareToken = null;
      }

      const updatedHub = await prisma.documentHub.update({
        where: { id },
        data: {
          visibility: visibility as any,
          shareToken: shareToken as any,
        },
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:updated",
        updatedHub,
      );

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

      const hub = await prisma.documentHub.findFirst({
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
        } as ApiResponse);
        return;
      }

      // Check ownership
      if (hub.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "You don't have permission to revoke sharing",
        } as ApiResponse);
        return;
      }

      await prisma.documentHub.update({
        where: { id },
        data: {
          visibility: 'private' as any,
          shareToken: null as any,
        },
      });

      // Emit socket event
      socketService.emitToTenant(
        req.tenantId,
        "documenthub:updated",
        { id, visibility: 'private' },
      );

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

      const hub = await prisma.documentHub.findFirst({
        where: {
          shareToken: token as any,
          visibility: 'public' as any,
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
        } as ApiResponse);
        return;
      }

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
      const hub = await prisma.documentHub.findFirst({
        where: {
          shareToken: token as any,
          visibility: 'public' as any,
          isDeleted: false,
        },
      });

      if (!hub) {
        res.status(404).json({
          success: false,
          error: "Public hub not found or access expired",
        } as ApiResponse);
        return;
      }

      // 2. Verify the document belongs to this hub
      const document = await prisma.document.findFirst({
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
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: document,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get public hub document content error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch document content",
      } as ApiResponse);
    }
  }
}
