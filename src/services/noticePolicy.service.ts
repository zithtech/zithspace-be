import { prisma } from "@/config/database";
import { randomUUID } from "crypto";

export class NoticePolicyService {
  async createPolicy(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<any> {
    const newId = randomUUID();
    const result: any[] = await prisma.$queryRaw`
      INSERT INTO exit_notice_policies (
        id, tenant_id, policy_name, description, level_type, level_id,
        notice_period_days, notice_buyout_allowed, status, created_at, created_by_id
      ) VALUES (
        ${newId},
        ${tenantId},
        ${data.policyName},
        ${data.description || null},
        ${data.levelType},
        ${data.levelId},
        ${data.noticePeriodDays}::integer,
        ${!!data.noticeBuyoutAllowed},
        ${data.status !== undefined ? !!data.status : true},
        NOW(),
        ${createdById}
      )
      RETURNING 
        id, tenant_id AS "tenantId", policy_name AS "policyName",
        description, level_type AS "levelType", level_id AS "levelId",
        notice_period_days AS "noticePeriodDays", 
        notice_buyout_allowed AS "noticeBuyoutAllowed",
        status, created_at AS "createdAt",
        created_by_id AS "createdById";
    `;
    return result[0];
  }

  async getPolicies(tenantId: string): Promise<any[]> {
    return await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", policy_name AS "policyName",
        description, level_type AS "levelType", level_id AS "levelId",
        notice_period_days AS "noticePeriodDays", 
        notice_buyout_allowed AS "noticeBuyoutAllowed",
        status, created_at AS "createdAt",
        created_by_id AS "createdById"
      FROM exit_notice_policies
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC;
    `;
  }

  async getPolicyById(tenantId: string, id: string): Promise<any | null> {
    const policies: any[] = await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", policy_name AS "policyName",
        description, level_type AS "levelType", level_id AS "levelId",
        notice_period_days AS "noticePeriodDays", 
        notice_buyout_allowed AS "noticeBuyoutAllowed",
        status, created_at AS "createdAt",
        created_by_id AS "createdById"
      FROM exit_notice_policies
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1;
    `;
    return policies.length > 0 ? policies[0] : null;
  }

  async updatePolicy(
    tenantId: string,
    id: string,
    data: any,
    updatedById: string
  ): Promise<any> {
    const existing = await this.getPolicyById(tenantId, id);
    if (!existing) {
      throw new Error("Policy not found or access denied");
    }

    const result: any[] = await prisma.$queryRaw`
      UPDATE exit_notice_policies
      SET 
        policy_name = ${data.policyName !== undefined ? data.policyName : existing.policyName},
        description = ${data.description !== undefined ? data.description : existing.description},
        level_type = ${data.levelType !== undefined ? data.levelType : existing.levelType},
        level_id = ${data.levelId !== undefined ? data.levelId : existing.levelId},
        notice_period_days = ${data.noticePeriodDays !== undefined ? data.noticePeriodDays : existing.noticePeriodDays}::integer,
        notice_buyout_allowed = ${data.noticeBuyoutAllowed !== undefined ? !!data.noticeBuyoutAllowed : existing.noticeBuyoutAllowed},
        status = ${data.status !== undefined ? !!data.status : existing.status},
        updated_by_id = ${updatedById},
        updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING 
        id, tenant_id AS "tenantId", policy_name AS "policyName",
        description, level_type AS "levelType", level_id AS "levelId",
        notice_period_days AS "noticePeriodDays", 
        notice_buyout_allowed AS "noticeBuyoutAllowed",
        status, created_at AS "createdAt",
        created_by_id AS "createdById",
        updated_by_id AS "updatedById";
    `;
    return result[0];
  }

  async deletePolicy(tenantId: string, id: string): Promise<any> {
    const existing = await this.getPolicyById(tenantId, id);
    if (!existing) {
      throw new Error("Policy not found or access denied");
    }

    const result: any[] = await prisma.$queryRaw`
      DELETE FROM exit_notice_policies
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING 
        id, tenant_id AS "tenantId", policy_name AS "policyName",
        description, level_type AS "levelType", level_id AS "levelId",
        notice_period_days AS "noticePeriodDays", 
        notice_buyout_allowed AS "noticeBuyoutAllowed",
        status, created_at AS "createdAt",
        created_by_id AS "createdById";
    `;
    return result[0];
  }
}

export const noticePolicyService = new NoticePolicyService();
