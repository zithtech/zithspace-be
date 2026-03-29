import { Request, Response } from "express";
import prisma from "@/config/database";
import { calculateSalaryStructure, SalaryComponentInput } from "../utils/salaryCalculation";

export class SalaryStructureController {
  // Create Salary Structure
  static async createSalaryStructure(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { name, effectiveFrom, description, components } = req.body;

      if (!name || !components || !Array.isArray(components)) {
        res.status(400).json({ success: false, error: "Missing required fields: name, components" });
        return;
      }

      // Fetch component types and codes from DB to ensure accuracy
      const dbComponents = await prisma.salaryComponent.findMany({
        where: {
          key: { in: components.map((c: any) => parseInt(c.componentId)) },
          tenantId
        }
      });

      let totalPercentage = 0;
      // Prepare component data for storage (Rule-only, no calculatedAmount)
      const structureComponents = components.map((comp: any, index: number) => {
        const dbComp = dbComponents.find((dbc) => dbc.key === parseInt(comp.componentId));
        if (!dbComp) throw new Error(`Component with ID ${comp.componentId} not found`);

        if (dbComp.type === "Earning" && comp.calculationType === "PERCENTAGE") {
          totalPercentage += parseFloat(comp.value || 0);
        }

        return {
          componentId: dbComp.key,
          calculationType: comp.calculationType,
          percentageBasis: comp.percentageBasis || null,
          value: parseFloat(comp.value || 0),
          displayOrder: comp.displayOrder ? parseInt(comp.displayOrder) : index,
        };
      });

      if (totalPercentage > 100) {
        res.status(400).json({ success: false, error: `Total earning percentage (${totalPercentage}%) cannot exceed 100%` });
        return;
      }

      const newStructure = await prisma.salaryStructure.create({
        data: {
          tenantId,
          name,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
          description: description || "",
          components: {
            create: structureComponents,
          },
        },
        include: {
          components: {
            include: {
              component: true,
            },
          },
        },
      });

      res.status(201).json({ success: true, data: newStructure, message: "Salary structure created successfully" });
    } catch (error: any) {
      console.error("Error creating salary structure:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to create salary structure" });
    }
  }

  // Get All Salary Structures
  static async getSalaryStructures(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;

      const structures = await prisma.salaryStructure.findMany({
        where: { tenantId },
        include: {
          components: {
            include: {
              component: true,
            },
            orderBy: {
              displayOrder: 'asc'
            }
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({ success: true, data: structures });
    } catch (error: any) {
      console.error("Error fetching salary structures:", error);
      res.status(500).json({ success: false, error: "Failed to fetch salary structures" });
    }
  }

  // Get Salary Structure by ID
  static async getSalaryStructureById(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;

      const structure = await prisma.salaryStructure.findFirst({
        where: { id, tenantId },
        include: {
          components: {
            include: {
              component: true,
            },
            orderBy: {
              displayOrder: 'asc'
            }
          },
        },
      });

      if (!structure) {
        res.status(404).json({ success: false, error: "Salary structure not found" });
        return;
      }

      res.status(200).json({ success: true, data: structure });
    } catch (error: any) {
      console.error("Error fetching salary structure:", error);
      res.status(500).json({ success: false, error: "Failed to fetch salary structure" });
    }
  }

  // Update Salary Structure
  static async updateSalaryStructure(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      const { name, effectiveFrom, description, isActive, components } = req.body;

      const existing = await prisma.salaryStructure.findFirst({
        where: { id, tenantId }
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Salary structure not found" });
        return;
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (effectiveFrom) updateData.effectiveFrom = new Date(effectiveFrom);
      if (description !== undefined) updateData.description = description;
      if (isActive !== undefined) updateData.isActive = isActive;
      // Note: grossSalary and employeeType are explicitly omitted from updates

      // Wrap in a transaction to safely handle components update
      const updatedStructure = await prisma.$transaction(async (tx) => {
        // Validate and prepare components if provided
        let structureComponents = null;
        if (components && Array.isArray(components)) {
          const dbComponents = await tx.salaryComponent.findMany({
            where: {
              key: { in: components.map((c: any) => parseInt(c.componentId)) },
              tenantId
            }
          });

          let totalPercentage = 0;
          structureComponents = components.map((comp: any, index: number) => {
            const dbComp = dbComponents.find((dbc) => dbc.key === parseInt(comp.componentId));
            if (!dbComp) throw new Error(`Component with ID ${comp.componentId} not found`);

            if (dbComp.type === "Earning" && comp.calculationType === "PERCENTAGE") {
              totalPercentage += parseFloat(comp.value || 0);
            }

            return {
              componentId: dbComp.key,
              calculationType: comp.calculationType,
              percentageBasis: comp.percentageBasis || null,
              value: parseFloat(comp.value || 0),
              displayOrder: comp.displayOrder ? parseInt(comp.displayOrder) : index,
            };
          });

          if (totalPercentage > 100) {
            throw new Error(`Total earning percentage (${totalPercentage}%) cannot exceed 100%`);
          }
        }

        // Update main structure
        const structure = await tx.salaryStructure.update({
          where: { id },
          data: updateData
        });

        // If components are provided, replace them entirely
        if (structureComponents) {
          await tx.salaryStructureComponent.deleteMany({
            where: { structureId: id }
          });

          await tx.salaryStructureComponent.createMany({
            data: structureComponents.map(comp => ({
              ...comp,
              structureId: id
            }))
          });
        }

        return tx.salaryStructure.findUnique({
          where: { id },
          include: {
            components: {
              include: { component: true },
              orderBy: { displayOrder: 'asc' }
            }
          }
        });
      });

      res.status(200).json({ success: true, data: updatedStructure, message: "Salary structure updated successfully" });
    } catch (error: any) {
      console.error("Error updating salary structure:", error);
      res.status(500).json({ success: false, error: "Failed to update salary structure" });
    }
  }

  // Delete Salary Structure
  static async deleteSalaryStructure(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;

      const existing = await prisma.salaryStructure.findFirst({
        where: { id, tenantId }
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Salary structure not found" });
        return;
      }

      await prisma.salaryStructure.delete({
        where: { id }
      });

      res.status(200).json({ success: true, message: "Salary structure deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting salary structure:", error);
      res.status(500).json({ success: false, error: "Failed to delete salary structure" });
    }
  }

  // Update Salary Structure Status
  static async updateSalaryStructureStatus(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        res.status(400).json({ success: false, error: "isActive must be a boolean" });
        return;
      }

      const existing = await prisma.salaryStructure.findFirst({
        where: { id, tenantId }
      });

      if (!existing) {
        res.status(404).json({ success: false, error: "Salary structure not found" });
        return;
      }

      const updated = await prisma.salaryStructure.update({
        where: { id },
        data: { isActive },
        include: {
          components: {
            include: { component: true },
            orderBy: { displayOrder: 'asc' }
          }
        }
      });

      res.status(200).json({ success: true, data: updated, message: "Status updated successfully" });
    } catch (error: any) {
      console.error("Error updating salary structure status:", error);
      res.status(500).json({ success: false, error: "Failed to update status" });
    }
  }

  // Calculate Preview (No DB persistence)
  static async calculatePreview(req: Request, res: Response): Promise<void> {
    try {
      const { grossSalary, components } = req.body;
      const tenantId = (req as any).tenantId;

      if (grossSalary === undefined || !components || !Array.isArray(components)) {
        res.status(400).json({ success: false, error: "Missing required fields: grossSalary, components" });
        return;
      }

      // Fetch component types and names from DB for accuracy
      const dbComponents = await prisma.salaryComponent.findMany({
        where: {
          key: { in: components.map((c: any) => parseInt(c.componentId)) },
          tenantId
        }
      });

      const calculationInputs: SalaryComponentInput[] = components.map((comp: any) => {
        const dbComp = dbComponents.find((dbc) => dbc.key === parseInt(comp.componentId));
        if (!dbComp) throw new Error(`Component with ID ${comp.componentId} not found`);

        return {
          componentId: dbComp.key,
          componentCode: dbComp.componentCode,
          componentName: dbComp.componentName,
          type: dbComp.type as "Earning" | "Deduction",
          calculationType: comp.calculationType,
          percentageBasis: comp.percentageBasis || null,
          value: parseFloat(comp.value)
        };
      });

      const result = calculateSalaryStructure(parseFloat(grossSalary), calculationInputs);
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error("Error calculating preview:", error);
      res.status(400).json({ success: false, error: error.message || "Failed to calculate preview" });
    }
  }
}
