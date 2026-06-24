import pool from '@/config/dbpool';
import crypto from 'crypto';

export interface UserData {
  id?: string;
  tenantId: string;
  name: string;
  workEmail: string;
  personalEmail?: string | null;
  phone: string;
  passwordHash: string;
  role?: string;
  positionId?: string | null;
  reportsToId?: string | null;
  dateOfBirth?: Date | null;
  workDays?: number[];
  assignedShiftId?: string | null;
  shiftAssignedById?: string | null;
  shiftAssignedDate?: Date | null;
  isActive?: boolean;
  avatarUrl?: string | null;
  employeeId?: string | null;
  minWorkingHours?: number;
}

export class UserModel {
  /**
   * Create a new user
   */
  static async create(data: UserData): Promise<any> {
    const id = data.id || UserModel.generateUuid();
    const query = `
      INSERT INTO "users" (
        id, tenant_id, name, work_email, personal_email, phone, password_hash,
        role, position_id, reports_to_id, date_of_birth, work_days,
        assigned_shift_id, is_active, avatar_url, employee_id, min_working_hours,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `;

    const values = [
      id,
      data.tenantId,
      data.name,
      data.workEmail,
      data.personalEmail || null,
      data.phone,
      data.passwordHash,
      data.role || 'user',
      data.positionId || null,
      data.reportsToId || null,
      data.dateOfBirth || null,
      data.workDays || [1, 2, 3, 4, 5],
      data.assignedShiftId || null,
      data.isActive ?? true,
      data.avatarUrl || null,
      data.employeeId || null,
      data.minWorkingHours ?? 6
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.create:', error.message);
      throw error;
    }
  }

