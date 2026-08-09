import { Request, Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '@/db/onboardingPool';

export const getOrgHistory = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.employeeId || req.params.id;
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    return await withTenant(tenantId, async (db) => {
      console.log('Fetching org history for employee:', id, 'tenant:', tenantId);
      // 1. Get Employee creation date and emails
      const empRes = await db.query(
        `SELECT created_at, work_email, personal_email FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, tenantId]
      );

      console.log('Employee query result rowCount:', empRes.rowCount);
      if (empRes.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      const employee = empRes.rows[0];

      // 2. Fetch Pipeline History (Candidate) linked by email
      let pipelineHistory = null;
      if (employee.work_email || employee.personal_email) {
        const candidateRes = await db.query(
          `SELECT created_at FROM pipeline_candidates WHERE tenant_id = $1 AND email IN ($2, $3) LIMIT 1`,
          [tenantId, employee.work_email, employee.personal_email]
        );
        if (candidateRes.rowCount > 0) {
          pipelineHistory = {
            type: 'pipeline',
            interviewDate: candidateRes.rows[0].created_at, // Approximation since exact interview selected date might not be saved as a single field
          };
        }
      }

      // 3. Fetch Onboarding History (from employee_onboarding_invites + joining date from work details)
      let onboardingHistory = null;
      const onboardingRes = await db.query(
        `SELECT eoi.created_at, eoi.updated_at, eoi.status, wd.work_joining_date
         FROM employee_onboarding_invites eoi
         LEFT JOIN employee_work_details wd ON wd.employee_id = eoi.employee_id
         WHERE eoi.employee_id = $1 AND eoi.tenant_id = $2
         LIMIT 1`,
        [id, tenantId]
      );
      if (onboardingRes.rowCount > 0) {
        const invite = onboardingRes.rows[0];
        if (invite.status === 'completed' || invite.status === 'approved') {
          onboardingHistory = {
            type: 'onboarding',
            // Use Joining Date entered in the onboarding form; fall back to invite updated_at
            onboardingDate: invite.work_joining_date || invite.updated_at || invite.created_at,
          };
        }
      }

      // 4. Fetch Role History
      const rolesRes = await db.query(
        `SELECT role_name, start_date, end_date FROM employee_role_history WHERE employee_id = $1 AND tenant_id = $2 ORDER BY start_date DESC`,
        [id, tenantId]
      );
      const roles = rolesRes.rows.map((row: any) => ({
        type: 'role',
        roleName: row.role_name,
        startDate: row.start_date,
        endDate: row.end_date, // null means "Present"
      }));

      // If there is no role history (for legacy employees), fetch current role from employee_work_details
      if (roles.length === 0) {
        const workRes = await db.query(
          `SELECT wd.work_joining_date, p.title as role_name 
           FROM employee_work_details wd 
           LEFT JOIN positions p ON wd.position_id = p.id 
           WHERE wd.employee_id = $1 
           ORDER BY wd.created_at DESC LIMIT 1`,
          [id]
        );
        if (workRes.rowCount > 0 && workRes.rows[0].role_name) {
          roles.push({
            type: 'role',
            roleName: workRes.rows[0].role_name,
            startDate: workRes.rows[0].work_joining_date,
            endDate: null,
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          pipeline: pipelineHistory,
          onboarding: onboardingHistory,
          roles: roles,
        }
      });
    });
  } catch (error) {
    console.error('Error fetching org history:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
