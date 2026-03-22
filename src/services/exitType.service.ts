import { ExitType, Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { randomUUID } from 'crypto';

export class ExitTypeService {
  async createType(
    tenantId: string,
    data: { name: string; code: string; is_active?: boolean },
    createdById: string
  ): Promise<ExitType> {
    return await prisma.exitType.create({
      data: {
        id: randomUUID(),
        name: data.name,
        code: data.code,
        is_active: data.is_active !== undefined ? data.is_active : true,
        tenant: { connect: { id: tenantId } },
        createdBy: { connect: { id: createdById } },
      },
    });
  }

  async getTypes(tenantId: string): Promise<ExitType[]> {
    return await prisma.exitType.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        created_at: "desc",
      },
    });
  }

  async getTypeById(tenantId: string, id: string): Promise<ExitType | null> {
    const exitType = await prisma.exitType.findUnique({
      where: {
        id,
      },
    });

    if (exitType?.tenantId !== tenantId) {
      return null;
    }

    return exitType;
  }

  async updateType(
    tenantId: string,
    id: string,
    data: { name?: string; code?: string; is_active?: boolean },
    updatedById: string
  ): Promise<ExitType> {
    const existing = await this.getTypeById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Type not found or access denied");
    }

    return await prisma.exitType.update({
      where: {
        id,
      },
      data: {
        ...data,
        updatedBy: { connect: { id: updatedById } },
      },
    });
  }

  async deleteType(tenantId: string, id: string): Promise<ExitType> {
    const existing = await this.getTypeById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Type not found or access denied");
    }

    return await prisma.exitType.delete({
      where: {
        id,
      },
    });
  }
}

export const exitTypeService = new ExitTypeService();