  /**
   * Find a specific user by ID and tenant ID
   */
  static async findById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT 
        u.id,
        u.tenant_id as "tenantId",
        u.name,
        u.work_email as "workEmail",
        u.personal_email as "personalEmail",
        u.phone,
        u.password_hash as "passwordHash",
        u.role,
        u.position_id as "positionId",
        u.reports_to_id as "reportsToId",
        u.date_of_birth as "dateOfBirth",
        u.work_days as "workDays",
        u.assigned_shift_id as "assignedShiftId",
        u.shift_assigned_by_id as "shiftAssignedById",
        u.shift_assigned_date as "shiftAssignedDate",
        u.is_active as "isActive",
        u.last_login_at as "lastLoginAt",
        u.min_working_hours as "minWorkingHours",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        u.avatar_url as "avatarUrl",
        u.employee_id as "employeeId",
        (
          SELECT th.actor_name 
          FROM transaction_history th 
          WHERE th.entity_type = 'user' 
            AND th.entity_id = u.id 
            AND th.action = 'create'
            AND th.tenant_id = u.tenant_id
          ORDER BY th.created_at ASC 
          LIMIT 1
        ) AS "createdBy",
        (
          SELECT json_build_object('id', p.id, 'title', p.title) 
          FROM positions p 
          WHERE p.id = u.position_id
        ) as position,
        (
          SELECT json_build_object(
            'id', r.id, 
            'name', r.name,
            'avatarUrl', r.avatar_url,
            'position', (SELECT json_build_object('title', rp.title) FROM positions rp WHERE rp.id = r.position_id)
          )
          FROM users r
          WHERE r.id = u.reports_to_id
        ) as "reportsTo",
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'role', json_build_object('name', ro.name, 'slug', ro.slug)
              )
            ),
            '[]'::json
          )
          FROM user_roles ur
          JOIN roles ro ON ur.role_id = ro.id
          WHERE ur.user_id = u.id
        ) as "userRoles",
        (
          SELECT json_build_object('employee_code', e.employee_code) 
          FROM employees e 
          WHERE e.id = u.employee_id
        ) as employee,
        (
          SELECT json_build_object(
            'id', s.id,
            'name', s.name,
            'startTime', s.start_time,
            'endTime', s.end_time
          )
          FROM shifts s
          WHERE s.id = u.assigned_shift_id
        ) as "assignedShift",
        (
          SELECT json_build_object(
            'id', sab.id, 
            'name', sab.name,
            'position', (SELECT json_build_object('title', sabp.title) FROM positions sabp WHERE sabp.id = sab.position_id)
          )
          FROM users sab
          WHERE sab.id = u.shift_assigned_by_id
        ) as "shiftAssignedBy"
      FROM "users" u
      WHERE u.id = $1 AND u.tenant_id = $2;
    `;
    try {
      const result = await pool.query(query, [id, tenantId]);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findById:', error.message);
      throw error;
    }
  }

  /**
   * Update a user
   */
  static async update(id: string, tenantId: string, data: Partial<UserData>): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    // Map camelCase fields to database snake_case columns
    const columnMap: Record<string, string> = {
      name: 'name',
      workEmail: 'work_email',
      personalEmail: 'personal_email',
      phone: 'phone',
      passwordHash: 'password_hash',
      role: 'role',
      positionId: 'position_id',
      reportsToId: 'reports_to_id',
      dateOfBirth: 'date_of_birth',
      workDays: 'work_days',
      assignedShiftId: 'assigned_shift_id',
      shiftAssignedById: 'shift_assigned_by_id',
      shiftAssignedDate: 'shift_assigned_date',
      isActive: 'is_active',
      avatarUrl: 'avatar_url',
      employeeId: 'employee_id',
      minWorkingHours: 'min_working_hours'
    };

    Object.entries(data).forEach(([key, value]) => {
      const column = columnMap[key];
      if (column !== undefined) {
        fields.push(`${column} = $${placeholderIndex}`);
        values.push(value);
        placeholderIndex++;
      }
    });

    if (fields.length === 0) return null;

    // Add updated_at
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id, tenantId);
    const query = `
      UPDATE "users"
      SET ${fields.join(', ')}
      WHERE id = $${placeholderIndex} AND tenant_id = $${placeholderIndex + 1}
      RETURNING *;
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.update:', error.message);
      throw error;
    }
  }

  /**
   * Delete a user permanently
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM "users"
      WHERE id = $1 AND tenant_id = $2;
    `;
    try {
      const result = await pool.query(query, [id, tenantId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.delete:', error.message);
      throw error;
    }
  }

  /**
   * Find duplicate details in org
   */
  static async findDuplicate(tenantId: string, workEmail: string, personalEmail?: string | null, phone?: string | null): Promise<any> {
    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramCount = 1;
    const orConditions: string[] = [];

    if (workEmail) {
      paramCount++;
      orConditions.push(`LOWER(work_email) = $${paramCount}`);
      values.push(workEmail.toLowerCase());
    }
    if (personalEmail) {
      paramCount++;
      orConditions.push(`LOWER(personal_email) = $${paramCount}`);
      values.push(personalEmail.toLowerCase());
    }
    if (phone) {
      paramCount++;
      orConditions.push(`phone = $${paramCount}`);
      values.push(phone);
    }

    if (orConditions.length === 0) return null;
    conditions.push(`(${orConditions.join(' OR ')})`);

    const query = `
      SELECT id, name, work_email as "workEmail", personal_email as "personalEmail", phone, is_active as "isActive"
      FROM "users"
      WHERE ${conditions.join(' AND ')}
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, values);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findDuplicate:', error.message);
      throw error;
    }
  }

  /**
   * Check if user exists and is active
   */
  static async existsAndActive(id: string, tenantId: string): Promise<boolean> {
    const query = `SELECT 1 FROM "users" WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1;`;
    try {
      const result = await pool.query(query, [id, tenantId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.existsAndActive:', error.message);
      throw error;
    }
  }

  /**
   * Check email duplicate excluding specific user
   */
  static async findByEmailExcluding(email: string, tenantId: string, excludeId: string): Promise<any> {
    const query = `
      SELECT id FROM "users"
      WHERE LOWER(work_email) = $1 AND tenant_id = $2 AND id <> $3
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, [email.toLowerCase(), tenantId, excludeId]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findByEmailExcluding:', error.message);
      throw error;
    }
  }

  /**
   * Bulk restore soft-deleted users
   */
  static async bulkRestore(ids: string[], tenantId: string): Promise<number> {
    if (ids.length === 0) return 0;
    const query = `
      UPDATE "users"
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND is_active = false;
    `;
    try {
      const result = await pool.query(query, [ids, tenantId]);
      return result.rowCount ?? 0;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.bulkRestore:', error.message);
      throw error;
    }
  }

  /**
   * Bulk permanently delete soft-deleted users
   */
  static async bulkDelete(ids: string[], tenantId: string): Promise<number> {
    if (ids.length === 0) return 0;
    const query = `
      DELETE FROM "users"
      WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND is_active = false;
    `;
    try {
      const result = await pool.query(query, [ids, tenantId]);
      return result.rowCount ?? 0;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.bulkDelete:', error.message);
      throw error;
    }
  }

  /**
   * Permanently delete all soft-deleted users under a tenant
   */
  static async emptyTrash(tenantId: string): Promise<number> {
    const query = `
      DELETE FROM "users"
      WHERE tenant_id = $1 AND is_active = false;
    `;
    try {
      const result = await pool.query(query, [tenantId]);
      return result.rowCount ?? 0;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.emptyTrash:', error.message);
      throw error;
    }
  }

  /**
   * Query a shift by ID and tenant ID
   */
  static async findShiftById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT id, name, start_time as "startTime", end_time as "endTime"
      FROM "shifts"
      WHERE id = $1 AND tenant_id = $2 AND is_active = true
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, [id, tenantId]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findShiftById:', error.message);
      throw error;
    }
  }

  /**
   * Query a role by slug and tenant ID
   */
  static async findRoleBySlug(slug: string, tenantId: string): Promise<any> {
    const query = `
      SELECT id, name, slug
      FROM "roles"
      WHERE tenant_id = $1 AND slug = $2
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, [tenantId, slug]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findRoleBySlug:', error.message);
      throw error;
    }
  }

  /**
   * Insert role mapping into user_roles
   */
  static async addUserRole(userId: string, roleId: string, tenantId: string, assignedById: string): Promise<void> {
    const query = `
      INSERT INTO "user_roles" (user_id, role_id, tenant_id, assigned_by_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    `;
    try {
      await pool.query(query, [userId, roleId, tenantId, assignedById]);
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.addUserRole:', error.message);
      throw error;
    }
  }

  /**
   * Delete user roles
   */
  static async deleteUserRoles(userId: string, tenantId: string): Promise<void> {
    const query = `
      DELETE FROM "user_roles"
      WHERE user_id = $1 AND tenant_id = $2;
    `;
    try {
      await pool.query(query, [userId, tenantId]);
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.deleteUserRoles:', error.message);
      throw error;
    }
  }

  /**
   * Query position by title (case-insensitive)
   */
  static async findPositionByTitle(title: string, tenantId: string): Promise<any> {
    const query = `
      SELECT id FROM "positions"
      WHERE tenant_id = $1 AND LOWER(title) = LOWER($2)
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, [tenantId, title]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findPositionByTitle:', error.message);
      throw error;
    }
  }

  /**
   * Query department by code
   */
  static async findDepartmentByCode(code: string, tenantId: string): Promise<any> {
    const query = `
      SELECT id FROM "departments"
      WHERE tenant_id = $1 AND code = $2
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, [tenantId, code]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findDepartmentByCode:', error.message);
      throw error;
    }
  }

  /**
   * Create department
   */
  static async createDepartment(data: { id: string; tenantId: string; code: string; name: string; createdById: string; isActive: boolean }): Promise<any> {
    const query = `
      INSERT INTO "departments" (id, tenant_id, code, name, created_by_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;
    try {
      const result = await pool.query(query, [data.id, data.tenantId, data.code, data.name, data.createdById, data.isActive]);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.createDepartment:', error.message);
      throw error;
    }
  }

  /**
   * Query sub-department by code
   */
  static async findSubDepartmentByCode(code: string, tenantId: string): Promise<any> {
    const query = `
      SELECT id FROM "sub_departments"
      WHERE tenant_id = $1 AND code = $2
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, [tenantId, code]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findSubDepartmentByCode:', error.message);
      throw error;
    }
  }

  /**
   * Create sub-department
   */
  static async createSubDepartment(data: { id: string; tenantId: string; parentDepartmentId: string; code: string; name: string; createdById: string; isActive: boolean }): Promise<any> {
    const query = `
      INSERT INTO "sub_departments" (id, tenant_id, parent_department_id, code, name, created_by_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `;
    try {
      const result = await pool.query(query, [data.id, data.tenantId, data.parentDepartmentId, data.code, data.name, data.createdById, data.isActive]);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.createSubDepartment:', error.message);
      throw error;
    }
  }

  /**
   * Query grade by code(s)
   */
  static async findGradeByCodes(codes: string[], tenantId: string): Promise<any> {
    const query = `
      SELECT id, code FROM "grades"
      WHERE tenant_id = $1 AND code = ANY($2::text[])
      LIMIT 1;
    `;
    try {
      const result = await pool.query(query, [tenantId, codes]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.findGradeByCodes:', error.message);
      throw error;
    }
  }

  /**
   * Create grade
   */
  static async createGrade(data: { id: string; tenantId: string; code: string; name: string; levelOrder: number; createdById: string; isActive: boolean }): Promise<any> {
    const query = `
      INSERT INTO "grades" (id, tenant_id, code, name, level_order, created_by_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, code;
    `;
    try {
      const result = await pool.query(query, [data.id, data.tenantId, data.code, data.name, data.levelOrder, data.createdById, data.isActive]);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.createGrade:', error.message);
      throw error;
    }
  }

  /**
   * Update grade code
   */
  static async updateGradeCode(id: string, code: string): Promise<any> {
    const query = `
      UPDATE "grades"
      SET code = $1
      WHERE id = $2
      RETURNING id, code;
    `;
    try {
      const result = await pool.query(query, [code, id]);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.updateGradeCode:', error.message);
      throw error;
    }
  }

  /**
   * Create position
   */
  static async createPosition(data: { id: string; tenantId: string; code: string; title: string; departmentId: string; subDepartmentId?: string | null; gradeId: string; createdById: string; updatedById: string; isActive: boolean }): Promise<any> {
    const query = `
      INSERT INTO "positions" (id, tenant_id, code, title, department_id, sub_department_id, grade_id, created_by_id, updated_by_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id;
    `;
    try {
      const result = await pool.query(query, [data.id, data.tenantId, data.code, data.title, data.departmentId, data.subDepartmentId || null, data.gradeId, data.createdById, data.updatedById, data.isActive]);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in UserModel.createPosition:', error.message);
      throw error;
    }
  }

  /**
   * Helper to generate a random UUID
   */
  static generateUuid(): string {
    return crypto.randomUUID();
  }
}
