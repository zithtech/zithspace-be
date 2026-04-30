import { ExitApprovalWorkflow } from "@prisma/client";
import { prisma } from "@/config/database";

export class ExitApprovalWorkflowService {
  /**
   * Helper to map database model to frontend-friendly structure.
   */
  private mapStep(step: any): any {
    if (!step) return null;
    return {
      ...step,
      // Map singular DB field back to FE array 'roleIds'
      roleIds: step.approverId ? [step.approverId] : [],
      // Ensure boolean consistency for frontend
      mandatory: !!step.mandatory,
      isActive: !!step.isActive,
    };
  }

  /**
   * Create a new approval step.
   * Only includes fields that exist in the database schema.
   */
  async createStep(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<any> {
    try {
      const { stepOrder, roleIds, mandatory, isActive } = data;

      // Type-casting to any to bypass stale @prisma/client type errors while they are being repaired
      const step = await (prisma.exitApprovalWorkflow as any).create({
        data: {
          stepOrder: parseInt(stepOrder as any) || 1,
          approverId: Array.isArray(roleIds) && roleIds.length > 0 ? roleIds[0] : (roleIds || null),
          approverType: "Position", // Standardized value for the current database structure
          mandatory: mandatory !== undefined ? !!mandatory : true,
          isActive: isActive !== undefined ? !!isActive : true,
          tenant: { connect: { id: tenantId } },
          createdBy: { connect: { id: createdById } },
        },
      });

      return this.mapStep(step);
    } catch (error: any) {
      console.error("Error in createStep:", error);
      throw error;
    }
  }

  /**
   * Get all approval steps for a tenant
   */
  async getSteps(tenantId: string): Promise<any[]> {
    try {
      const steps = await prisma.exitApprovalWorkflow.findMany({
        where: {
          tenantId,
        },
        orderBy: {
          stepOrder: "asc",
        },
      });

      return steps.map(s => this.mapStep(s));
    } catch (error: any) {
      console.error("Error in getSteps:", error);
      throw error;
    }
  }

  /**
   * Get a specific step by ID
   */
  async getStepById(tenantId: string, id: string): Promise<any | null> {
    try {
      const step = await prisma.exitApprovalWorkflow.findUnique({
        where: {
          id,
        },
      });

      if (!step || step.tenantId !== tenantId) {
        return null;
      }

      return this.mapStep(step);
    } catch (error: any) {
      console.error("Error in getStepById:", error);
      throw error;
    }
  }

  /**
   * Update an existing step.
   * Only includes fields that exist in the database schema.
   */
  async updateStep(
    tenantId: string,
    id: string,
    data: any,
    updatedById: string
  ): Promise<any> {
    try {
      const existing = await prisma.exitApprovalWorkflow.findUnique({ 
        where: { id } 
      });

      if (!existing || existing.tenantId !== tenantId) {
        throw new Error("Approval step not found or access denied");
      }

      const { stepOrder, roleIds, mandatory, isActive } = data;

      const step = await (prisma.exitApprovalWorkflow as any).update({
        where: {
          id,
        },
        data: {
          stepOrder: stepOrder !== undefined ? parseInt(stepOrder as any) : undefined,
          mandatory: mandatory !== undefined ? !!mandatory : undefined,
          approverId: Array.isArray(roleIds) ? (roleIds.length > 0 ? roleIds[0] : null) : (roleIds ?? undefined),
          approverType: roleIds ? "Position" : undefined,
          isActive: isActive !== undefined ? !!isActive : undefined,
          updatedBy: { connect: { id: updatedById } },
        },
      });

      return this.mapStep(step);
    } catch (error: any) {
      console.error("Error in updateStep:", error);
      throw error;
    }
  }

  /**
   * Delete a step
   */
  async deleteStep(tenantId: string, id: string): Promise<any> {
    try {
      const existing = await prisma.exitApprovalWorkflow.findUnique({ 
        where: { id } 
      });

      if (!existing || existing.tenantId !== tenantId) {
        throw new Error("Approval step not found or access denied");
      }

      const step = await prisma.exitApprovalWorkflow.delete({
        where: {
          id,
        },
      });

      return this.mapStep(step);
    } catch (error: any) {
      console.error("Error in deleteStep:", error);
      throw error;
    }
  }
}

export const exitApprovalWorkflowService = new ExitApprovalWorkflowService();
