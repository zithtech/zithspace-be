import { ReasonForExit, Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { v4 as uuidv4 } from 'uuid';

export class ReasonForExitService {
  async createReason(
    tenantId: string,
    data: { name: string; code: string; is_active?: boolean },
    createdById: string
  ): Promise<ReasonForExit> {
    return await prisma.reasonForExit.create({
      data: {
        id: uuidv4(),
        name: data.name,
        code: data.code,
        is_active: data.is_active !== undefined ? data.is_active : true,
        tenant: { connect: { id: tenantId } },
        createdBy: { connect: { id: createdById } },
      },
    });
  }

  async getReasons(tenantId: string): Promise<ReasonForExit[]> {
    return await prisma.reasonForExit.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        created_at: "desc",
      },
    });
  }

  async getReasonById(tenantId: string, id: string): Promise<ReasonForExit | null> {
    const reason = await prisma.reasonForExit.findUnique({
      where: {
        id,
      },
    });

    if (reason?.tenantId !== tenantId) {
      return null;
    }

    return reason;
  }

  async updateReason(
    tenantId: string,
    id: string,
    data: { name?: string; code?: string; is_active?: boolean },
    updatedById: string
  ): Promise<ReasonForExit> {
    const existing = await this.getReasonById(tenantId, id);
    if (!existing) {
      throw new Error("Reason for Exit not found or access denied");
    }

    return await prisma.reasonForExit.update({
      where: {
        id,
      },
      data: {
        ...data,
        updatedBy: { connect: { id: updatedById } },
      },
    });
  }

  async deleteReason(tenantId: string, id: string): Promise<ReasonForExit> {
    const existing = await this.getReasonById(tenantId, id);
    if (!existing) {
      throw new Error("Reason for Exit not found or access denied");
    }

    return await prisma.reasonForExit.delete({
      where: {
        id,
      },
    });
  }
}

export const reasonForExitService = new ReasonForExitService();
