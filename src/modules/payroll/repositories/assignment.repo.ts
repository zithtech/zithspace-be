// src/modules/payroll/repositories/assignment.repo.ts
//
// Raw-SQL data access for employee salary assignments (header + frozen
// component snapshot). Every query takes a tenant-scoped client AND filters
// tenant_id explicitly.

import { TenantClient } from '../db/pool';
import {
  ComponentCategory,
  ComponentPercentageOf,
  EmployeeAssignment,
  EmployeeAssignmentComponent,
  EmployeeAssignmentListItem,
  StructureCalcType,
} from '../types';

// effective_from is selected as text (YYYY-MM-DD) for stable JSON.
const ASSIGN_COLS = `
  id, tenant_id, employee_id, structure_id, monthly_ctc, annual_ctc,
  to_char(effective_from, 'YYYY-MM-DD') AS effective_from, is_active, notes,
  created_by, updated_by, created_at, updated_at
`;

function mapAssign(r: any): EmployeeAssignment {
  return {
    id: r.id, tenantId: r.tenant_id, employeeId: r.employee_id, structureId: r.structure_id,
    monthlyCtc: Number(r.monthly_ctc), annualCtc: Number(r.annual_ctc),
    effectiveFrom: r.effective_from, isActive: r.is_active, notes: r.notes,
    createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function deactivateActiveForEmployee(client: TenantClient, employeeId: string, actorId: string): Promise<void> {
  await client.query(
    `UPDATE pay_employee_assignments SET is_active = false, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND employee_id = $2 AND is_active = true`,
    [client.tenantId, employeeId, actorId]
  );
}

export interface InsertAssignmentData {
  employeeId: string;
  structureId: string;
  monthlyCtc: number;
  annualCtc: number;
  effectiveFrom?: string;
  notes: string | null;
  createdBy: string;
}

export async function insertAssignment(client: TenantClient, d: InsertAssignmentData): Promise<EmployeeAssignment> {
  const { rows } = await client.query(
    `INSERT INTO pay_employee_assignments
       (tenant_id, employee_id, structure_id, monthly_ctc, annual_ctc, effective_from, notes, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, current_date), $7, $8, $8)
     RETURNING ${ASSIGN_COLS}`,
    [client.tenantId, d.employeeId, d.structureId, d.monthlyCtc, d.annualCtc, d.effectiveFrom ?? null, d.notes, d.createdBy]
  );
  return mapAssign(rows[0]);
}

export interface SnapshotComponent {
  componentId: string;
  code: string;
  name: string;
  category: ComponentCategory;
  calculationType: StructureCalcType;
  percentageOf: ComponentPercentageOf | null;
  value: number;
  calculatedAmount: number;
  displayOrder: number;
}

export async function insertComponents(client: TenantClient, assignmentId: string, comps: SnapshotComponent[]): Promise<void> {
  for (const c of comps) {
    await client.query(
      `INSERT INTO pay_employee_assignment_components
         (tenant_id, assignment_id, component_id, code, name, category, calculation_type, percentage_of, value, calculated_amount, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [client.tenantId, assignmentId, c.componentId, c.code, c.name, c.category, c.calculationType, c.percentageOf, c.value, c.calculatedAmount, c.displayOrder]
    );
  }
}

export async function findComponents(client: TenantClient, assignmentId: string): Promise<EmployeeAssignmentComponent[]> {
  const { rows } = await client.query(
    `SELECT id, assignment_id, component_id, code, name, category, calculation_type, percentage_of, value, calculated_amount, display_order
       FROM pay_employee_assignment_components
      WHERE tenant_id = $1 AND assignment_id = $2
      ORDER BY display_order ASC`,
    [client.tenantId, assignmentId]
  );
  return rows.map((r) => ({
    id: r.id, assignmentId: r.assignment_id, componentId: r.component_id, code: r.code, name: r.name,
    category: r.category, calculationType: r.calculation_type, percentageOf: r.percentage_of,
    value: Number(r.value), calculatedAmount: Number(r.calculated_amount), displayOrder: r.display_order,
  }));
}

export async function findActiveByEmployee(client: TenantClient, employeeId: string): Promise<EmployeeAssignment | null> {
  const { rows } = await client.query(
    `SELECT ${ASSIGN_COLS} FROM pay_employee_assignments
      WHERE tenant_id = $1 AND employee_id = $2 AND is_active = true`,
    [client.tenantId, employeeId]
  );
  return rows[0] ? mapAssign(rows[0]) : null;
}

export async function findById(client: TenantClient, id: string): Promise<EmployeeAssignment | null> {
  const { rows } = await client.query(
    `SELECT ${ASSIGN_COLS} FROM pay_employee_assignments WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id]
  );
  return rows[0] ? mapAssign(rows[0]) : null;
}

export async function listActive(client: TenantClient): Promise<EmployeeAssignmentListItem[]> {
  const { rows } = await client.query(
    `SELECT a.id, a.tenant_id, a.employee_id, a.structure_id, a.monthly_ctc, a.annual_ctc,
            to_char(a.effective_from, 'YYYY-MM-DD') AS effective_from, a.is_active, a.notes,
            a.created_by, a.updated_by, a.created_at, a.updated_at,
            s.name AS structure_name, s.code AS structure_code
       FROM pay_employee_assignments a
       LEFT JOIN pay_structures s ON s.id = a.structure_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.is_active = true
      ORDER BY a.created_at DESC`,
    [client.tenantId]
  );
  return rows.map((r) => ({ ...mapAssign(r), structureName: r.structure_name ?? null, structureCode: r.structure_code ?? null }));
}

// Full assignment history for one employee (active + superseded), newest first.
export async function findHistoryByEmployee(client: TenantClient, employeeId: string): Promise<EmployeeAssignmentListItem[]> {
  const { rows } = await client.query(
    `SELECT a.id, a.tenant_id, a.employee_id, a.structure_id, a.monthly_ctc, a.annual_ctc,
            to_char(a.effective_from, 'YYYY-MM-DD') AS effective_from, a.is_active, a.notes,
            a.created_by, a.updated_by, a.created_at, a.updated_at,
            s.name AS structure_name, s.code AS structure_code
       FROM pay_employee_assignments a
       LEFT JOIN pay_structures s ON s.id = a.structure_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.employee_id = $2
      ORDER BY a.created_at DESC`,
    [client.tenantId, employeeId]
  );
  return rows.map((r) => ({ ...mapAssign(r), structureName: r.structure_name ?? null, structureCode: r.structure_code ?? null }));
}

export async function revokeById(client: TenantClient, id: string, actorId: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `UPDATE pay_employee_assignments SET is_active = false, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND is_active = true`,
    [client.tenantId, id, actorId]
  );
  return (rowCount ?? 0) > 0;
}
