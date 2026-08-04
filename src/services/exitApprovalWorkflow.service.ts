import { prisma } from "@/config/database";
import { randomUUID } from "crypto";

export class ExitApprovalWorkflowService {
  private mapStep(step: any): any {
    if (!step) return null;
    return {
      ...step,
      roleIds: step.approverId ? [step.approverId] : [],
      mandatory: step.mandatory !== undefined ? !!step.mandatory : true,
      isActive: !!step.isActive,
      levelType: step.levelType,
      levelId: step.levelId
    };
  }

  async saveWorkflowSequence(
    tenantId: string,
    data: { levelType: string; levelId: string; steps: any[] },
    createdById: string
  ): Promise<any[]> {
    const { levelType, levelId, steps } = data;

    // Delete existing steps for this role
    await prisma.$executeRaw`
      DELETE FROM exit_approval_workflows 
      WHERE tenant_id = ${tenantId} 
      AND level_type = ${levelType} 
      AND level_id = ${levelId}::uuid;
    `;

    // Insert new steps
    const insertedSteps = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const newId = randomUUID();
      let approverId = null;
      if (Array.isArray(step.roleIds) && step.roleIds.length > 0) {
        approverId = step.roleIds[0];
      } else if (typeof step.roleIds === 'string') {
        approverId = step.roleIds;
      }
      
      const result: any[] = await prisma.$queryRaw`
        INSERT INTO exit_approval_workflows (
          id, tenant_id, step_order, approver_type, approver_id,
          is_active, created_by_id, created_at, updated_at,
          level_type, level_id
        ) VALUES (
          ${newId},
          ${tenantId},
          ${step.stepOrder || (i + 1)}::integer,
          ${step.approverType || 'Position'},
          ${approverId},
          ${step.isActive !== undefined ? !!step.isActive : true},
          ${createdById},
          NOW(),
          NOW(),
          ${levelType},
          ${levelId}::uuid
        )
        RETURNING 
          id, tenant_id AS "tenantId", step_order AS "stepOrder",
          approver_type AS "approverType", approver_id AS "approverId",
          is_active AS "isActive", created_by_id AS "createdById",
          updated_by_id AS "updatedById", created_at AS "createdAt",
          updated_at AS "updatedAt",
          level_type AS "levelType", level_id AS "levelId";
      `;
      insertedSteps.push(this.mapStep(result[0]));
    }

    return insertedSteps;
  }

  async createStep(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<any> {
    const { stepOrder, roleIds, isActive } = data;
    const approverId = Array.isArray(roleIds) && roleIds.length > 0 ? roleIds[0] : (roleIds || null);
    
    const newId = randomUUID();
    const result: any[] = await prisma.$queryRaw`
      INSERT INTO exit_approval_workflows (
        id, tenant_id, step_order, approver_type, approver_id,
        is_active, created_by_id, created_at, updated_at
      ) VALUES (
        ${newId},
        ${tenantId},
        ${parseInt(stepOrder) || 1}::integer,
        'Position',
        ${approverId},
        ${isActive !== undefined ? !!isActive : true},
        ${createdById},
        NOW(),
        NOW()
      )
      RETURNING 
        id, tenant_id AS "tenantId", step_order AS "stepOrder",
        approver_type AS "approverType", approver_id AS "approverId",
        is_active AS "isActive", created_by_id AS "createdById",
        updated_by_id AS "updatedById", created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    return this.mapStep(result[0]);
  }

  async getSteps(tenantId: string): Promise<any[]> {
    const steps: any[] = await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", step_order AS "stepOrder",
        approver_type AS "approverType", approver_id AS "approverId",
        is_active AS "isActive", created_by_id AS "createdById",
        updated_by_id AS "updatedById", created_at AS "createdAt",
        updated_at AS "updatedAt",
        level_type AS "levelType", level_id AS "levelId"
      FROM exit_approval_workflows
      WHERE tenant_id = ${tenantId}
      ORDER BY level_type ASC, level_id ASC, step_order ASC;
    `;
    return steps.map(s => this.mapStep(s));
  }

  async getStepById(tenantId: string, id: string): Promise<any | null> {
    const steps: any[] = await prisma.$queryRaw`
      SELECT 
        id, tenant_id AS "tenantId", step_order AS "stepOrder",
        approver_type AS "approverType", approver_id AS "approverId",
        is_active AS "isActive", created_by_id AS "createdById",
        updated_by_id AS "updatedById", created_at AS "createdAt",
        updated_at AS "updatedAt",
        level_type AS "levelType", level_id AS "levelId"
      FROM exit_approval_workflows
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1;
    `;
    return steps.length > 0 ? this.mapStep(steps[0]) : null;
  }

  async updateStep(
    tenantId: string,
    id: string,
    data: any,
    updatedById: string
  ): Promise<any> {
    const existing = await this.getStepById(tenantId, id);
    if (!existing) {
      throw new Error("Approval step not found or access denied");
    }

    const { stepOrder, roleIds, isActive } = data;
    const newApproverId = Array.isArray(roleIds) ? (roleIds.length > 0 ? roleIds[0] : null) : (roleIds ?? undefined);

    const result: any[] = await prisma.$queryRaw`
      UPDATE exit_approval_workflows
      SET 
        step_order = ${stepOrder !== undefined ? parseInt(stepOrder) : existing.stepOrder}::integer,
        approver_id = ${newApproverId !== undefined ? newApproverId : existing.approverId},
        approver_type = ${roleIds !== undefined ? 'Position' : existing.approverType},
        is_active = ${isActive !== undefined ? !!isActive : existing.isActive},
        updated_by_id = ${updatedById},
        updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING 
        id, tenant_id AS "tenantId", step_order AS "stepOrder",
        approver_type AS "approverType", approver_id AS "approverId",
        is_active AS "isActive", created_by_id AS "createdById",
        updated_by_id AS "updatedById", created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    return this.mapStep(result[0]);
  }

  async deleteStep(tenantId: string, id: string): Promise<void> {
    const result = await prisma.$executeRaw`
      DELETE FROM exit_approval_workflows
      WHERE id = ${id} AND tenant_id = ${tenantId}
      RETURNING 
        id, tenant_id AS "tenantId", step_order AS "stepOrder",
        approver_type AS "approverType", approver_id AS "approverId",
        is_active AS "isActive", created_by_id AS "createdById",
        updated_by_id AS "updatedById", created_at AS "createdAt",
        updated_at AS "updatedAt";
    `;

    return this.mapStep(result[0]);
  }
}

export const exitApprovalWorkflowService = new ExitApprovalWorkflowService();
