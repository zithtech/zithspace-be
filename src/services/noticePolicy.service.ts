import { ExitNoticePolicy, Prisma } from "@prisma/client";
import { prisma } from "@/config/database";

export class NoticePolicyService {
  async createPolicy(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<ExitNoticePolicy> {
    return await prisma.exitNoticePolicy.create({
      data: {
        ...data,
        tenant: { connect: { id: tenantId } },
        createdBy: { connect: { id: createdById } },
      },
    });
  }

  async getPolicies(tenantId: string): Promise<ExitNoticePolicy[]> {
    return await prisma.exitNoticePolicy.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async getPolicyById(tenantId: string, id: string): Promise<ExitNoticePolicy | null> {
    const policy = await prisma.exitNoticePolicy.findUnique({
      where: {
        id,
      },
    });

    if (policy?.tenantId !== tenantId) {
      return null;
    }

    return policy;
  }

  async updatePolicy(
    tenantId: string,
    id: string,
    data: any,
    updatedById: string
  ): Promise<ExitNoticePolicy> {
    const existing = await this.getPolicyById(tenantId, id);
    if (!existing) {
      throw new Error("Policy not found or access denied");
    }

    return await prisma.exitNoticePolicy.update({
      where: {
        id,
      },
      data: {
        ...data,
        updatedBy: { connect: { id: updatedById } },
      },
    });
  }

  async deletePolicy(tenantId: string, id: string): Promise<ExitNoticePolicy> {
    const existing = await this.getPolicyById(tenantId, id);
    if (!existing) {
      throw new Error("Policy not found or access denied");
    }

    return await prisma.exitNoticePolicy.delete({
      where: {
        id,
      },
    });
  }
}

export const noticePolicyService = new NoticePolicyService();
