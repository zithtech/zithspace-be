import pool from "../config/dbpool";
import { randomUUID as uuidv4 } from "crypto";

export interface EmployeeExitRequest {
  id: string;
  tenantId: string;
  employeeId: string;
  departmentId?: string | null;
  positionId?: string | null;
  reportingManagerId?: string | null;
  exitTypeId?: string | null;
  exitReasonId?: string | null;
  resignationDate: Date;
  proposedLastWorkingDay: Date;
  noticePeriodDay?: Date | null;
  waiveNoticePeriod: boolean;
  buyoutRequired: boolean;
  buyoutAmount?: number | null;
  explanation?: string | null;
  status: string;
  createdById: string;
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  
  employee?: {
    first_name: string;
    last_name: string;
    employee_code: string;
  };
  reportingManagerName?: string | null;
}

export const createEmployeeExit = async (
  tenantId: string,
  data: any,
  createdById: string
): Promise<EmployeeExitRequest> => {
  let finalEmployeeId = data.employeeId;
  if (!finalEmployeeId) throw new Error("Employee ID is required");

  // ID Resolution Strategy
  const empCheck = await pool.query(`SELECT id FROM employees WHERE id = $1::uuid LIMIT 1`, [finalEmployeeId]);
  if (empCheck.rows.length === 0) {
    const userCheck = await pool.query(`SELECT employee_id, name FROM users WHERE id = $1 LIMIT 1`, [finalEmployeeId]);
    if (userCheck.rows.length > 0) {
      if (userCheck.rows[0].employee_id) {
        finalEmployeeId = userCheck.rows[0].employee_id;
      } else {
        throw new Error(`User "${userCheck.rows[0].name}" does not have an associated Employee record. Please link them first.`);
      }
    } else {
      throw new Error("The selected employee ID is invalid or cannot be resolved.");
    }
  }

  const newId = uuidv4();
  
  const query = `
    INSERT INTO employee_exits (
      id, tenant_id, employee_id, department_id, position_id, reporting_manager_id,
      exit_type_id, exit_reason_id, resignation_date, proposed_last_working_day,
      notice_period_day, waive_notice_period, buyout_required, buyout_amount,
      explanation, resignation_letter_url, status, created_by_id, updated_at, created_at
    ) VALUES (
      $1, $2, $3::uuid, $4, $5, $6, $7, $8, $9::timestamp, $10::timestamp,
      $11::timestamp, $12, $13, $14::decimal, $15, $16, $17, $18, NOW(), NOW()
    )
    RETURNING 
      id, tenant_id AS "tenantId", employee_id AS "employeeId",
      department_id AS "departmentId", position_id AS "positionId",
      reporting_manager_id AS "reportingManagerId", exit_type_id AS "exitTypeId",
      exit_reason_id AS "exitReasonId", resignation_date AS "resignationDate",
      proposed_last_working_day AS "proposedLastWorkingDay",
      notice_period_day AS "noticePeriodDay", waive_notice_period AS "waiveNoticePeriod",
      buyout_required AS "buyoutRequired", buyout_amount AS "buyoutAmount",
      explanation, resignation_letter_url AS "resignationLetterUrl", status, created_by_id AS "createdById",
      updated_by_id AS "updatedById", created_at AS "createdAt", updated_at AS "updatedAt"
  `;

  const values = [
    newId, tenantId, finalEmployeeId, 
    data.departmentId || null, data.positionId || null, 
    (data.reportingManagerId && data.reportingManagerId !== "") ? data.reportingManagerId : null,
    data.exitTypeId || null, data.exitReasonId || null, 
    new Date(data.resignationDate), new Date(data.proposedLastWorkingDay),
    data.noticePeriodDay ? new Date(data.noticePeriodDay) : null,
    !!data.waiveNoticePeriod, !!data.buyoutRequired,
    data.buyoutAmount ? data.buyoutAmount : null,
    data.explanation || null, data.resignationLetterUrl || null, data.status || "PENDING", createdById
  ];

  const result = await pool.query(query, values);
  const exitRequest = result.rows[0];

  // Initialize approval workflow steps
  let empPositionId = data.positionId || null;
  let empGradeId = null;

  if (empCheck.rows.length > 0) {
    empPositionId = empPositionId || empCheck.rows[0].position_id;
    empGradeId = empCheck.rows[0].grade_id;
  }

  let workflowQuery = `
    SELECT step_order, approver_type, approver_id
    FROM exit_approval_workflows
    WHERE tenant_id = $1 AND is_active = true AND level_type = 'positions' AND level_id = $2
    ORDER BY step_order ASC
  `;
  let workflows = await pool.query(workflowQuery, [tenantId, empPositionId]);

  if (workflows.rows.length === 0 && empGradeId) {
    workflowQuery = `
      SELECT step_order, approver_type, approver_id
      FROM exit_approval_workflows
      WHERE tenant_id = $1 AND is_active = true AND level_type = 'grades' AND level_id = $2
      ORDER BY step_order ASC
    `;
    workflows = await pool.query(workflowQuery, [tenantId, empGradeId]);
  }

  // Fallback to Global workflows if needed
  if (workflows.rows.length === 0) {
    workflowQuery = `
      SELECT step_order, approver_type, approver_id
      FROM exit_approval_workflows
      WHERE tenant_id = $1 AND is_active = true AND level_type IS NULL
      ORDER BY step_order ASC
    `;
    workflows = await pool.query(workflowQuery, [tenantId]);
  }

  if (workflows.rows.length > 0) {
    for (const step of workflows.rows) {
      const stepQuery = `
        INSERT INTO exit_request_approvals (
          tenant_id, exit_request_id, step_order, approver_type, approver_id, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'PENDING', NOW(), NOW()
        )
      `;
      await pool.query(stepQuery, [
        tenantId, newId, step.step_order, step.approver_type, step.approver_id
      ]);
    }
  }

  return exitRequest;
};

