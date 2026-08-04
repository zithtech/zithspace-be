import { prisma } from "@/config/database";
import { randomUUID } from "crypto";

export class ReasonForExitService {
  async createReason(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<any> {
    const newId = randomUUID();
    const result: any[] = await prisma.$queryRaw`
      INSERT INTO reasons_for_exit (
        id, tenant_id, name, code, is_active,
        created_by_id, created_at, updated_at
      ) VALUES (
        ${newId},
        ${tenantId},
        ${data.name},
        ${data.code},
        ${data.is_active !== undefined ? !!data.is_active : true},
        ${createdById},
        NOW(),
        NOW()
      )
      RETURNING 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at;
    `;
    return result[0];
  }

  async getReasons(tenantId: string): Promise<any[]> {
    return await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at
      FROM reasons_for_exit
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC;
    `;
  }

  async getReasonById(tenantId: string, id: string): Promise<any | null> {
    const reasons: any[] = await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at
      FROM reasons_for_exit
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1;
    `;
    return reasons.length > 0 ? reasons[0] : null;
  }

  async updateReason(
    tenantId: string,
    id: string,
    data: any,
    updatedById: string
  ): Promise<any> {
    const existing = await this.getReasonById(tenantId, id);
    if (!existing) {
      throw new Error("Reason for exit not found or access denied");
    }

    const result: any[] = await prisma.$queryRaw`
      UPDATE reasons_for_exit
      SET 
        name = ${data.name !== undefined ? data.name : existing.name},
        code = ${data.code !== undefined ? data.code : existing.code},
        is_active = ${data.is_active !== undefined ? !!data.is_active : existing.is_active},
        updated_by_id = ${updatedById},
        updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at;
    `;
    return result[0];
  }

  async deleteReason(tenantId: string, id: string): Promise<any> {
    const existing = await this.getReasonById(tenantId, id);
    if (!existing) {
      throw new Error("Reason for exit not found or access denied");
    }

    const result: any[] = await prisma.$queryRaw`
      DELETE FROM reasons_for_exit
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at;
    `;
    return result[0];
  }
}

export const reasonForExitService = new ReasonForExitService();
