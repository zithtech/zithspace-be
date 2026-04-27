import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { AIService } from "@/services/aiService";
import { prisma } from "@/config/database";

export class AIController {
  /**
   * Generate a document hub structure
   */
  static async generateStructure(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        res.status(400).json({ success: false, error: "Prompt is required" } as ApiResponse);
        return;
      }

      const result = await AIService.generateHubStructure(prompt);

      res.status(200).json({
        success: true,
        data: result,
      } as ApiResponse);
    } catch (error: any) {
      console.error("AI Controller Structure Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to generate structure",
      } as ApiResponse);
    }
  }

  /**
   * Generate content for a document
   */
  static async generateContent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { title, context } = req.body;
      if (!title) {
        res.status(400).json({ success: false, error: "Title is required" } as ApiResponse);
        return;
      }

      const content = await AIService.generateDocumentContent(title, context || "");

      res.status(200).json({
        success: true,
        data: content,
      } as ApiResponse);
    } catch (error: any) {
      console.error("AI Controller Content Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to generate content",
      } as ApiResponse);
    }
  }

  /**
   * Execute AI-driven hub creation (Bulk create nodes)
   */
  static async executeHubCreation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Authentication required" } as ApiResponse);
        return;
      }

      const { hubId, structure } = req.body;
      if (!hubId || !structure) {
        res.status(400).json({ success: false, error: "Hub ID and structure are required" } as ApiResponse);
        return;
      }

      // Fetch hub details to provide context for AI content generation
      const hub = await prisma.documentHub.findUnique({
        where: { id: hubId },
        include: {
          project: true,
          ticket: true,
        },
      });

      const hubContext = hub ? `
        Hub Name: ${hub.name}
        ${hub.project ? `Project: ${hub.project.name} (${hub.project.description || ""})` : ""}
        ${hub.ticket ? `Ticket: ${hub.ticket.title} (ID: ${hub.ticket.ticketNumber || hub.ticket.id})` : ""}
      ` : "";

      // Helper function to recursively create nodes sequentially to avoid rate limits
      const createNodes = async (nodes: any[], parentId: string | null = null) => {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          let documentId = null;
          // Every node gets a document for "minimum content" as requested
          try {
            const content = await AIService.generateDocumentContent(
              node.title, 
              `${node.contentPrompt || ""} \n\nRelated Context:\n${hubContext}`.trim() || `Minimum content for ${node.type}: ${node.title}`
            );
            
            const doc = await prisma.document.create({
              data: {
                tenantId: req.tenantId!,
                documentHubId: hubId,
                title: node.title,
                content: content,
                createdById: req.user!.id,
                visibility: "public"
              },
            });
            documentId = doc.id;
          } catch (error) {
            console.error(`Failed to generate content for ${node.title}:`, error);
            // Fallback to empty if AI fails
            const doc = await prisma.document.create({
              data: {
                tenantId: req.tenantId!,
                documentHubId: hubId,
                title: node.title,
                content: [],
                createdById: req.user!.id,
              },
            });
            documentId = doc.id;
          }

          const newNode = await prisma.documentTree.create({
            data: {
              tenantId: req.tenantId!,
              documentHubId: hubId,
              parentId: parentId,
              title: node.title,
              type: node.type,
              position: i,
              createdById: req.user!.id,
              documentId: documentId,
            },
          });

          if (node.children && node.children.length > 0) {
            await createNodes(node.children, newNode.id);
          }
        }
      };

      await createNodes(structure);

      res.status(201).json({
        success: true,
        message: "AI-generated structure created successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("AI Controller Execute Creation Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to execute AI hub creation",
      } as ApiResponse);
    }
  }

  /**
   * Process selected text
   */
  static async processText(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { selectedText, prompt } = req.body;
      if (!selectedText || !prompt) {
        res.status(400).json({ success: false, error: "Selected text and prompt are required" } as ApiResponse);
        return;
      }

      const processedText = await AIService.processSelectedText(selectedText, prompt);

      res.status(200).json({
        success: true,
        data: processedText,
      } as ApiResponse);
    } catch (error: any) {
      console.error("AI Controller Process Text Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to process text",
      } as ApiResponse);
    }
  }

  /**
   * Create the skeleton structure for a Document Hub AND generate content in a single pass
   */
  static async executeHubStructure(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Authentication required" } as ApiResponse);
        return;
      }

      const { hubId, structure } = req.body;
      if (!hubId || !structure) {
        res.status(400).json({ success: false, error: "Hub ID and structure are required" } as ApiResponse);
        return;
      }

      // Fetch hub details for context
      const hub = await prisma.documentHub.findUnique({
        where: { id: hubId },
        include: { project: true, ticket: true }
      });

      const hubContext = hub ? `
        Hub Name: ${hub.name}
        ${hub.project ? `Project: ${hub.project.name} (${hub.project.description || ""})` : ""}
        ${hub.ticket ? `Ticket: ${hub.ticket.title} (ID: ${hub.ticket.ticketNumber || hub.ticket.id})` : ""}
      ` : "";

      // 1. Flatten structure to find all files
      const filesToGenerate: { title: string, contentPrompt?: string }[] = [];
      const findFiles = (nodes: any[]) => {
        nodes.forEach(node => {
          if (node.type === "file") {
            filesToGenerate.push({ title: node.title, contentPrompt: node.contentPrompt });
          }
          if (node.children && node.children.length > 0) {
            findFiles(node.children);
          }
        });
      };
      findFiles(structure);

      // 2. Generate all content in ONE AI call
      let bulkContent: Record<string, any[]> = {};
      if (filesToGenerate.length > 0) {
        bulkContent = await AIService.generateBulkDocumentContent(filesToGenerate, hubContext);
      }

      const createdNodes: { documentId: string; title: string; type: string }[] = [];

      // 3. Helper function to recursively create nodes with the generated content
      const createNodes = async (nodes: any[], parentId: string | null = null) => {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          
          let documentId: string | null = null;

          // Only create a Document record if it's a file
          if (node.type === "file") {
            const content = bulkContent[node.title] || [];
            const doc = await prisma.document.create({
              data: {
                tenantId: req.tenantId!,
                documentHubId: hubId,
                title: node.title,
                content: content,
                createdById: req.user!.id,
                visibility: "public"
              },
            });
            documentId = doc.id;
          }

          const newNode = await prisma.documentTree.create({
            data: {
              tenantId: req.tenantId!,
              documentHubId: hubId,
              parentId: parentId,
              title: node.title,
              type: node.type,
              position: i,
              createdById: req.user!.id,
              documentId: documentId,
            },
          });

          createdNodes.push({
            documentId: documentId || "",
            title: node.title,
            type: node.type
          });

          if (node.children && node.children.length > 0) {
            await createNodes(node.children, newNode.id);
          }
        }
      };

      await createNodes(structure);

      res.status(201).json({
        success: true,
        data: createdNodes,
        message: "Hub structure and content generated successfully in one pass",
      } as ApiResponse);
    } catch (error: any) {
      console.error("AI Controller Unified Creation Error:", error);
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * Generate AI content for a specific document and save it
   */
  static async updateDocumentWithAIContent(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Authentication required" } as ApiResponse);
        return;
      }

      const { documentId } = req.params;
      const { contentPrompt } = req.body;

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          documentHub: {
            include: {
              project: true,
              ticket: true
            }
          }
        }
      });

      if (!doc) {
        res.status(404).json({ success: false, error: "Document not found" } as ApiResponse);
        return;
      }

      const hub = doc.documentHub;
      const hubContext = `
        Hub Name: ${hub.name}
        ${hub.project ? `Project: ${hub.project.name} (${hub.project.description || ""})` : ""}
        ${hub.ticket ? `Ticket: ${hub.ticket.title} (ID: ${hub.ticket.ticketNumber || hub.ticket.id})` : ""}
      `;

      const content = await AIService.generateDocumentContent(
        doc.title,
        `${contentPrompt || ""} \n\nRelated Context:\n${hubContext}`.trim()
      );

      const updatedDoc = await prisma.document.update({
        where: { id: documentId },
        data: { content },
      });

      res.status(200).json({
        success: true,
        data: updatedDoc,
      } as ApiResponse);
    } catch (error: any) {
      console.error("AI Controller Update Content Error:", error);
      res.status(500).json({ success: false, error: error.message } as ApiResponse);
    }
  }
}