export const getEmployeeExits = async (tenantId: string): Promise<EmployeeExitRequest[]> => {
  const query = `
    SELECT 
      e.id, e.tenant_id AS "tenantId", e.employee_id AS "employeeId",
      e.department_id AS "departmentId", e.position_id AS "positionId",
      e.reporting_manager_id AS "reportingManagerId", e.exit_type_id AS "exitTypeId",
      e.exit_reason_id AS "exitReasonId", e.resignation_date AS "resignationDate",
      e.proposed_last_working_day AS "proposedLastWorkingDay",
      e.notice_period_day AS "noticePeriodDay", e.waive_notice_period AS "waiveNoticePeriod",
      e.buyout_required AS "buyoutRequired", e.buyout_amount AS "buyoutAmount",
      e.explanation, e.resignation_letter_url AS "resignationLetterUrl", 
      e.relieving_letter_url AS "relievingLetterUrl", e.experience_letter_url AS "experienceLetterUrl",
      e.status, e.created_by_id AS "createdById",
      e.updated_by_id AS "updatedById", e.created_at AS "createdAt", e.updated_at AS "updatedAt",
      emp.first_name AS "employee_first_name",
      emp.last_name AS "employee_last_name",
      emp.employee_code AS "employee_code",
      usr.name AS "user_manager_name",
      mgr.first_name AS "emp_manager_first_name",
      mgr.last_name AS "emp_manager_last_name",
      creator.name AS "creator_name",
      CASE WHEN ei.id IS NOT NULL THEN true ELSE false END AS "hasInterview"
    FROM employee_exits e
    INNER JOIN employees emp ON e.employee_id = emp.id
    LEFT JOIN users usr ON e.reporting_manager_id = usr.id
    LEFT JOIN employees mgr ON e.reporting_manager_id = mgr.id::text
    LEFT JOIN users creator ON e.created_by_id = creator.id
    LEFT JOIN exit_interviews ei ON e.id = ei.exit_request_id
    WHERE e.tenant_id = $1
    ORDER BY e.created_at DESC
  `;

  const result = await pool.query(query, [tenantId]);
  
  return result.rows.map(row => {
    let reportingManagerName = null;
    if (row.reportingManagerId) {
      if (row.user_manager_name) {
        reportingManagerName = row.user_manager_name;
      } else if (row.emp_manager_first_name) {
        reportingManagerName = `${row.emp_manager_first_name} ${row.emp_manager_last_name}`;
      } else {
        reportingManagerName = row.reportingManagerId;
      }
    }

    const { 
      employee_first_name, employee_last_name, employee_code, 
      user_manager_name, emp_manager_first_name, emp_manager_last_name, creator_name, hasInterview,
      ...baseData 
    } = row;

    return {
      ...baseData,
      reportingManagerName,
      createdBy: creator_name,
      hasInterview: hasInterview,
      employee: {
        first_name: employee_first_name,
        last_name: employee_last_name,
        employee_code: employee_code,
      }
    };
  });
};

