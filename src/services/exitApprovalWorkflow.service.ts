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
    };
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
        updated_at AS "updatedAt"
      FROM exit_approval_workflows
      WHERE tenant_id = ${tenantId}
      ORDER BY step_order ASC;
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
        updated_at AS "updatedAt"
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

  async deleteStep(tenantId: string, id: string): Promise<any> {
    const existing = await this.getStepById(tenantId, id);
    if (!existing) {
      throw new Error("Approval step not found or access denied");
    }

    const result: any[] = await prisma.$queryRaw`
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
