import { Request, Response } from "express";
import { prisma } from "@/config/database";

export class PipelineStageController {
  // Create a new pipeline stage
  static async createPipelineStage(req: Request, res: Response) {
    try {
      const { name, color, probability, isFinal, isDefault, order } = req.body;
      const tenantId = (req as any).tenantId;

      if (!tenantId) {
        return res.status(400).json({ success: false, error: "Tenant context missing" });
      }

      // Check for name duplicates
      const existing = await prisma.pipelineStage.findUnique({
        where: {
          tenantId_name: {
            tenantId,
            name
          }
        }
      });

      if (existing) {
        return res.status(409).json({ success: false, error: "Stage name already exists" });
      }

      // Validation: Probability 0-100
      if (probability < 0 || probability > 100) {
        return res.status(400).json({ success: false, error: "Probability must be between 0 and 100" });
      }

      // Validation: Max 2 final stages
      if (isFinal) {
        const finalStagesCount = await prisma.pipelineStage.count({
          where: { tenantId, isFinal: true }
        });
        if (finalStagesCount >= 2) {
          return res.status(400).json({ success: false, error: "Only 2 final stages (e.g., Won and Lost) are allowed" });
        }
      }

      // If order not provided, put at the end
      let finalOrder = order;
      if (finalOrder === undefined) {
        const lastStage = await prisma.pipelineStage.findFirst({
          where: { tenantId },
          orderBy: { order: 'desc' }
        });
        finalOrder = lastStage ? lastStage.order + 1 : 0;
      }

      const stage = await prisma.$transaction(async (tx) => {
        const stageCount = await tx.pipelineStage.count({ where: { tenantId } });
        const shouldBeDefault = stageCount === 0 ? true : (isDefault || false);

        // If this is set to default, unset others
        if (shouldBeDefault) {
          await tx.pipelineStage.updateMany({
            where: { tenantId },
            data: { isDefault: false }
          });
        }

        return tx.pipelineStage.create({
          data: {
            tenantId,
            name,
            color,
            probability,
            isFinal,
            isDefault: shouldBeDefault,
            order: finalOrder
          },
        });
      });

      res.status(201).json({ success: true, data: stage });
    } catch (error: any) {
      console.error("Error creating pipeline stage:", error);
      res.status(500).json({ success: false, error: "Failed to create pipeline stage" });
    }
  }

  // Get all pipeline stages for the tenant
  static async getAllPipelineStages(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenantId;

      if (!tenantId) {
        return res.status(400).json({ success: false, error: "Tenant context missing" });
      }

      const stages = await prisma.pipelineStage.findMany({
        where: { tenantId },
        orderBy: { order: 'asc' }
      });

      res.status(200).json({ success: true, data: stages });
    } catch (error: any) {
      console.error("Error fetching pipeline stages:", error);
      res.status(500).json({ success: false, error: "Failed to fetch pipeline stages" });
    }
  }

  // Update a pipeline stage
  static async updatePipelineStage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = (req as any).tenantId;
      const { name, color, probability, isFinal, isDefault, order } = req.body;

      const existing = await prisma.pipelineStage.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: "Pipeline stage not found" });
      }

      // Name duplicate check
      if (name && name !== existing.name) {
        const duplicate = await prisma.pipelineStage.findUnique({
          where: {
            tenantId_name: {
              tenantId,
              name
            }
          }
        });
        if (duplicate) {
          return res.status(409).json({ success: false, error: "Stage name already exists" });
        }
      }

      // Probability validation
      if (probability !== undefined && (probability < 0 || probability > 100)) {
        return res.status(400).json({ success: false, error: "Probability must be between 0 and 100" });
      }

      // Final stage validation
      if (isFinal === true && existing.isFinal === false) {
        const finalStagesCount = await prisma.pipelineStage.count({
          where: { tenantId, isFinal: true }
        });
        if (finalStagesCount >= 2) {
          return res.status(400).json({ success: false, error: "Only 2 final stages are allowed" });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        // If setting this one to default, unset others first
        if (isDefault === true) {
          await tx.pipelineStage.updateMany({
            where: { tenantId, id: { not: id } },
            data: { isDefault: false }
          });
        } else if (isDefault === false && existing.isDefault === true) {
          // Prevent unsetting the ONLY default stage
          const otherDefault = await tx.pipelineStage.findFirst({
            where: { tenantId, id: { not: id }, isDefault: true }
          });
          if (!otherDefault) {
            throw new Error("Cannot unset the default stage. Please set another stage as default first.");
          }
        }

        return tx.pipelineStage.update({
          where: { id },
          data: {
            name,
            color,
            probability,
            isFinal,
            isDefault,
            order
          },
        });
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      console.error("Error updating pipeline stage:", error);
      res.status(500).json({ success: false, error: "Failed to update pipeline stage" });
    }
  }

  // Delete a pipeline stage
  static async deletePipelineStage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = (req as any).tenantId;

      const existing = await prisma.pipelineStage.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: "Pipeline stage not found" });
      }

      await prisma.pipelineStage.delete({
        where: { id },
      });

      res.status(200).json({ success: true, message: "Pipeline stage deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting pipeline stage:", error);
      res.status(500).json({ success: false, error: "Failed to delete pipeline stage" });
    }
  }

  // Reorder pipeline stages
  static async reorderPipelineStages(req: Request, res: Response) {
    try {
      const { stageIds } = req.body; // Array of IDs in the desired order
      const tenantId = (req as any).tenantId;

      if (!stageIds || !Array.isArray(stageIds)) {
        return res.status(400).json({ success: false, error: "Invalid stageIds provided" });
      }

      // Perform transaction to update orders
      await prisma.$transaction(
        stageIds.map((id, index) =>
          prisma.pipelineStage.update({
            where: { id, tenantId },
            data: { order: index }
          })
        )
      );

      res.status(200).json({ success: true, message: "Stages reordered successfully" });
    } catch (error: any) {
      console.error("Error reordering pipeline stages:", error);
      res.status(500).json({ success: false, error: "Failed to reorder pipeline stages" });
    }
  }
}
