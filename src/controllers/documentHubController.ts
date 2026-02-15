import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import { socketService } from "@/services/socketService";

export class DocumentHubController {
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

      const { name, projectId, ticketId } = req.body ?? {};

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
      const doc = await prisma.document.create({
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

      const documentTree = await prisma.documentTree.create({
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

      const documentHub = await prisma.documentHub.findFirst({
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
      const { title } = req.body;

      if (!title) {
        res.status(400).json({
          success: false,
          error: "Title is required",
        } as ApiResponse);
        return;
      }

      const node = await prisma.documentTree.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!node) {
        res.status(404).json({
          success: false,
          error: "Node not found",
        } as ApiResponse);
        return;
      }

      const updatedNode = await prisma.documentTree.update({
        where: { id },
        data: { title },
      });

      // If it's a file and has a documentId, update the document title too
      if (node.type === "file" && node.documentId) {
        await prisma.document.update({
          where: { id: node.documentId },
          data: { title },
        });
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
      const { content, title } = req.body;

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

      const updatedDocument = await prisma.document.update({
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
        await prisma.documentHistory.create({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update document",
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

      const history = await prisma.documentHistory.findMany({
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

      const documentHubs = await prisma.documentHub.findMany({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get all document hubs error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get all document hubs",
      } as ApiResponse);
    }
  }

  static async deleteDocumentHub(req: AuthRequest, res: Response): Promise<void> {
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

  static async restoreDocumentHub(req: AuthRequest, res: Response): Promise<void> {
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

      res.status(200).json({
        success: true,
        message: "Document Hub restored",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Restore document hub error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to restore document hub",
      } as ApiResponse);
    }
  }

  static async deleteDocument(req: AuthRequest, res: Response): Promise<void> {
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

      await prisma.$transaction(async (tx) => {
        // Soft delete document
        await tx.document.update({
          where: { id },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedById: req.user!.id,
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
              deletedById: req.user!.id,
            },
          });
        }
      });

      res.status(200).json({
        success: true,
        message: "Document moved to trash",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete document error:", error);
      res.status(500).json({
        success: false,
        error: `Failed to delete document: ${error.message}`,
      } as ApiResponse);
    }
  }

  static async restoreDocument(req: AuthRequest, res: Response): Promise<void> {
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

      await prisma.$transaction(async (tx) => {
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Restore document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to restore document",
      } as ApiResponse);
    }
  }

  static async getTrash(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const deletedHubs = await prisma.documentHub.findMany({
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

      const deletedDocuments = await prisma.document.findMany({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get trash error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get trash items",
      } as ApiResponse);
    }
  }

  // ========== DOCUMENT SHARING ==========

  static async shareDocument(req: AuthRequest, res: Response): Promise<void> {
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

      if (!visibility || !["private", "internal", "public"].includes(visibility)) {
        res.status(400).json({
          success: false,
          error: "Invalid visibility. Must be one of: private, internal, public",
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

      const updateData: any = {
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
      } else {
        // Clear share token for non-public visibility
        updateData.shareToken = null;
      }

      const updatedDocument = await prisma.document.update({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Share document error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to share document",
      } as ApiResponse);
    }
  }

  static async revokeShare(req: AuthRequest, res: Response): Promise<void> {
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

      await prisma.document.update({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Revoke share error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to revoke share",
      } as ApiResponse);
    }
  }

  static async getPublicDocument(req: any, res: Response): Promise<void> {
    try {
      const { shareToken } = req.params;

      if (!shareToken) {
        res.status(400).json({
          success: false,
          error: "Share token is required",
        } as ApiResponse);
        return;
      }

      const document = await prisma.document.findFirst({
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
        error: "Failed to get public document",
      } as ApiResponse);
    }
  }
}
