import { prisma } from "@/config/database";
import { randomUUID } from "crypto";

export class ExitTypeService {
  async createType(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<any> {
    const newId = randomUUID();
    const result: any[] = await prisma.$queryRaw`
      INSERT INTO exit_types (
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

  async getTypes(tenantId: string): Promise<any[]> {
    return await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at
      FROM exit_types
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC;
    `;
  }

  async getTypeById(tenantId: string, id: string): Promise<any | null> {
    const types: any[] = await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at
      FROM exit_types
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1;
    `;
    return types.length > 0 ? types[0] : null;
  }

  async updateType(
    tenantId: string,
    id: string,
    data: any,
    updatedById: string
  ): Promise<any> {
    const existing = await this.getTypeById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Type not found or access denied");
    }

    const result: any[] = await prisma.$queryRaw`
      UPDATE exit_types
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

  async deleteType(tenantId: string, id: string): Promise<any> {
    const existing = await this.getTypeById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Type not found or access denied");
    }

    const result: any[] = await prisma.$queryRaw`
      DELETE FROM exit_types
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING 
        id, tenant_id AS "tenantId", name, code, is_active,
        created_by_id AS "createdById", updated_by_id AS "updatedById",
        created_at, updated_at;
    `;
    return result[0];
  }
}

export const exitTypeService = new ExitTypeService();
