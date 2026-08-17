import { Response } from "express";
import pool from "@/config/dbpool";
import { UserModel } from "@/models/user.model";
import { DeletedMemberModel } from "../models/deletedMember.model";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  CreateUserData,
  UpdateUserData,
  ChangePasswordData,
} from "@/types";
import bcrypt from "bcryptjs";
import { uploadImageToR2 } from "@/utils/r2Client";
import { emailService } from "@/utils/emailService";
import {
  recordTransaction,
  diffShallow,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from "@/utils/transactionHistory";
import { entitlementService, EntitlementError } from "@/services/EntitlementService";

export class UserController {
  /**
   * Get all members/users with filtering and pagination (tenant-aware)
   */
  static async getMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const {
        page = 1,
        limit = 20,
        role,
        position,
        reportsToId,
        isActive = "true",
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      // Ensure deleted_members lookup table exists (lazy init)
      await DeletedMemberModel.ensureTable();

      // Build dynamic SQL filters
      const whereClauses: string[] = ['u.tenant_id = $1', 'u.id NOT IN (SELECT user_id FROM deleted_members)'];
      const values: any[] = [req.tenantId];
      let paramCount = 1;

      if (role) {
        paramCount++;
        if (typeof role === 'string' && role.includes(',')) {
          const rolesList = role.split(',');
          whereClauses.push(`u.role = ANY($${paramCount}::text[])`);
          values.push(rolesList);
        } else {
          whereClauses.push(`u.role = $${paramCount}`);
          values.push(role);
        }
      }

      if (position) {
        paramCount++;
        whereClauses.push(`EXISTS (
          SELECT 1 FROM positions p 
          WHERE p.id = u.position_id AND p.title = $${paramCount}
        )`);
        values.push(position);
      }

      if (reportsToId) {
        paramCount++;
        whereClauses.push(`u.reports_to_id = $${paramCount}`);
        values.push(reportsToId);
      }

      if (isActive !== "all") {
        paramCount++;
        whereClauses.push(`u.is_active = $${paramCount}`);
        values.push(isActive === "true");
      }

      if (search) {
        paramCount++;
        whereClauses.push(`(
          u.name ILIKE $${paramCount} OR 
          u.work_email ILIKE $${paramCount} OR 
          u.personal_email ILIKE $${paramCount}
        )`);
        values.push(`%${search}%`);
      }

      // Build sort options
      const allowedSortColumns = ["createdAt", "updatedAt", "name", "role"];
      const sortColumnMap: Record<string, string> = {
        createdAt: "u.created_at",
        updatedAt: "u.updated_at",
        name: "u.name",
        role: "u.role",
      };

      const sortCol = allowedSortColumns.includes(sortBy as string)
        ? sortColumnMap[sortBy as string]
        : "u.created_at";

      const sortDir = sortOrder === "asc" ? "ASC" : "DESC";

      const skip = (Number(page) - 1) * Number(limit);
      const limitVal = Number(limit);

      const countValues = [...values];

      paramCount++;
      const limitParamIndex = paramCount;
      values.push(limitVal);

      paramCount++;
      const offsetParamIndex = paramCount;
      values.push(skip);

      const queryList = `
        SELECT 
          u.id,
          u.name,
          u.work_email as "workEmail",
          u.personal_email as "personalEmail",
          u.phone,
          u.role,
          u.avatar_url as "avatarUrl",
          u.min_working_hours as "minWorkingHours",
          u.is_active as "isActive",
          u.ai_enabled as "aiEnabled",
          u.last_login_at as "lastLoginAt",
          u.created_at as "createdAt",
          u.updated_at as "updatedAt",
          u.updated_at as "deletedAt",
          (
            SELECT th.actor_name 
            FROM transaction_history th 
            WHERE th.entity_type = 'user' 
              AND th.entity_id = u.id 
              AND (th.action = 'delete' OR (th.action = 'update' AND 'isActive' = ANY(th.changed_fields)))
              AND th.tenant_id = u.tenant_id
            ORDER BY th.created_at DESC 
            LIMIT 1
          ) AS "deletedBy",
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
            SELECT th.actor_name 
            FROM transaction_history th 
            WHERE th.entity_type = 'user' 
              AND th.entity_id = u.id 
              AND th.action = 'update'
              AND th.tenant_id = u.tenant_id
            ORDER BY th.created_at DESC 
            LIMIT 1
          ) AS "updatedBy",
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
          ) as "userRoles"
        FROM users u
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY ${sortCol} ${sortDir}
        LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
      `;

      const queryCount = `
        SELECT COUNT(*)::integer as count
        FROM users u
        WHERE ${whereClauses.join(' AND ')}
      `;

      const [membersResult, countResult] = await Promise.all([
        pool.query(queryList, values),
        pool.query(queryCount, countValues),
      ]);

      const members = membersResult.rows;
      const total = countResult.rows[0]?.count || 0;

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: members,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1,
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get members error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch members",
      } as ApiResponse);
    }
  }

  /**
   * Get member/user by ID (tenant-aware)
   */
  static async getMemberById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const member = await UserModel.findById(id, req.tenantId);

      if (!member) {
        res.status(404).json({
          success: false,
          error: "Member not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: member,
      } as ApiResponse);
    } catch (error) {
      console.error("Get member by ID error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch member",
      } as ApiResponse);
    }
  }

  /**
   * Check if a member exists for syncing onboarding
   */
  static async checkSync(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
        return;
      }

      const { employeeId, workEmail, phone } = req.query;
      
      console.log(`[checkSync] Params:`, req.query);
      
      let user = null;

      if (employeeId) {
        const result = await pool.query(`SELECT id, name, work_email as "workEmail", phone, employee_id as "employeeId", role FROM users WHERE tenant_id = $1 AND employee_id = $2 AND is_active = true`, [req.tenantId, employeeId]);
        if (result.rows.length > 0) user = result.rows[0];
        console.log(`[checkSync] Searched by employeeId (${employeeId}), found:`, user ? user.id : 'none');
      }

      if (!user && workEmail) {
        const result = await pool.query(`SELECT id, name, work_email as "workEmail", phone, employee_id as "employeeId", role FROM users WHERE tenant_id = $1 AND work_email ILIKE $2 AND is_active = true AND employee_id IS NULL`, [req.tenantId, workEmail]);
        console.log(`[checkSync] Searched by workEmail (${workEmail}), result count:`, result.rows.length);
        // Only return if exactly one is found
        if (result.rows.length === 1) user = result.rows[0];
      }

      if (!user && phone) {
        const phoneStr = String(phone).replace(/\D/g, "");
        if (phoneStr.length > 0) {
          const result = await pool.query(`SELECT id, name, work_email as "workEmail", phone, employee_id as "employeeId", role FROM users WHERE tenant_id = $1 AND phone = $2 AND is_active = true AND employee_id IS NULL`, [req.tenantId, phoneStr]);
          console.log(`[checkSync] Searched by phone (${phoneStr}), result count:`, result.rows.length);
          if (result.rows.length === 1) user = result.rows[0];
        }
      }

      console.log(`[checkSync] Returning exists:`, !!user);
      if (user) {
        res.status(200).json({ success: true, data: { exists: true, member: user } });
      } else {
        res.status(200).json({ success: true, data: { exists: false } });
      }
    } catch (error) {
      console.error("Check sync error:", error);
      res.status(500).json({ success: false, error: "Failed to check member sync" });
    }
  }

  /**
   * Sync an onboarding employeeId to an existing member
   */
  static async syncEmployee(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context required" });
        return;
      }

      const memberId = req.params.id;
      const { employeeId } = req.body;

      if (!employeeId) {
        res.status(400).json({ success: false, error: "employeeId is required" });
        return;
      }

      const result = await pool.query(
        `UPDATE users SET employee_id = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [employeeId, memberId, req.tenantId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: "Member not found" });
        return;
      }

      res.status(200).json({ success: true, message: "Member synced successfully" });
    } catch (error) {
      console.error("Sync employee error:", error);
      res.status(500).json({ success: false, error: "Failed to sync member" });
    }
  }

  /**
   * Create new member/user (tenant-aware)
   */
  static async createMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const userData: any = req.body;

      try {
        await entitlementService.checkLimit(req.tenantId, 'members');
      } catch (err) {
        if (err instanceof EntitlementError) {
          res.status(403).json({ success: false, error: err.message, details: { current: err.current, allowed: err.allowed } });
          return;
        }
        throw err;
      }

      // Validate required fields
      if (
        !userData.name ||
        !userData.workEmail ||
        !userData.password ||
        (!userData.positionId && !userData.positionTitle)
      ) {
        res.status(400).json({
          success: false,
          error: "Name, work email, password, and position are required",
        } as ApiResponse);
        return;
      }

      // Validate name and positionTitle text format
      const textRegex = /^[a-zA-Z\s]*$/;
      if (userData.name && !textRegex.test(userData.name)) {
        res.status(400).json({
          success: false,
          error: "Name can only contain text and spaces",
        } as ApiResponse);
        return;
      }
      if (userData.positionTitle && !textRegex.test(userData.positionTitle)) {
        res.status(400).json({
          success: false,
          error: "Position title can only contain text and spaces",
        } as ApiResponse);
        return;
      }

      // Validate phone number — must be exactly 10 digits
      if (userData.phone !== undefined && userData.phone !== null && userData.phone !== "") {
        const phoneDigits = String(userData.phone).replace(/\D/g, "");
        if (phoneDigits.length !== 10) {
          res.status(400).json({
            success: false,
            error: "Phone number must be exactly 10 digits",
          } as ApiResponse);
          return;
        }
      }

      // Check if user already exists within tenant
      const existingUser = await UserModel.findDuplicate(
        req.tenantId,
        userData.workEmail,
        userData.personalEmail,
        userData.phone
      );

      if (existingUser) {
        // Identify which field conflicts to give a precise error
        if (existingUser.workEmail === userData.workEmail.toLowerCase()) {
          throw new ValidationError("A member with this work email already exists in this organization");
        }
        if (userData.personalEmail && existingUser.personalEmail === userData.personalEmail.toLowerCase()) {
          throw new ValidationError("A member with this personal email already exists in this organization");
        }
        if (userData.phone && existingUser.phone === userData.phone) {
          throw new ValidationError("A member with this phone number already exists in this organization");
        }
        throw new ValidationError("A member with these details already exists in this organization");
      }

      // Validate reports to user if provided
      if (userData.reportsToId) {
        const isReportsToValid = await UserModel.existsAndActive(userData.reportsToId, req.tenantId);
        if (!isReportsToValid) {
          throw new ValidationError("Reports to user not found in this tenant");
        }
      }

      // Resolve position
      let positionId = userData.positionId;
      if (!positionId && userData.positionTitle) {
        positionId = await UserController.getOrCreateCustomPosition(
          req.tenantId,
          req.user.id,
          userData.positionTitle
        );
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Validate assigned shift if provided
      if (userData.assignedShiftId) {
        const shift = await UserModel.findShiftById(userData.assignedShiftId, req.tenantId);
        if (!shift) {
          throw new ValidationError(
            "Assigned shift not found or inactive in this tenant",
          );
        }
      }

      // Auto-resolve employeeId by workEmail if not provided
      let targetEmployeeId = userData.employeeId || null;
      if (!targetEmployeeId && userData.workEmail) {
        try {
          const empMatch = await pool.query(
            `SELECT id FROM employees 
               WHERE tenant_id = $1 AND (LOWER(work_email) = LOWER($2) OR (personal_email IS NOT NULL AND LOWER(personal_email) = LOWER($2))) 
               ORDER BY (CASE WHEN date_of_birth IS NOT NULL AND date_of_birth::text NOT LIKE '1970-01-01%' THEN 0 ELSE 1 END) ASC, created_at ASC 
               LIMIT 1`,
            [req.tenantId, userData.workEmail.trim()]
          );
          if (empMatch.rows[0]) {
            targetEmployeeId = empMatch.rows[0].id;
          }
        } catch (err) {
          console.error("Failed to auto-resolve employeeId by email in user create:", err);
        }
      }

      // Create user via UserModel using raw INSERT query
      const createdRaw = await UserModel.create({
        tenantId: req.tenantId,
        name: userData.name,
        workEmail: userData.workEmail.toLowerCase(),
        personalEmail: userData.personalEmail?.toLowerCase() || null,
        phone: userData.phone,
        passwordHash,
        role: userData.role || "user",
        positionId: positionId || null,
        reportsToId: userData.reportsToId || null,
        dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
        workDays: userData.workDays || [1, 2, 3, 4, 5],
        assignedShiftId: userData.assignedShiftId || null,
        isActive: userData.isActive !== undefined ? userData.isActive : true,
        minWorkingHours: userData.minWorkingHours !== undefined ? Number(userData.minWorkingHours) : 6,
        employeeId: targetEmployeeId,
      });

      // Load the newly created member with relation details using raw SELECT query
      const newUser = await UserModel.findById(createdRaw.id, req.tenantId);

      // RBAC Sync: Assign the role in UserRole table if it's an RBAC role
      if (userData.role) {
        const rbacRole = await UserModel.findRoleBySlug(userData.role, req.tenantId);
        if (rbacRole) {
          await UserModel.addUserRole(newUser.id, rbacRole.id, req.tenantId, req.user.id);
        }
      }

      // Enqueue welcome email to the newly created member via central queue-ready system
      try {
        const targetEmail = (userData.sendEmailTo === "personal" && newUser.personalEmail)
          ? newUser.personalEmail
          : newUser.workEmail;

        await emailService.enqueueCentralizedMail({
          tenantId: req.tenantId,
          to: targetEmail,
          subject: "Welcome to our portal",
          templateType: "welcome",
          templateData: {
            name: newUser.name,
            email: newUser.workEmail, // Login email is always the work email
            password: userData.password, // send raw password to the user in welcome email
          },
        });
      } catch (mailError) {
        console.error("⚠️ Failed to enqueue welcome email for new member:", mailError);
      }

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.CREATE,
        actionLabel: `Member created: ${newUser.name}`,
        entityType: EntityType.USER,
        entityId: newUser.id,
        entityLabel: newUser.name,
        afterData: {
          name: newUser.name,
          workEmail: newUser.workEmail,
          personalEmail: newUser.personalEmail,
          phone: newUser.phone,
          role: newUser.role,
          position: newUser.position?.title,
          isActive: newUser.isActive,
        },
        statusCode: 201,
      });

      res.status(201).json({
        success: true,
        data: newUser,
        message: "Member created successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create member error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create member",
      } as ApiResponse);
    }
  }

  /**
   * Update member/user (tenant-aware)
   */
  static async updateMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const updates: any = req.body;

      // Extract and remove minWorkingHours from updates to prevent Prisma validation error
      const minWorkingHoursVal = updates.minWorkingHours;
      delete updates.minWorkingHours;

      // Remove fields that shouldn't be updated directly
      delete (updates as any).passwordHash;
      delete (updates as any).tenantId;
      delete (updates as any).createdAt;

      // Check if user exists and belongs to tenant
      const existingUser = await UserModel.findById(id, req.tenantId);

      if (!existingUser) {
        throw new NotFoundError("User not found in this tenant");
      }

      // Check for email conflicts within tenant if email is being updated
      if (
        updates.workEmail &&
        updates.workEmail.toLowerCase() !== existingUser.workEmail
      ) {
        const duplicateUser = await UserModel.findByEmailExcluding(updates.workEmail, req.tenantId, id);

        if (duplicateUser) {
          throw new ValidationError("Work email already exists in this tenant");
        }
      }

      // Validate name and positionTitle text format
      const textRegex = /^[a-zA-Z\s]*$/;
      if (updates.name && !textRegex.test(updates.name)) {
        res.status(400).json({
          success: false,
          error: "Name can only contain text and spaces",
        } as ApiResponse);
        return;
      }
      if (updates.positionTitle && !textRegex.test(updates.positionTitle)) {
        res.status(400).json({
          success: false,
          error: "Position title can only contain text and spaces",
        } as ApiResponse);
        return;
      }

      // Validate phone number — must be exactly 10 digits if provided
      if (updates.phone !== undefined && updates.phone !== null && updates.phone !== "") {
        const phoneDigits = String(updates.phone).replace(/\D/g, "");
        if (phoneDigits.length !== 10) {
          res.status(400).json({
            success: false,
            error: "Phone number must be exactly 10 digits",
          } as ApiResponse);
          return;
        }
      }

      // Validate reports to user if provided
      if (updates.reportsToId) {
        const isReportsToValid = await UserModel.existsAndActive(updates.reportsToId, req.tenantId);

        if (!isReportsToValid) {
          throw new ValidationError("Reports to user not found in this tenant");
        }
      }

      // Validate assigned shift if provided
      if (updates.assignedShiftId) {
        const shift = await UserModel.findShiftById(updates.assignedShiftId, req.tenantId);

        if (!shift) {
          throw new ValidationError(
            "Assigned shift not found or inactive in this tenant",
          );
        }
      }

      // Convert dates if provided
      if (updates.dateOfBirth)
        updates.dateOfBirth = new Date(updates.dateOfBirth);
      if (updates.workEmail)
        updates.workEmail = updates.workEmail.toLowerCase();
      if (updates.personalEmail)
        updates.personalEmail = updates.personalEmail.toLowerCase();

      // Resolve position for update
      let positionId = updates.positionId;
      if (!positionId && updates.positionTitle) {
        positionId = await UserController.getOrCreateCustomPosition(
          req.tenantId,
          req.user!.id,
          updates.positionTitle
        );
      }

      // Update shift assignment tracking if shift is being changed
      const updateData: any = { ...updates, updatedAt: new Date() };
      if (positionId) {
        updateData.positionId = positionId;
      }
      delete updateData.positionTitle;

      if (
        updates.assignedShiftId &&
        updates.assignedShiftId !== existingUser.assignedShiftId
      ) {
        updateData.shiftAssignedById = req.user!.id;
        updateData.shiftAssignedDate = new Date();
      }

      // Add minWorkingHours to updateData if it was provided
      if (minWorkingHoursVal !== undefined) {
        updateData.minWorkingHours = Number(minWorkingHoursVal);
      }

      // Update user using UserModel raw SQL update
      await UserModel.update(id, req.tenantId, updateData);

      // Reload updated member details with relations using raw SELECT query
      const updatedUser = await UserModel.findById(id, req.tenantId);

      // RBAC Sync: If role is updated, sync UserRole table
      if (updates.role) {
        const rbacRole = await UserModel.findRoleBySlug(updates.role, req.tenantId);
        if (rbacRole) {
          await UserModel.deleteUserRoles(id, req.tenantId);
          await UserModel.addUserRole(id, rbacRole.id, req.tenantId, req.user!.id);
        }
      }

      const cleanExisting = {
        name: existingUser.name,
        workEmail: existingUser.workEmail,
        personalEmail: existingUser.personalEmail,
        phone: existingUser.phone,
        role: existingUser.role,
        positionId: existingUser.positionId,
        reportsToId: existingUser.reportsToId,
        assignedShiftId: existingUser.assignedShiftId,
        isActive: existingUser.isActive,
      };

      const cleanUpdated = {
        name: updatedUser.name,
        workEmail: updatedUser.workEmail,
        personalEmail: updatedUser.personalEmail,
        phone: updatedUser.phone,
        role: updatedUser.role,
        positionId: positionId || existingUser.positionId,
        reportsToId: updatedUser.reportsTo?.id || null,
        assignedShiftId: updatedUser.assignedShift?.id || null,
        isActive: updatedUser.isActive,
      };

      const { changedFields, before, after } = diffShallow(cleanExisting, cleanUpdated);

      if (changedFields.length > 0) {
        recordTransaction({
          req,
          section: Section.ADMIN,
          module: Module.MEMBERS,
          page: Page.MEMBER_LIST,
          action: Action.UPDATE,
          actionLabel: `Member updated: ${updatedUser.name} (${changedFields.join(", ")})`,
          entityType: EntityType.USER,
          entityId: id,
          entityLabel: updatedUser.name,
          beforeData: before,
          afterData: after,
          changedFields,
          statusCode: 200,
        });
      }

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: "Member updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update member error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to update member",
      } as ApiResponse);
    }
  }

  /**
   * Delete member (soft delete - tenant-aware)
   */
  static async deleteMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existingUser = await UserModel.findById(id, req.tenantId);

      if (!existingUser) {
        throw new NotFoundError("User not found in this tenant");
      }

      // Ensure deleted_members lookup table exists (lazy init)
      await DeletedMemberModel.ensureTable();

      // Soft delete
      await UserModel.update(id, req.tenantId, { isActive: false });
      await pool.query(`
        INSERT INTO deleted_members (user_id, deleted_at, is_permanent)
        VALUES ($1, NOW(), false)
        ON CONFLICT (user_id) DO UPDATE SET is_permanent = false, deleted_at = NOW();
      `, [id]);
      const updatedUser = await UserModel.findById(id, req.tenantId);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.DELETE,
        actionLabel: `Member deactivated: ${updatedUser.name}`,
        entityType: EntityType.USER,
        entityId: id,
        entityLabel: updatedUser.name,
        beforeData: { isActive: existingUser.isActive },
        afterData: { isActive: false },
        changedFields: ["isActive"],
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: "Member deactivated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete member error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to deactivate member",
      } as ApiResponse);
    }
  }

  static async getDeletedMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
        return;
      }

      // Ensure deleted_members lookup table exists (lazy init)
      await DeletedMemberModel.ensureTable();
      const { search, page = 1, limit = 100, role, position, reportsTo } = req.query;

      const whereClauses: string[] = ['u.tenant_id = $1', 'u.is_active = false', 'u.id IN (SELECT user_id FROM deleted_members)'];
      const values: any[] = [req.tenantId];
      let paramCount = 1;

      if (search) {
        paramCount++;
        whereClauses.push(`(u.name ILIKE $${paramCount} OR u.work_email ILIKE $${paramCount})`);
        values.push(`%${search}%`);
      }

      if (role && role !== 'all') {
        paramCount++;
        whereClauses.push(`u.role = $${paramCount}`);
        values.push(role);
      }

      if (position && position !== 'all') {
        paramCount++;
        whereClauses.push(`(SELECT p.title FROM positions p WHERE p.id = u.position_id) = $${paramCount}`);
        values.push(position);
      }

      if (reportsTo && reportsTo !== 'all') {
        paramCount++;
        whereClauses.push(`u.reports_to_id = $${paramCount}`);
        values.push(reportsTo);
      }

      const skip = (Number(page) - 1) * Number(limit);
      paramCount++;
      const limitParam = paramCount;
      values.push(Number(limit));

      paramCount++;
      const offsetParam = paramCount;
      values.push(skip);

      const countValues = values.slice(0, values.length - 2);

      const query = `
        SELECT
          u.id,
          u.name,
          u.work_email AS "workEmail",
          u.work_email AS "email",
          u.personal_email AS "personalEmail",
          u.phone,
          u.role,
          u.avatar_url AS "avatarUrl",
          u.min_working_hours AS "minWorkingHours",
          u.is_active AS "isActive",
          (SELECT dm.deleted_at FROM deleted_members dm WHERE dm.user_id = u.id) as "deletedAt",
          (
            SELECT th.actor_name 
            FROM transaction_history th 
            WHERE th.entity_type = 'user' 
              AND th.entity_id = u.id 
              AND (th.action = 'delete' OR (th.action = 'update' AND 'isActive' = ANY(th.changed_fields)))
              AND th.tenant_id = u.tenant_id
            ORDER BY th.created_at DESC 
            LIMIT 1
          ) AS "deletedBy",
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
            FROM positions p WHERE p.id = u.position_id
          ) AS position,
          (
            SELECT json_build_object(
              'id', r.id, 
              'name', r.name,
              'avatarUrl', r.avatar_url,
              'position', (SELECT json_build_object('title', rp.title) FROM positions rp WHERE rp.id = r.position_id)
            )
            FROM users r
            WHERE r.id = u.reports_to_id
          ) as "reportsTo"
        FROM users u
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY u.updated_at DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      const countQuery = `
        SELECT COUNT(*)::integer AS count
        FROM users u
        WHERE ${whereClauses.join(' AND ')}
      `;

      const [result, countResult] = await Promise.all([
        pool.query(query, values),
        pool.query(countQuery, countValues),
      ]);

      const totalCount = countResult.rows[0]?.count ?? 0;
      const totalPages = Math.ceil(totalCount / Number(limit));

      res.status(200).json({
        success: true,
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Get deleted members error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch deleted members' } as ApiResponse);
    }
  }

  /**
   * Dynamically resolves all FK constraints referencing users(id),
   * nullifies nullable columns and deletes rows with non-nullable columns,
   * then physically deletes the user record(s).
   */
  private static async hardDeleteUsers(ids: string[], client: any): Promise<void> {
    // Find every FK column pointing to users.id using pg_catalog for high performance and clean identifier names
    const fkResult = await client.query(`
      SELECT
        rel.relname AS ref_table,
        a.attname AS ref_col,
        CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_attribute a 
        ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
      WHERE c.confrelid = 'users'::regclass 
        AND c.contype = 'f'
        AND rel.relname != 'deleted_members';
    `);

    for (const fk of fkResult.rows) {
      const { ref_table, ref_col, is_nullable } = fk;
      if (is_nullable === 'YES') {
        // Nullify the reference so the parent row survives
        await client.query(
          `UPDATE "${ref_table}" SET "${ref_col}" = NULL WHERE "${ref_col}" = ANY($1::text[])`,
          [ids]
        );
      } else {
        // Non-nullable — delete child rows entirely
        await client.query(
          `DELETE FROM "${ref_table}" WHERE "${ref_col}" = ANY($1::text[])`,
          [ids]
        );
      }
    }

    // Now physically delete users (deleted_members cascade-deletes automatically)
    await client.query(
      `DELETE FROM users WHERE id = ANY($1::text[])`,
      [ids]
    );
  }

  /**
   * Permanently delete a member from the database (irreversible).
   * Only works for members that have already been soft-deleted (is_active = false).
   */
  static async permanentlyDeleteMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context and authentication required' } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existingUser = await UserModel.findById(id, req.tenantId);

      if (!existingUser) {
        throw new NotFoundError('Member not found in this tenant');
      }

      if (existingUser.isActive) {
        res.status(400).json({
          success: false,
          error: 'Only inactive (soft-deleted) members can be permanently deleted. Please deactivate the member first.',
        } as ApiResponse);
        return;
      }

      // Hard delete inside a transaction — resolves all FK constraints dynamically
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await UserController.hardDeleteUsers([id], client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.DELETE,
        actionLabel: `Member permanently deleted: ${existingUser.name}`,
        entityType: EntityType.USER,
        entityId: id,
        entityLabel: existingUser.name,
        beforeData: { name: existingUser.name, workEmail: existingUser.workEmail },
        afterData: null,
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        message: 'Member permanently deleted',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Permanently delete member error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to permanently delete member' } as ApiResponse);
    }
  }

  /**
   * Bulk restore soft-deleted members (tenant-aware)
   */
  static async bulkRestoreMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        res.status(400).json({
          success: false,
          error: "Member IDs array required",
        } as ApiResponse);
        return;
      }

      await DeletedMemberModel.ensureTable();
      const count = await UserModel.bulkRestore(ids, req.tenantId);
      await pool.query(`
        DELETE FROM deleted_members
        WHERE user_id = ANY($1::text[]);
      `, [ids]);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.RESTORE,
        actionLabel: `Members restored: ${count}`,
        entityType: EntityType.USER,
        beforeData: { isActive: false },
        afterData: { isActive: true },
        changedFields: ["isActive"],
        statusCode: 200,
        metadata: { targetIds: ids, restoredCount: count },
      });

      res.status(200).json({
        success: true,
        message: `${count} members restored successfully`,
        data: { restoredCount: count },
      } as ApiResponse);
    } catch (error: any) {
      console.error("Bulk restore members error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to restore members",
      } as ApiResponse);
    }
  }

  /**
   * Bulk permanently delete members (tenant-aware)
   */
  static async bulkPermanentDeleteMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        res.status(400).json({
          success: false,
          error: "Member IDs array required",
        } as ApiResponse);
        return;
      }

      await DeletedMemberModel.ensureTable();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await UserController.hardDeleteUsers(ids, client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      const count = ids.length;

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.DELETE,
        actionLabel: `Members permanently deleted: ${count}`,
        entityType: EntityType.USER,
        statusCode: 200,
        metadata: { targetIds: ids, deletedCount: count },
      });

      res.status(200).json({
        success: true,
        message: `${count} members permanently deleted`,
        data: { deletedCount: count },
      } as ApiResponse);
    } catch (error: any) {
      console.error("Bulk permanent delete members error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to permanently delete members",
      } as ApiResponse);
    }
  }

  /**
   * Empty member trash (tenant-aware)
   */
  static async emptyTrashMembers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      await DeletedMemberModel.ensureTable();

      const client = await pool.connect();
      let count = 0;
      try {
        await client.query('BEGIN');
        // Fetch all inactive users for this tenant to hard delete them
        const inactiveUsersResult = await client.query(
          `SELECT id FROM users WHERE tenant_id = $1 AND is_active = false`,
          [req.tenantId]
        );
        const ids = inactiveUsersResult.rows.map((row: any) => row.id);
        count = ids.length;

        if (count > 0) {
          await UserController.hardDeleteUsers(ids, client);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.DELETE,
        actionLabel: `Member trash emptied: ${count}`,
        entityType: EntityType.USER,
        statusCode: 200,
        metadata: { deletedCount: count },
      });

      res.status(200).json({
        success: true,
        message: `Trash emptied: ${count} members permanently deleted`,
        data: { deletedCount: count },
      } as ApiResponse);
    } catch (error: any) {
      console.error("Empty member trash error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to empty trash",
      } as ApiResponse);
    }
  }

  /**
   * Activate member (tenant-aware)
   */
  static async activateMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existingUser = await UserModel.findById(id, req.tenantId);

      if (!existingUser) {
        throw new NotFoundError("User not found in this tenant");
      }

      await DeletedMemberModel.ensureTable();
      await UserModel.update(id, req.tenantId, { isActive: true });
      await pool.query(`
        DELETE FROM deleted_members WHERE user_id = $1;
      `, [id]);
      const updatedUser = await UserModel.findById(id, req.tenantId);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.RESTORE,
        actionLabel: `Member activated: ${updatedUser.name}`,
        entityType: EntityType.USER,
        entityId: id,
        entityLabel: updatedUser.name,
        beforeData: { isActive: existingUser.isActive },
        afterData: { isActive: true },
        changedFields: ["isActive"],
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: "Member activated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Activate member error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to activate member",
      } as ApiResponse);
    }
  }

  /**
   * Get user profile (current user - tenant-aware)
   */
  static async getUserProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;

      const user = await UserModel.findById(userId, req.tenantId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: user,
      } as ApiResponse);
    } catch (error) {
      console.error("Get user profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user profile",
      } as ApiResponse);
    }
  }

  /**
   * Update user profile (current user - tenant-aware)
   */
  static async updateUserProfile(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;
      const updateData = req.body;

      // Remove sensitive fields that shouldn't be updated via this endpoint
      delete updateData.passwordHash;
      delete updateData.role;
      delete updateData.isActive;
      delete updateData.tenantId;
      delete updateData.createdAt;

      // Convert dates if provided
      if (updateData.dateOfBirth)
        updateData.dateOfBirth = new Date(updateData.dateOfBirth);
      if (updateData.personalEmail)
        updateData.personalEmail = updateData.personalEmail.toLowerCase();
        
      if (updateData.phone !== undefined && updateData.phone !== null) {
        if (!/^[+0-9\s\-()]*$/.test(updateData.phone)) {
          res.status(400).json({
            success: false,
            error: "Invalid phone number format",
          } as ApiResponse);
          return;
        }
      }

      // Handle avatar upload if provided as base64
      if (updateData.avatarUrl && updateData.avatarUrl.startsWith('data:image')) {
        try {
          const uploadedUrl = await uploadImageToR2(updateData.avatarUrl, req.tenantId);
          updateData.avatarUrl = uploadedUrl;
        } catch (error: any) {
          console.error("Avatar upload error:", error);
          res.status(400).json({
            success: false,
            error: "Failed to upload avatar: " + error.message,
          } as ApiResponse);
          return;
        }
      }

      const existingUser = await UserModel.findById(userId, req.tenantId);
      await UserModel.update(userId, req.tenantId, updateData);
      const updatedUser = await UserModel.findById(userId, req.tenantId);

      recordTransaction({
        req,
        section: Section.HR,
        module: Module.MY_PROFILE,
        page: Page.MY_PROFILE,
        action: Action.UPDATE,
        actionLabel: "Updated profile details",
        entityType: EntityType.USER,
        entityId: userId,
        entityLabel: updatedUser?.name,
        beforeData: existingUser,
        afterData: updatedUser,
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: "Profile updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update user profile error:", error);

      if (error.code === "P2002") {
        // P2002 is a unique constraint violation — scoped to tenant by schema
        const target = error.meta?.target as string[] | undefined;
        let fieldMsg = "Email or phone";
        if (target?.includes("work_email")) fieldMsg = "Work email";
        else if (target?.includes("personal_email")) fieldMsg = "Personal email";
        else if (target?.includes("phone")) fieldMsg = "Phone number";
        res.status(409).json({
          success: false,
          error: `${fieldMsg} already exists in this organization`,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to update profile",
      } as ApiResponse);
    }
  }

  /**
   * Change password (current user - tenant-aware)
   */
  static async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;
      const {
        currentPassword,
        newPassword,
        confirmPassword,
      }: ChangePasswordData = req.body;

      // Validate input
      if (!currentPassword || !newPassword || !confirmPassword) {
        res.status(400).json({
          success: false,
          error: "All password fields are required",
        } as ApiResponse);
        return;
      }

      if (newPassword !== confirmPassword) {
        res.status(400).json({
          success: false,
          error: "New password and confirm password do not match",
        } as ApiResponse);
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({
          success: false,
          error: "New password must be at least 6 characters long",
        } as ApiResponse);
        return;
      }

      // Get user with password
      const user = await UserModel.findById(userId, req.tenantId);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );
      if (!isCurrentPasswordValid) {
        throw new ValidationError("Current password is incorrect");
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await UserModel.update(userId, req.tenantId, {
        passwordHash: newPasswordHash,
      });

      recordTransaction({
        req,
        section: Section.HR,
        module: Module.MY_PROFILE,
        page: Page.MY_PROFILE,
        action: Action.UPDATE,
        actionLabel: "Changed password",
        entityType: EntityType.USER,
        entityId: userId,
        entityLabel: req.user.name,
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        message: "Password changed successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Change password error:", error);

      if (error instanceof ValidationError || error instanceof NotFoundError) {
        res.status(error instanceof NotFoundError ? 404 : 400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to change password",
      } as ApiResponse);
    }
  }

  /**
   * Reset user password (admin only - tenant-aware)
   */
  static async resetUserPassword(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { userId } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        res.status(400).json({
          success: false,
          error: "New password must be at least 6 characters long",
        } as ApiResponse);
        return;
      }

      const user = await UserModel.findById(userId, req.tenantId);

      if (!user) {
        throw new NotFoundError("User not found in this tenant");
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await UserModel.update(userId, req.tenantId, {
        passwordHash: newPasswordHash,
      });

      res.status(200).json({
        success: true,
        message: "User password reset successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Reset user password error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to reset user password",
      } as ApiResponse);
    }
  }

  /**
   * Get members for dropdown/select (tenant-aware)
   */
  static async getMembersForSelect(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { role, position } = req.query;

      const whereClauses: string[] = ['u.tenant_id = $1', 'u.is_active = true', 'u.deleted_at IS NULL'];
      const values: any[] = [req.tenantId];
      let paramCount = 1;

      if (role) {
        paramCount++;
        if (typeof role === 'string' && role.includes(',')) {
          const rolesList = role.split(',');
          whereClauses.push(`u.role = ANY($${paramCount}::text[])`);
          values.push(rolesList);
        } else {
          whereClauses.push(`u.role = $${paramCount}`);
          values.push(role);
        }
      }

      if (position) {
        paramCount++;
        whereClauses.push(`EXISTS (
          SELECT 1 FROM positions p 
          WHERE p.id = u.position_id AND p.title = $${paramCount}
        )`);
        values.push(position);
      }

      const query = `
        SELECT 
          u.id,
          u.employee_id as "employeeId",
          u.name,
          u.work_email as "workEmail",
          u.role,
          u.avatar_url as "avatarUrl",
          u.min_working_hours as "minWorkingHours",
          (
            SELECT p.title 
            FROM positions p 
            WHERE p.id = u.position_id
          ) as "positionTitle"
        FROM users u
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY u.name ASC
      `;

      const result = await pool.query(query, values);
      const members: any[] = result.rows;

      const formattedMembers = members.map((member) => ({
        value: member.id,
        employeeId: member.employeeId,
        label: member.name,
        email: member.workEmail,
        position: member.positionTitle,
        role: member.role,
        avatarUrl: member.avatarUrl,
        minWorkingHours: member.minWorkingHours ?? 6,
      }));

      res.status(200).json({
        success: true,
        data: formattedMembers,
      } as ApiResponse);
    } catch (error) {
      console.error("Get members for select error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch members",
      } as ApiResponse);
    }
  }

  /**
   * Assign shift to member (tenant-aware) - MISSING FUNCTIONALITY RESTORED
   */
  static async assignShift(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { shiftId } = req.body;

      if (!shiftId) {
        res.status(400).json({
          success: false,
          error: "Shift ID is required",
        } as ApiResponse);
        return;
      }

      // Verify member exists and belongs to tenant
      const member = await UserModel.findById(id, req.tenantId);

      if (!member) {
        throw new NotFoundError("Member not found in this tenant");
      }

      // Verify shift exists and belongs to tenant
      const shift = await UserModel.findShiftById(shiftId, req.tenantId);

      if (!shift) {
        throw new ValidationError("Shift not found or inactive in this tenant");
      }

      // Update member with shift assignment
      await UserModel.update(id, req.tenantId, {
        assignedShiftId: shiftId,
        shiftAssignedById: req.user!.id,
        shiftAssignedDate: new Date(),
      });
      const updatedMember = await UserModel.findById(id, req.tenantId);

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.UPDATE,
        actionLabel: `Shift assigned to ${updatedMember.name}: ${shift.name}`,
        entityType: EntityType.USER,
        entityId: id,
        entityLabel: updatedMember.name,
        beforeData: { assignedShiftId: member.assignedShiftId },
        afterData: { assignedShiftId: shiftId, shiftName: shift.name },
        changedFields: ["assignedShiftId"],
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: updatedMember,
        message: "Shift assigned successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Assign shift error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to assign shift",
      } as ApiResponse);
    }
  }

  /**
   * Toggle a member's AI access (users.ai_enabled). Opt-out model — enabled
   * by default; admins disable it per user from the Members page.
   */
  static async setAiAccess(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: "enabled (boolean) is required",
        } as ApiResponse);
        return;
      }

      const member = await UserModel.findById(id, req.tenantId);
      if (!member) {
        throw new NotFoundError("Member not found in this tenant");
      }

      await pool.query(
        "UPDATE users SET ai_enabled = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
        [enabled, id, req.tenantId],
      );

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.MEMBERS,
        page: Page.MEMBER_LIST,
        action: Action.UPDATE,
        actionLabel: `AI access ${enabled ? "enabled" : "disabled"} for ${member.name}`,
        entityType: EntityType.USER,
        entityId: id,
        entityLabel: member.name,
        beforeData: { aiEnabled: (member as any).aiEnabled ?? null },
        afterData: { aiEnabled: enabled },
        changedFields: ["aiEnabled"],
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: { id, aiEnabled: enabled },
        message: `AI access ${enabled ? "enabled" : "disabled"}`,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Set AI access error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update AI access",
      } as ApiResponse);
    }
  }

  /**
   * Helper to resolve or create a custom position title using dedicated fallback default department, sub-department, and grade.
   */
  private static async getOrCreateCustomPosition(
    tenantId: string,
    userId: string,
    positionTitle: string
  ): Promise<string> {
    const title = positionTitle.trim();

    // Check if position already exists in tenant (case-insensitive title match)
    const existingPos = await UserModel.findPositionByTitle(title, tenantId);

    if (existingPos) {
      return existingPos.id;
    }

    // Find or create default "Uncategorized" department
    let defaultDept = await UserModel.findDepartmentByCode("DEPT-UNCATEGORIZED", tenantId);
    if (!defaultDept) {
      defaultDept = await UserModel.createDepartment({
        id: UserModel.generateUuid(),
        tenantId,
        code: "DEPT-UNCATEGORIZED",
        name: "Uncategorized",
        createdById: userId,
        isActive: true
      });
    }

    // Find or create default "General" sub-department under "Uncategorized" department
    let defaultSubDept = await UserModel.findSubDepartmentByCode("SUB-GENERAL", tenantId);
    if (!defaultSubDept) {
      defaultSubDept = await UserModel.createSubDepartment({
        id: UserModel.generateUuid(),
        tenantId,
        parentDepartmentId: defaultDept.id,
        code: "SUB-GENERAL",
        name: "General",
        createdById: userId,
        isActive: true
      });
    }

    // Find or create default "General" grade
    let defaultGrade = await UserModel.findGradeByCodes(["G", "GRADE-GENERAL"], tenantId);
    if (!defaultGrade) {
      defaultGrade = await UserModel.createGrade({
        id: UserModel.generateUuid(),
        tenantId,
        code: "G",
        name: "General",
        levelOrder: 999, // default lowest or general level
        createdById: userId,
        isActive: true
      });
    } else if (defaultGrade.code === "GRADE-GENERAL") {
      defaultGrade = await UserModel.updateGradeCode(defaultGrade.id, "G");
    }

    // Generate unique code for custom position
    const code = `POS-${title.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newPos = await UserModel.createPosition({
      id: UserModel.generateUuid(),
      tenantId,
      code,
      title,
      departmentId: defaultDept.id,
      subDepartmentId: defaultSubDept.id,
      gradeId: defaultGrade.id,
      createdById: userId,
      updatedById: userId,
      isActive: true
    });

    return newPos.id;
  }
}

export default UserController;