export const getEmployeeExitById = async (tenantId: string, id: string): Promise<EmployeeExitRequest | null> => {
  const query = `
    SELECT 
      e.id, e.tenant_id AS "tenantId", e.employee_id AS "employeeId",
      e.department_id AS "departmentId", e.position_id AS "positionId",
      e.reporting_manager_id AS "reportingManagerId", e.exit_type_id AS "exitTypeId",
      e.exit_reason_id AS "exitReasonId", e.resignation_date AS "resignationDate",
      e.proposed_last_working_day AS "proposedLastWorkingDay",
      e.notice_period_day AS "noticePeriodDay", e.waive_notice_period AS "waiveNoticePeriod",
      e.buyout_required AS "buyoutRequired", e.buyout_amount AS "buyoutAmount",
      e.explanation, e.resignation_letter_url AS "resignationLetterUrl",
      e.relieving_letter_url AS "relievingLetterUrl", e.experience_letter_url AS "experienceLetterUrl",
      e.status, e.created_by_id AS "createdById",
      e.updated_by_id AS "updatedById", e.created_at AS "createdAt", e.updated_at AS "updatedAt",
      emp.first_name AS "employee_first_name",
      emp.last_name AS "employee_last_name",
      emp.employee_code AS "employee_code",
      usr.name AS "user_manager_name",
      mgr.first_name AS "emp_manager_first_name",
      mgr.last_name AS "emp_manager_last_name",
      creator.name AS "creator_name"
    FROM employee_exits e
    INNER JOIN employees emp ON e.employee_id = emp.id
    LEFT JOIN users usr ON e.reporting_manager_id = usr.id
    LEFT JOIN employees mgr ON e.reporting_manager_id = mgr.id::text
    LEFT JOIN users creator ON e.created_by_id = creator.id
    WHERE e.id = $1 AND e.tenant_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [id, tenantId]);
  
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  let reportingManagerName = null;
  if (row.reportingManagerId) {
    if (row.user_manager_name) {
      reportingManagerName = row.user_manager_name;
    } else if (row.emp_manager_first_name) {
      reportingManagerName = `${row.emp_manager_first_name} ${row.emp_manager_last_name}`;
    } else {
      reportingManagerName = row.reportingManagerId;
    }
  }

  const { 
    employee_first_name, employee_last_name, employee_code, 
    user_manager_name, emp_manager_first_name, emp_manager_last_name, creator_name, 
    ...baseData 
  } = row;

  // Fetch Approvals
  let approvalsRows: any[] = [];
  try {
    const approvalsQuery = `
      SELECT id, step_order AS "stepOrder", approver_type AS "approverType", approver_id AS "approverId",
             status, comments, action_date AS "actionDate"
      FROM exit_request_approvals
      WHERE exit_request_id = $1 AND tenant_id = $2
      ORDER BY step_order ASC
    `;
    const approvalsResult = await pool.query(approvalsQuery, [id, tenantId]);
    approvalsRows = approvalsResult.rows;
  } catch (e: any) {
    console.error('[getEmployeeExitById] approvals sub-query failed:', e.message);
  }

  // Fetch Clearances
  let clearancesRows: any[] = [];
  try {
    const clearancesQuery = `
      SELECT id, department, is_cleared AS "isCleared", comments, cleared_by_id AS "clearedById", cleared_at AS "clearedAt"
      FROM exit_clearances
      WHERE exit_request_id = $1 AND tenant_id = $2
      ORDER BY created_at ASC
    `;
    const clearancesResult = await pool.query(clearancesQuery, [id, tenantId]);
    clearancesRows = clearancesResult.rows;
  } catch (e: any) {
    console.error('[getEmployeeExitById] clearances sub-query failed:', e.message);
  }

  // Fetch FnF
  let fnfRow: any = null;
  try {
    const fnfQuery = `
      SELECT id, status, net_payable AS "totalPayable", processed_at AS "processedAt"
      FROM exit_fnf_settlements
      WHERE exit_request_id = $1 AND tenant_id = $2
      LIMIT 1
    `;
    const fnfResult = await pool.query(fnfQuery, [id, tenantId]);
    fnfRow = fnfResult.rows.length > 0 ? fnfResult.rows[0] : null;
  } catch (e: any) {
    console.error('[getEmployeeExitById] fnf sub-query failed:', e.message);
  }

  return {
    ...baseData,
    reportingManagerName,
    createdBy: creator_name,
    employee: {
      first_name: employee_first_name,
      last_name: employee_last_name,
      employee_code: employee_code,
    },
    approvals: approvalsRows,
    clearances: clearancesRows,
    fnf: fnfRow
  };
};

export const getEmployeeExitsByEmployeeId = async (tenantId: string, employeeId: string): Promise<EmployeeExitRequest[]> => {
  const query = `
    SELECT 
      e.id, e.tenant_id AS "tenantId", e.employee_id AS "employeeId",
      e.department_id AS "departmentId", e.position_id AS "positionId",
      e.reporting_manager_id AS "reportingManagerId", e.exit_type_id AS "exitTypeId",
      e.exit_reason_id AS "exitReasonId", e.resignation_date AS "resignationDate",
      e.proposed_last_working_day AS "proposedLastWorkingDay",
      e.notice_period_day AS "noticePeriodDay", e.waive_notice_period AS "waiveNoticePeriod",
      e.buyout_required AS "buyoutRequired", e.buyout_amount AS "buyoutAmount",
      e.explanation, e.resignation_letter_url AS "resignationLetterUrl", e.status, e.created_by_id AS "createdById",
      e.updated_by_id AS "updatedById", e.created_at AS "createdAt", e.updated_at AS "updatedAt",
      emp.first_name AS "employee_first_name",
      emp.last_name AS "employee_last_name",
      emp.employee_code AS "employee_code",
      usr.name AS "user_manager_name",
      mgr.first_name AS "emp_manager_first_name",
      mgr.last_name AS "emp_manager_last_name",
      creator.name AS "creator_name"
    FROM employee_exits e
    INNER JOIN employees emp ON e.employee_id = emp.id
    LEFT JOIN users usr ON e.reporting_manager_id = usr.id
    LEFT JOIN employees mgr ON e.reporting_manager_id = mgr.id::text
    LEFT JOIN users creator ON e.created_by_id = creator.id
    WHERE e.tenant_id = $1 AND e.employee_id = $2::uuid
    ORDER BY e.created_at DESC
  `;

  const result = await pool.query(query, [tenantId, employeeId]);
  
  return result.rows.map(row => {
    let reportingManagerName = null;
    if (row.reportingManagerId) {
      if (row.user_manager_name) {
        reportingManagerName = row.user_manager_name;
      } else if (row.emp_manager_first_name) {
        reportingManagerName = `${row.emp_manager_first_name} ${row.emp_manager_last_name}`;
      } else {
        reportingManagerName = row.reportingManagerId;
      }
    }

    const { 
      employee_first_name, employee_last_name, employee_code, 
      user_manager_name, emp_manager_first_name, emp_manager_last_name, creator_name, 
      ...baseData 
    } = row;

    return {
      ...baseData,
      reportingManagerName,
      createdBy: creator_name,
      employee: {
        first_name: employee_first_name,
        last_name: employee_last_name,
        employee_code: employee_code,
      }
    };
  });
};

export const getPendingApprovals = async (tenantId: string, employeeId: string): Promise<EmployeeExitRequest[]> => {
  const query = `
    SELECT 
      e.id, e.tenant_id AS "tenantId", e.employee_id AS "employeeId",
      e.department_id AS "departmentId", e.position_id AS "positionId",
      e.reporting_manager_id AS "reportingManagerId", e.exit_type_id AS "exitTypeId",
      e.exit_reason_id AS "exitReasonId", e.resignation_date AS "resignationDate",
      e.proposed_last_working_day AS "proposedLastWorkingDay",
      e.notice_period_day AS "noticePeriodDay", e.waive_notice_period AS "waiveNoticePeriod",
      e.buyout_required AS "buyoutRequired", e.buyout_amount AS "buyoutAmount",
      e.explanation, e.status, e.created_by_id AS "createdById",
      e.updated_by_id AS "updatedById", e.created_at AS "createdAt", e.updated_at AS "updatedAt",
      emp.first_name AS "employee_first_name",
      emp.last_name AS "employee_last_name",
      emp.employee_code AS "employee_code",
      usr.name AS "user_manager_name",
      mgr.first_name AS "emp_manager_first_name",
      mgr.last_name AS "emp_manager_last_name",
      creator.name AS "creator_name",
      a.id as "approvalStepId",
      a.step_order as "stepOrder"
    FROM exit_request_approvals a
    INNER JOIN employee_exits e ON a.exit_request_id = e.id::text
    INNER JOIN employees emp ON e.employee_id = emp.id
    LEFT JOIN users usr ON e.reporting_manager_id = usr.id
    LEFT JOIN employees mgr ON e.reporting_manager_id = mgr.id::text
    LEFT JOIN users creator ON e.created_by_id = creator.id
    WHERE a.tenant_id = $1 
      AND a.status = 'PENDING' 
      AND e.status = 'PENDING'
      AND (
        -- Only get it if it's the NEXT step to be approved (all previous steps are APPROVED)
        NOT EXISTS (
          SELECT 1 FROM exit_request_approvals a2 
          WHERE a2.exit_request_id = a.exit_request_id 
          AND a2.step_order < a.step_order 
          AND a2.status != 'APPROVED'
        )
      )
      AND (
        (a.approver_type = 'ReportingManager' AND e.reporting_manager_id = $2)
        OR (a.approver_id = $2)
        OR (a.approver_id IN (SELECT position_id FROM employees WHERE id::text = $2 OR user_id = $2))
      )
    ORDER BY a.created_at DESC
  `;

  const result = await pool.query(query, [tenantId, employeeId]);
  
  return result.rows.map(row => {
    let reportingManagerName = null;
    if (row.reportingManagerId) {
      if (row.user_manager_name) {
        reportingManagerName = row.user_manager_name;
      } else if (row.emp_manager_first_name) {
        reportingManagerName = `${row.emp_manager_first_name} ${row.emp_manager_last_name}`;
      } else {
        reportingManagerName = row.reportingManagerId;
      }
    }

    const { 
      employee_first_name, employee_last_name, employee_code, 
      user_manager_name, emp_manager_first_name, emp_manager_last_name, creator_name, 
      approvalStepId, stepOrder,
      ...baseData 
    } = row;

    return {
      ...baseData,
      reportingManagerName,
      createdBy: creator_name,
      employee: {
        first_name: employee_first_name,
        last_name: employee_last_name,
        employee_code: employee_code,
      }
    };
  });
};


export const getClearances = async (tenantId: string): Promise<any[]> => {
  const query = `
    SELECT 
      c.id as clearance_id, c.department, c.is_cleared, c.comments, c.cleared_by_id, c.cleared_at, c.checklist,
      e.id, e.tenant_id AS "tenantId", e.employee_id AS "employeeId",
      e.department_id AS "departmentId", e.position_id AS "positionId",
      e.reporting_manager_id AS "reportingManagerId", e.exit_type_id AS "exitTypeId",
      e.exit_reason_id AS "exitReasonId", e.resignation_date AS "resignationDate",
      e.proposed_last_working_day AS "proposedLastWorkingDay",
      e.notice_period_day AS "noticePeriodDay", e.waive_notice_period AS "waiveNoticePeriod",
      e.buyout_required AS "buyoutRequired", e.buyout_amount AS "buyoutAmount",
      e.explanation, e.status, e.created_by_id AS "createdById",
      e.updated_by_id AS "updatedById", e.created_at AS "createdAt", e.updated_at AS "updatedAt",
      emp.first_name AS "employee_first_name",
      emp.last_name AS "employee_last_name",
      emp.employee_code AS "employee_code",
      usr.name AS "user_manager_name",
      mgr.first_name AS "emp_manager_first_name",
      mgr.last_name AS "emp_manager_last_name",
      creator.name AS "creator_name"
    FROM exit_clearances c
    INNER JOIN employee_exits e ON c.exit_request_id = e.id::text
    INNER JOIN employees emp ON e.employee_id = emp.id
    LEFT JOIN users usr ON e.reporting_manager_id = usr.id
    LEFT JOIN employees mgr ON e.reporting_manager_id = mgr.id::text
    LEFT JOIN users creator ON e.created_by_id = creator.id
    WHERE c.tenant_id = $1 AND e.status = 'APPROVED'
    ORDER BY c.created_at DESC
  `;

  const result = await pool.query(query, [tenantId]);
  
  return result.rows.map(row => {
    let reportingManagerName = null;
    if (row.reportingManagerId) {
      if (row.user_manager_name) {
        reportingManagerName = row.user_manager_name;
      } else if (row.emp_manager_first_name) {
        reportingManagerName = `${row.emp_manager_first_name} ${row.emp_manager_last_name}`;
      } else {
        reportingManagerName = row.reportingManagerId;
      }
    }

    const { 
      employee_first_name, employee_last_name, employee_code, 
      user_manager_name, emp_manager_first_name, emp_manager_last_name, creator_name, 
      clearance_id, department, is_cleared, comments, cleared_by_id, cleared_at, checklist,
      ...baseData 
    } = row;

    return {
      ...baseData,
      clearance: {
        id: clearance_id,
        department,
        isCleared: is_cleared,
        comments,
        clearedById: cleared_by_id,
        clearedAt: cleared_at,
        checklist: checklist
      },
      reportingManagerName,
      createdBy: creator_name,
      employee: {
        first_name: employee_first_name,
        last_name: employee_last_name,
        employee_code: employee_code,
      }
    };
  });
};

export const getClearancesByRequestId = async (tenantId: string, exitRequestId: string): Promise<any[]> => {
  const query = `
    SELECT 
      c.id as clearance_id, c.department, c.is_cleared, c.comments, c.cleared_by_id, c.cleared_at, c.checklist,
      u.name as cleared_by_name
    FROM exit_clearances c
    LEFT JOIN users u ON c.cleared_by_id = u.id
    WHERE c.tenant_id = $1 AND c.exit_request_id = $2
    ORDER BY c.created_at ASC
  `;

  const result = await pool.query(query, [tenantId, exitRequestId]);
  
  return result.rows.map(row => ({
    id: row.clearance_id,
    department: row.department,
    isCleared: row.is_cleared,
    comments: row.comments,
    clearedById: row.cleared_by_id,
    clearedByName: row.cleared_by_name,
    clearedAt: row.cleared_at,
    checklist: row.checklist
  }));
};

export const deleteEmployeeExit = async (tenantId: string, id: string): Promise<any> => {
  const query = `
    DELETE FROM employee_exits 
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `;
  const result = await pool.query(query, [id, tenantId]);
  return result.rows[0];
};

export const updateEmployeeExit = async (
  tenantId: string,
  id: string,
  data: any,
  updatedById: string
): Promise<any> => {
  const query = `
    UPDATE employee_exits SET
      exit_type_id = $1,
      exit_reason_id = $2,
      resignation_date = $3::timestamp,
      proposed_last_working_day = $4::timestamp,
      notice_period_day = $5,
      waive_notice_period = $6,
      buyout_required = $7,
      buyout_amount = $8,
      explanation = $9,
      updated_by_id = $10,
      updated_at = NOW()
    WHERE id = $11 AND tenant_id = $12
    RETURNING 
      id, tenant_id AS "tenantId", employee_id AS "employeeId",
      exit_type_id AS "exitTypeId", exit_reason_id AS "exitReasonId",
      resignation_date AS "resignationDate",
      proposed_last_working_day AS "proposedLastWorkingDay",
      notice_period_day AS "noticePeriodDay",
      waive_notice_period AS "waiveNoticePeriod",
      buyout_required AS "buyoutRequired", buyout_amount AS "buyoutAmount",
      explanation, status, updated_at AS "updatedAt"
  `;

  const result = await pool.query(query, [
    data.exitTypeId || null,
    data.exitReasonId || null,
    new Date(data.resignationDate),
    new Date(data.proposedLastWorkingDay),
    data.noticePeriodDay ? new Date(data.noticePeriodDay) : null,
    !!data.waiveNoticePeriod,
    !!data.buyoutRequired,
    data.buyoutAmount || null,
    data.explanation || null,
    updatedById,
    id,
    tenantId
  ]);

  if (result.rows.length === 0) throw new Error('Exit request not found or access denied');
  return result.rows[0];
};

// Checklist Configuration Methods

export const getChecklistConfigs = async (tenantId: string): Promise<any[]> => {
  const query = `
    SELECT id, department, item_name as "itemName", created_at as "createdAt"
    FROM exit_clearance_configs
    WHERE tenant_id = $1
    ORDER BY department ASC, created_at ASC
  `;
  const result = await pool.query(query, [tenantId]);
  return result.rows;
};

export const updateExitDocumentUrl = async (tenantId: string, id: string, documentType: string, url: string): Promise<any> => {
  const column = documentType === 'relieving' ? 'relieving_letter_url' : 'experience_letter_url';
  const query = `
    UPDATE employee_exits 
    SET ${column} = $1, updated_at = NOW()
    WHERE id = $2 AND tenant_id = $3
    RETURNING *
  `;
  const result = await pool.query(query, [url, id, tenantId]);
  return result.rows[0];
};

export const addChecklistConfig = async (tenantId: string, department: string, itemName: string): Promise<any> => {
  const query = `
    INSERT INTO exit_clearance_configs (tenant_id, department, item_name)
    VALUES ($1, $2, $3)
    RETURNING id, department, item_name as "itemName", created_at as "createdAt"
  `;
  const result = await pool.query(query, [tenantId, department, itemName]);
  return result.rows[0];
};

export const deleteChecklistConfig = async (tenantId: string, id: string): Promise<any> => {
  const query = `
    DELETE FROM exit_clearance_configs
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `;
  const result = await pool.query(query, [id, tenantId]);
  return result.rows[0];
};

export const updateEmployeeExitStatus = async (
  tenantId: string, 
  id: string, 
  status: string, 
  updatedById: string
): Promise<any> => {
  // If we are rejecting, we update the main table directly
  if (status === 'REJECTED') {
    const rejectQuery = `
      UPDATE employee_exits 
      SET status = $1, updated_by_id = $2, updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;
    const result = await pool.query(rejectQuery, [status, updatedById, id, tenantId]);
    return result.rows[0];
  }

  if (status === 'APPROVED') {
    // Find the next pending step in the approval chain for this request
    const pendingStepQuery = `
      SELECT id, step_order
      FROM exit_request_approvals
      WHERE exit_request_id = $1 AND tenant_id = $2 AND status = 'PENDING'
      ORDER BY step_order ASC
      LIMIT 1
    `;
    const pendingStepResult = await pool.query(pendingStepQuery, [id, tenantId]);

    if (pendingStepResult.rows.length > 0) {
      // Mark this step as approved
      const stepId = pendingStepResult.rows[0].id;
      const approveStepQuery = `
        UPDATE exit_request_approvals
        SET status = 'APPROVED', action_date = NOW(), updated_at = NOW()
        WHERE id = $1
      `;
      await pool.query(approveStepQuery, [stepId]);

      // Check if there are any remaining pending steps
      const remainingStepsQuery = `
        SELECT id FROM exit_request_approvals
        WHERE exit_request_id = $1 AND tenant_id = $2 AND status = 'PENDING'
      `;
      const remainingStepsResult = await pool.query(remainingStepsQuery, [id, tenantId]);

      if (remainingStepsResult.rows.length > 0) {
        // Still pending more approvals, keep main status as PENDING
        return { status: 'PENDING', message: 'Step approved. Waiting for next approver.' };
      }
    }

    // If no remaining steps (or if there were no steps to begin with), mark main request as APPROVED
    const approveMainQuery = `
      UPDATE employee_exits 
      SET status = $1, updated_by_id = $2, updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;
    const result = await pool.query(approveMainQuery, [status, updatedById, id, tenantId]);
    
    // Auto-initialize clearances for the 4 departments
    const initClearanceQuery = `
      INSERT INTO exit_clearances (tenant_id, exit_request_id, department, created_at, updated_at)
      VALUES 
      ($1, $2, 'IT', NOW(), NOW()),
      ($1, $2, 'ADMIN', NOW(), NOW()),
      ($1, $2, 'FINANCE', NOW(), NOW()),
      ($1, $2, 'HR', NOW(), NOW())
    `;
    await pool.query(initClearanceQuery, [tenantId, id]);

    return result.rows[0];
  }

  // Fallback for other status updates (like COMPLETED)
  const fallbackQuery = `
    UPDATE employee_exits 
    SET status = $1, updated_by_id = $2, updated_at = NOW()
    WHERE id = $3 AND tenant_id = $4
    RETURNING *
  `;
  const fallbackResult = await pool.query(fallbackQuery, [status, updatedById, id, tenantId]);
  return fallbackResult.rows[0];
};

export const updateClearanceStatus = async (
  tenantId: string, 
  exitRequestId: string, 
  department: string, 
  isCleared: boolean, 
  comments: string,
  checklist: any,
  clearedById: string
): Promise<any> => {
  const query = `
    UPDATE exit_clearances 
    SET is_cleared = $1, comments = $2, checklist = $3, cleared_by_id = $4, cleared_at = NOW(), updated_at = NOW()
    WHERE exit_request_id = $5 AND tenant_id = $6 AND department = $7
    RETURNING *
  `;
  const result = await pool.query(query, [isCleared, comments, checklist, clearedById, exitRequestId, tenantId, department]);
  return result.rows[0];
};


export const processFnFSettlement = async (
  tenantId: string,
  exitRequestId: string,
  payload: any,
  processedById: string
): Promise<any> => {
  // 1. Validate all clearances are completed
  const clearanceCheckQuery = `
    SELECT COUNT(*) as pending_count 
    FROM exit_clearances 
    WHERE exit_request_id = $1 AND tenant_id = $2 AND is_cleared = false
  `;
  const clearanceCheck = await pool.query(clearanceCheckQuery, [exitRequestId, tenantId]);
  if (parseInt(clearanceCheck.rows[0].pending_count) > 0) {
    throw new Error("All department clearances must be completed before processing Full & Final Settlement.");
  }

  // Extract payload according to new schema
  const {
    payrollRunId = null,
    pendingSalary = 0,
    leaveEncashment = 0,
    bonus = 0,
    incentives = 0,
    loanRecovery = 0,
    salaryAdvanceRecovery = 0,
    tax = 0,
    pf = 0,
    esi = 0,
    assetDeduction = 0,
    noticeRecovery = 0,
    manualAdjustment = 0,
    totalAdditions = 0,
    totalDeductions = 0,
    netPayable = 0,
    remarks = null
  } = payload;

  // Check if it exists
  const checkQuery = `SELECT id FROM exit_fnf_settlements WHERE exit_request_id = $1 AND tenant_id = $2`;
  const checkResult = await pool.query(checkQuery, [exitRequestId, tenantId]);

  let result;
  if (checkResult.rows.length > 0) {
    const updateQuery = `
      UPDATE exit_fnf_settlements
      SET payroll_run_id = $1, pending_salary = $2, leave_encashment = $3, bonus = $4,
          incentives = $5, loan_recovery = $6, salary_advance_recovery = $7, tax = $8,
          pf = $9, esi = $10, asset_deduction = $11, notice_recovery = $12,
          manual_adjustment = $13, total_additions = $14, total_deductions = $15,
          net_payable = $16, approved_by = $17, approved_at = NOW(), remarks = $18, updated_at = NOW()
      WHERE exit_request_id = $19 AND tenant_id = $20
      RETURNING *
    `;
    result = await pool.query(updateQuery, [
      payrollRunId, pendingSalary, leaveEncashment, bonus, incentives,
      loanRecovery, salaryAdvanceRecovery, tax, pf, esi, assetDeduction,
      noticeRecovery, manualAdjustment, totalAdditions, totalDeductions,
      netPayable, processedById, remarks, exitRequestId, tenantId
    ]);
  } else {
    const insertQuery = `
      INSERT INTO exit_fnf_settlements (
        tenant_id, exit_request_id, payroll_run_id, pending_salary, leave_encashment, bonus,
        incentives, loan_recovery, salary_advance_recovery, tax, pf, esi, asset_deduction,
        notice_recovery, manual_adjustment, total_additions, total_deductions, net_payable,
        approved_by, approved_at, remarks, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), $20, NOW(), NOW()
      ) RETURNING *
    `;
    result = await pool.query(insertQuery, [
      tenantId, exitRequestId, payrollRunId, pendingSalary, leaveEncashment, bonus,
      incentives, loanRecovery, salaryAdvanceRecovery, tax, pf, esi, assetDeduction,
      noticeRecovery, manualAdjustment, totalAdditions, totalDeductions, netPayable,
      processedById, remarks
    ]);
  }

  // Once FnF is processed, we mark the main exit status as COMPLETED
  // and record completed_at
  const completeExitQuery = `
    UPDATE employee_exits 
    SET status = 'COMPLETED', updated_by_id = $1, updated_at = NOW(), completed_at = NOW()
    WHERE id = $2 AND tenant_id = $3
  `;
  await pool.query(completeExitQuery, [processedById, exitRequestId, tenantId]);

  return result.rows[0];
};

// ==========================================
// EXIT INTERVIEW METHODS
// ==========================================

export const getExitInterview = async (tenantId: string, exitRequestId: string): Promise<any> => {
  const query = `
    SELECT 
      id, tenant_id AS "tenantId", exit_request_id AS "exitRequestId",
      culture_rating AS "cultureRating", management_rating AS "managementRating",
      growth_rating AS "growthRating", compensation_rating AS "compensationRating",
      reason_detail AS "reasonDetail", positive_feedback AS "positiveFeedback",
      constructive_feedback AS "constructiveFeedback", interviewer_notes AS "interviewerNotes",
      interviewer_id AS "interviewerId", interview_date AS "interviewDate",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM exit_interviews
    WHERE tenant_id = $1 AND exit_request_id = $2
  `;
  const result = await pool.query(query, [tenantId, exitRequestId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

export const upsertExitInterview = async (
  tenantId: string, 
  exitRequestId: string, 
  data: any,
  interviewerId: string
): Promise<any> => {
  const existing = await getExitInterview(tenantId, exitRequestId);
  
  if (existing) {
    const query = `
      UPDATE exit_interviews
      SET
        culture_rating = COALESCE($1, culture_rating),
        management_rating = COALESCE($2, management_rating),
        growth_rating = COALESCE($3, growth_rating),
        compensation_rating = COALESCE($4, compensation_rating),
        reason_detail = COALESCE($5, reason_detail),
        positive_feedback = COALESCE($6, positive_feedback),
        constructive_feedback = COALESCE($7, constructive_feedback),
        interviewer_notes = COALESCE($8, interviewer_notes),
        interviewer_id = $9,
        interview_date = NOW(),
        updated_at = NOW()
      WHERE tenant_id = $10 AND exit_request_id = $11
      RETURNING *
    `;
    
    const values = [
      data.cultureRating, data.managementRating, data.growthRating, data.compensationRating,
      data.reasonDetail, data.positiveFeedback, data.constructiveFeedback, data.interviewerNotes,
      interviewerId, tenantId, exitRequestId
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  } else {
    const query = `
      INSERT INTO exit_interviews (
        tenant_id, exit_request_id, culture_rating, management_rating, 
        growth_rating, compensation_rating, reason_detail, positive_feedback, 
        constructive_feedback, interviewer_notes, interviewer_id, interview_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
      ) RETURNING *
    `;
    
    const values = [
      tenantId, exitRequestId, data.cultureRating, data.managementRating,
      data.growthRating, data.compensationRating, data.reasonDetail, 
      data.positiveFeedback, data.constructiveFeedback, data.interviewerNotes, interviewerId
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
};
