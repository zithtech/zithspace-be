import { ExitApprovalWorkflow } from "@prisma/client";
import { prisma } from "@/config/database";

export class ExitApprovalWorkflowService {
  async createStep(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<ExitApprovalWorkflow> {
    return await prisma.exitApprovalWorkflow.create({
      data: {
        ...data,
        tenant: { connect: { id: tenantId } },
        createdBy: { connect: { id: createdById } },
      },
    });
  }

  async getSteps(tenantId: string): Promise<ExitApprovalWorkflow[]> {
    return await prisma.exitApprovalWorkflow.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        stepOrder: "asc",
      },
    });
  }

  async getStepById(tenantId: string, id: string): Promise<ExitApprovalWorkflow | null> {
    const step = await prisma.exitApprovalWorkflow.findUnique({
      where: {
        id,
      },
    });

    if (step?.tenantId !== tenantId) {
      return null;
    }

    return step;
  }

  async updateStep(
    tenantId: string,
    id: string,
    data: any,
    updatedById: string
  ): Promise<ExitApprovalWorkflow> {
    const existing = await this.getStepById(tenantId, id);
    if (!existing) {
      throw new Error("Approval step not found or access denied");
    }

    return await prisma.exitApprovalWorkflow.update({
      where: {
        id,
      },
      data: {
        ...data,
        updatedBy: { connect: { id: updatedById } },
      },
    });
  }

  async deleteStep(tenantId: string, id: string): Promise<ExitApprovalWorkflow> {
    const existing = await this.getStepById(tenantId, id);
    if (!existing) {
      throw new Error("Approval step not found or access denied");
    }

    return await prisma.exitApprovalWorkflow.delete({
      where: {
        id,
      },
    });
  }
}

export const exitApprovalWorkflowService = new ExitApprovalWorkflowService();
