import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { tenantAwarePrisma } from "@/config/database";
import { JWTUtils } from "@/utils/jwt";
import TenantLogger from "@/utils/tenantLogger";
import pool from "@/config/dbpool";
import { RBACService } from "@/modules/rbac/rbac.service";
import {
  AuthRequest,
  ApiResponse,
  ValidationError,
  NotFoundError,
  CreateTenantData,
  Tenant,
  AuthUser,
} from "@/types";
import { uploadImageToR2 } from "@/utils/r2Client";
import {
  recordTransaction,
  diffShallow,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from "@/utils/transactionHistory";

export class TenantController {
  /**
   * Register a new tenant with admin user (public endpoint)
   */
  static async register(req: AuthRequest, res: Response): Promise<void> {
    const timer = TenantLogger.startTimer();
    
    try {
      TenantLogger.logControllerOperation(req, 'tenant', 'register', {
        requestData: {
          name: req.body.name,
          subdomain: req.body.subdomain,
          planType: req.body.planType,
          hasAdminUser: !!req.body.adminUser
        }
      });

      const tenantData: CreateTenantData & {
        adminUser: {
          name: string;
          email: string;
          password: string;
          phone: string;
        };
      } = req.body;

      // Validate required fields
      if (!tenantData.name || !tenantData.subdomain || !tenantData.adminUser) {
        TenantLogger.warn('Tenant registration validation failed', {
          operation: 'TENANT_REGISTRATION',
          step: 'VALIDATION_ERROR',
          metadata: {
            hasName: !!tenantData.name,
            hasSubdomain: !!tenantData.subdomain,
            hasAdminUser: !!tenantData.adminUser
          }
        });

        res.status(400).json({
          success: false,
          error:
            "Tenant name, subdomain, and admin user information are required",
        } as ApiResponse);
        return;
      }

      TenantLogger.info('Starting tenant registration process', {
        operation: 'TENANT_REGISTRATION',
        step: 'VALIDATION_SUCCESS',
        metadata: {
          subdomain: tenantData.subdomain,
          planType: tenantData.planType || 'basic',
          adminEmail: tenantData.adminUser.email
        }
      });

      // Check if subdomain is already taken
      TenantLogger.debug('Checking subdomain availability', {
        operation: 'TENANT_REGISTRATION',
        step: 'SUBDOMAIN_CHECK',
        metadata: { subdomain: tenantData.subdomain }
      });

      const existingTenantResult = await pool.query(
        'SELECT id FROM tenants WHERE subdomain = $1 LIMIT 1',
        [tenantData.subdomain.toLowerCase()]
      );

      if (existingTenantResult.rows.length > 0) {
        TenantLogger.warn('Subdomain already exists', {
          operation: 'TENANT_REGISTRATION',
          step: 'SUBDOMAIN_CONFLICT',
          metadata: { 
            subdomain: tenantData.subdomain,
            existingTenantId: existingTenantResult.rows[0].id
          }
        });

        res.status(409).json({
          success: false,
          error: "Subdomain is already taken",
        } as ApiResponse);
        return;
      }

      // Validate subdomain format
      const subdomainRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
      if (
        !subdomainRegex.test(tenantData.subdomain) ||
        tenantData.subdomain.length < 3
      ) {
        TenantLogger.warn('Invalid subdomain format', {
          operation: 'TENANT_REGISTRATION',
          step: 'SUBDOMAIN_FORMAT_ERROR',
          metadata: { 
            subdomain: tenantData.subdomain,
            length: tenantData.subdomain.length
          }
        });

        res.status(400).json({
          success: false,
          error:
            "Invalid subdomain format. Must be lowercase, alphanumeric with hyphens, minimum 3 characters",
        } as ApiResponse);
        return;
      }

      // Hash admin password
      TenantLogger.debug('Hashing admin password', {
        operation: 'TENANT_REGISTRATION',
        step: 'PASSWORD_HASH',
        metadata: { adminEmail: tenantData.adminUser.email }
      });

      const passwordHash = await bcrypt.hash(tenantData.adminUser.password, 12);

      // Create tenant and admin user in transaction
      TenantLogger.info('Creating tenant and admin user', {
        operation: 'TENANT_REGISTRATION',
        step: 'DATABASE_TRANSACTION_START',
        metadata: {
          subdomain: tenantData.subdomain,
          adminEmail: tenantData.adminUser.email
        }
      });

      const client = await pool.connect();
      let result;
      try {
        await client.query('BEGIN');

        const crypto = require('crypto');
        const tenantId = crypto.randomUUID();
        const secretKey = `${crypto.randomInt(10000, 100000)}/secretkey/${tenantData.subdomain.toLowerCase()}`;

        const tenantInsertResult = await client.query(`
          INSERT INTO tenants (id, name, subdomain, plan_type, max_users, settings, web_inquiry_secret_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, name, subdomain, plan_type
        `, [
          tenantId,
          tenantData.name,
          tenantData.subdomain.toLowerCase(),
          tenantData.planType || 'basic',
          tenantData.maxUsers || 10,
          tenantData.settings || {},
          secretKey
        ]);

        const tenant = tenantInsertResult.rows[0];

        TenantLogger.info('Tenant created successfully', {
          operation: 'TENANT_REGISTRATION',
          step: 'TENANT_CREATED',
          tenantId: tenant.id,
          metadata: {
            tenantId: tenant.id,
            subdomain: tenant.subdomain,
            planType: tenant.plan_type
          }
        });

        const userId = crypto.randomUUID();
        const userInsertResult = await client.query(`
          INSERT INTO users (id, tenant_id, name, work_email, personal_email, phone, password_hash, role, work_days)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, name, work_email
        `, [
          userId,
          tenant.id,
          tenantData.adminUser.name,
          tenantData.adminUser.email.toLowerCase(),
          tenantData.adminUser.email.toLowerCase(),
          tenantData.adminUser.phone,
          passwordHash,
          'super_admin',
          [1, 2, 3, 4, 5]
        ]);

        const adminUser = userInsertResult.rows[0];

        TenantLogger.info('Admin user created successfully', {
          operation: 'TENANT_REGISTRATION',
          step: 'ADMIN_USER_CREATED',
          tenantId: tenant.id,
          userId: adminUser.id,
          metadata: {
            tenantId: tenant.id,
            userId: adminUser.id,
            adminEmail: adminUser.work_email
          }
        });

        await client.query('COMMIT');
        
        // Setup default roles for the new tenant
        await RBACService.setupDefaultRolesForTenant(tenant.id);

        result = { tenant, adminUser };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      TenantLogger.info('Tenant registration completed successfully', {
        operation: 'TENANT_REGISTRATION',
        step: 'REGISTRATION_SUCCESS',
        tenantId: result.tenant.id,
        userId: result.adminUser.id,
        metadata: {
          tenantId: result.tenant.id,
          subdomain: result.tenant.subdomain,
          adminUserId: result.adminUser.id
        }
      });

      timer.end('tenant_registration', { 
        tenantId: result.tenant.id,
        metadata: { subdomain: result.tenant.subdomain }
      });

      res.status(201).json({
        success: true,
        data: {
          tenant: {
            id: result.tenant.id,
            name: result.tenant.name,
            subdomain: result.tenant.subdomain,
            planType: result.tenant.plan_type,
          },
          adminUser: {
            id: result.adminUser.id,
            name: result.adminUser.name,
            email: result.adminUser.work_email,
          },
        },
        message: "Tenant registered successfully",
      } as ApiResponse);
    } catch (error: any) {
      TenantLogger.logTenantError(error, req, 'TENANT_REGISTRATION');
      timer.end('tenant_registration_failed');

      if (error.code === "23505") { // Postgres unique violation error code
        res.status(409).json({
          success: false,
          error: "Subdomain or email already exists",
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to register tenant",
      } as ApiResponse);
    }
  }

  /**
   * Resolve tenant by subdomain (public endpoint for frontend)
   */
  static async resolve(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { subdomain } = req.query;

      if (!subdomain || typeof subdomain !== "string") {
        res.status(400).json({
          success: false,
          error: "Subdomain parameter is required",
        } as ApiResponse);
        return;
      }

      const result = await pool.query(
        `SELECT id, name, subdomain, plan_type, is_active, is_setup_complete
         FROM tenants
         WHERE subdomain = $1 AND is_active = true
         LIMIT 1`,
        [subdomain.toLowerCase()]
      );

      const tenant = result.rows[0];
      if (!tenant) {
        res.status(404).json({
          success: false,
          error: "Tenant not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          tenantId: tenant.id,
          tenantInfo: {
            name: tenant.name,
            subdomain: tenant.subdomain,
            planType: tenant.plan_type,
            isActive: tenant.is_active,
            isSetupComplete: tenant.is_setup_complete,
          },
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Tenant resolution error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to resolve tenant",
      } as ApiResponse);
    }
  }

  static async completeSetup(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
        return;
      }

      if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        res.status(403).json({ success: false, error: "Admin access required" } as ApiResponse);
        return;
      }

      const { workspaceName } = req.body;
      if (!workspaceName?.trim() || workspaceName.trim().length < 2) {
        res.status(400).json({ success: false, error: "Workspace name must be at least 2 characters" } as ApiResponse);
        return;
      }

      const newSubdomain = workspaceName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      if (newSubdomain.length < 2) {
        res.status(400).json({ success: false, error: "Workspace name produces an invalid subdomain" } as ApiResponse);
        return;
      }

      // Check uniqueness — allow the current tenant to keep its own subdomain
      const conflict = await pool.query(
        "SELECT id FROM tenants WHERE subdomain = $1 AND id != $2 LIMIT 1",
        [newSubdomain, req.tenantId]
      );

      if (conflict.rows.length > 0) {
        res.status(409).json({ success: false, error: "This workspace name is already taken. Please choose another." } as ApiResponse);
        return;
      }

      const updated = await pool.query(
        `UPDATE tenants
         SET name = $1, subdomain = $2, is_setup_complete = true, updated_at = now()
         WHERE id = $3
         RETURNING id, name, subdomain`,
        [workspaceName.trim(), newSubdomain, req.tenantId]
      );

      res.status(200).json({
        success: true,
        data: {
          name: updated.rows[0].name,
          subdomain: updated.rows[0].subdomain,
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Complete setup error:", error);
      res.status(500).json({ success: false, error: "Something went wrong. Please try again." } as ApiResponse);
    }
  }

  /**
   * Get current tenant profile (tenant-aware)
   */
  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.tenant) {
        res.status(400).json({
          success: false,
          error: "Tenant context is required",
        } as ApiResponse);
        return;
      }

      const tenantResult = await pool.query(`
        SELECT t.*,
          (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id = t.id AND u.is_active = true) as active_users,
          (SELECT COUNT(*)::int FROM projects p WHERE p.tenant_id = t.id) as total_projects
        FROM tenants t
        WHERE t.id = $1
      `, [req.tenantId]);

      if (tenantResult.rows.length === 0) {
        throw new NotFoundError("Tenant not found");
      }

      const tenant = tenantResult.rows[0];

      res.status(200).json({
        success: true,
        data: {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          planType: tenant.plan_type,
          maxUsers: tenant.max_users,
          isActive: tenant.is_active,
          settings: tenant.settings,
          stats: {
            activeUsers: tenant.active_users,
            totalProjects: tenant.total_projects,
          },
          createdAt: tenant.created_at,
          updatedAt: tenant.updated_at,
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get tenant profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get tenant profile",
      } as ApiResponse);
    }
  }

  /**
   * Update tenant profile (admin only)
   */
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      // Check if user is admin
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        res.status(403).json({
          success: false,
          error: "admin access required",
        } as ApiResponse);
        return;
      }

      const updateData = { ...req.body };

      // Handle logo uploads (original, cropped, or setting final)
      const currentTenantResult = await pool.query(
        'SELECT name, settings FROM tenants WHERE id = $1',
        [req.tenantId]
      );
      const currentTenant = currentTenantResult.rows[0];
      const currentSettings = (currentTenant?.settings as any) || {};
      const logoVersions = Array.isArray(currentSettings.logoVersions) ? [...currentSettings.logoVersions] : [];
      let newLogoUrl = currentSettings.logoUrl;

      // 1. Handle Original Logo Upload
      if (updateData.logo && typeof updateData.logo === 'string' && updateData.logo.startsWith('data:image')) {
        try {
          const logoUrl = await uploadImageToR2(updateData.logo, req.tenantId!);
          newLogoUrl = logoUrl;
          if (!logoVersions.includes(logoUrl)) {
            logoVersions.push(logoUrl);
          }
          delete updateData.logo;
        } catch (uploadError) {
          console.error("Original logo upload failed:", uploadError);
          res.status(500).json({ success: false, error: "Failed to upload company logo" } as ApiResponse);
          return;
        }
      }

      // 2. Handle Cropped Logo Upload
      if (updateData.croppedLogo && typeof updateData.croppedLogo === 'string' && updateData.croppedLogo.startsWith('data:image')) {
        try {
          const croppedUrl = await uploadImageToR2(updateData.croppedLogo, req.tenantId!);
          newLogoUrl = croppedUrl;
          if (!logoVersions.includes(croppedUrl)) {
            logoVersions.push(croppedUrl);
          }
          delete updateData.croppedLogo;
        } catch (uploadError) {
          console.error("Cropped logo upload failed:", uploadError);
          res.status(500).json({ success: false, error: "Failed to upload cropped logo" } as ApiResponse);
          return;
        }
      }

      // 3. Handle Setting Final Logo from existing versions
      if (updateData.finalLogoUrl && typeof updateData.finalLogoUrl === 'string') {
        newLogoUrl = updateData.finalLogoUrl;
        delete updateData.finalLogoUrl;
      }

      // Update settings with new logo state
      updateData.settings = {
        ...currentSettings,
        logoUrl: newLogoUrl,
        logoVersions: logoVersions
      };

      // Remove sensitive fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.subdomain; // Subdomain changes require special handling
      delete updateData.createdAt;
      delete updateData.updatedAt;

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const [key, value] of Object.entries(updateData)) {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        setClauses.push(`${dbKey} = $${paramIdx}`);
        values.push(value);
        paramIdx++;
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(req.tenantId);
      const tenantIdIdx = paramIdx;

      let updatedTenant: any;
      if (setClauses.length > 1) { // more than just updated_at
        const updatedTenantResult = await pool.query(
          `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${tenantIdIdx} RETURNING *`,
          values
        );
        updatedTenant = updatedTenantResult.rows[0];
      } else {
        const updatedTenantResult = await pool.query(
          `SELECT * FROM tenants WHERE id = $1`,
          [req.tenantId]
        );
        updatedTenant = updatedTenantResult.rows[0];
      }

      // Log General Settings transaction if changed
      const beforeSnap = {
        name: currentTenant?.name,
        settings: currentSettings,
      };
      const afterSnap = {
        name: updatedTenant.name,
        settings: updatedTenant.settings,
      };
      const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

      if (changedFields.length > 0) {
        recordTransaction({
          req,
          section: Section.ADMIN,
          module: Module.GENERAL_SETTINGS,
          page: Page.GENERAL_SETTINGS_VIEW,
          action: Action.UPDATE,
          actionLabel: `Tenant settings updated (${changedFields.join(', ')})`,
          entityType: EntityType.TENANT_SETTINGS,
          entityId: req.tenantId,
          entityLabel: 'System Settings',
          beforeData: before,
          afterData: after,
          changedFields,
          statusCode: 200
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: updatedTenant.id,
          name: updatedTenant.name,
          subdomain: updatedTenant.subdomain,
          planType: updatedTenant.plan_type,
          maxUsers: updatedTenant.max_users,
          isActive: updatedTenant.is_active,
          settings: updatedTenant.settings,
        },
        message: "Tenant profile updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Update tenant profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update tenant profile",
      } as ApiResponse);
    }
  }

  static async deleteLogoVersion(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context required" } as ApiResponse);
        return;
      }

      const { url } = req.body;
      if (!url) {
        res.status(400).json({ success: false, error: "Logo URL is required" } as ApiResponse);
        return;
      }

      const tenantResult = await pool.query(
        'SELECT settings FROM tenants WHERE id = $1',
        [req.tenantId]
      );
      const tenant = tenantResult.rows[0];

      if (!tenant) {
        res.status(404).json({ success: false, error: "Tenant not found" } as ApiResponse);
        return;
      }

      const settings = (tenant.settings as any) || {};
      let logoVersions = Array.isArray(settings.logoVersions) ? [...settings.logoVersions] : [];
      let currentLogoUrl = settings.logoUrl;

      // Filter out the URL
      logoVersions = logoVersions.filter(v => v !== url);

      // If deleted logo was the final one, switch to the next available or null
      if (currentLogoUrl === url) {
        currentLogoUrl = logoVersions.length > 0 ? logoVersions[0] : null;
      }

      // Update tenant settings
      await pool.query(
        'UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2',
        [{
          ...settings,
          logoUrl: currentLogoUrl,
          logoVersions: logoVersions
        }, req.tenantId]
      );

      res.status(200).json({
        success: true,
        message: "Logo version deleted successfully",
        data: { logoUrl: currentLogoUrl, logoVersions: logoVersions }
      } as ApiResponse);
    } catch (error) {
      console.error("Delete logo version error:", error);
      res.status(500).json({ success: false, error: "Failed to delete logo version" } as ApiResponse);
    }
  }

  /**
   * Get tenant statistics (admin only)
   */
  static async getStatistics(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const statsResult = await pool.query(`
        SELECT 
          (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1) as total_users,
          (SELECT COUNT(*)::int FROM users WHERE tenant_id = $1 AND is_active = true) as active_users,
          (SELECT COUNT(*)::int FROM projects WHERE tenant_id = $1) as total_projects,
          (SELECT COUNT(*)::int FROM projects WHERE tenant_id = $1 AND status = 'active') as active_projects,
          (SELECT COUNT(*)::int FROM tickets WHERE tenant_id = $1) as total_tickets,
          (SELECT COUNT(*)::int FROM tickets WHERE tenant_id = $1 AND status = 'open') as open_tickets
      `, [req.tenantId]);
      
      const statsRow = statsResult.rows[0];
      const stats = {
        users: { total: statsRow.total_users, active: statsRow.active_users },
        projects: { total: statsRow.total_projects, active: statsRow.active_projects },
        tickets: { total: statsRow.total_tickets, open: statsRow.open_tickets },
      };

      res.status(200).json({
        success: true,
        data: stats,
      } as ApiResponse);
    } catch (error) {
      console.error("Get tenant statistics error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get tenant statistics",
      } as ApiResponse);
    }
  }

  /**
   * Check subdomain availability (public endpoint)
   */
  static async checkSubdomainAvailability(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const { subdomain } = req.query;

      if (!subdomain || typeof subdomain !== "string") {
        res.status(400).json({
          success: false,
          error: "Subdomain parameter is required",
        } as ApiResponse);
        return;
      }

      // Validate subdomain format
      const subdomainRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
      if (!subdomainRegex.test(subdomain) || subdomain.length < 3) {
        res.status(400).json({
          success: false,
          error: "Invalid subdomain format",
          data: { available: false, reason: "Invalid format" },
        } as ApiResponse);
        return;
      }

      // Check reserved subdomains
      const reservedSubdomains = [
        "www",
        "api",
        "admin",
        "app",
        "mail",
        "ftp",
        "cdn",
      ];
      if (reservedSubdomains.includes(subdomain.toLowerCase())) {
        res.status(400).json({
          success: false,
          error: "Subdomain is reserved",
          data: { available: false, reason: "Reserved subdomain" },
        } as ApiResponse);
        return;
      }

      const existingTenantResult = await pool.query(
        'SELECT 1 FROM tenants WHERE subdomain = $1 LIMIT 1',
        [subdomain.toLowerCase()]
      );

      res.status(200).json({
        success: true,
        data: {
          available: existingTenantResult.rows.length === 0,
          subdomain: subdomain.toLowerCase(),
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Check subdomain availability error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check subdomain availability",
      } as ApiResponse);
    }
  }

  /**
   * Deactivate tenant (super_admin only)
   */
  static async deactivate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== "super_admin") {
        res.status(403).json({
          success: false,
          error: "super_admin access required",
        } as ApiResponse);
        return;
      }

      const { tenantId } = req.params;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant ID is required",
        } as ApiResponse);
        return;
      }

      const updatedTenantResult = await pool.query(
        'UPDATE tenants SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name, subdomain, is_active',
        [tenantId]
      );
      const updatedTenant = updatedTenantResult.rows[0];

      res.status(200).json({
        success: true,
        data: {
          id: updatedTenant.id,
          name: updatedTenant.name,
          subdomain: updatedTenant.subdomain,
          isActive: updatedTenant.is_active,
        },
        message: "Tenant deactivated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Deactivate tenant error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to deactivate tenant",
      } as ApiResponse);
    }
  }

  /**
   * Activate tenant (super_admin only)
   */
  static async activate(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== "super_admin") {
        res.status(403).json({
          success: false,
          error: "super_admin access required",
        } as ApiResponse);
        return;
      }

      const { tenantId } = req.params;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant ID is required",
        } as ApiResponse);
        return;
      }

      const updatedTenantResult = await pool.query(
        'UPDATE tenants SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id, name, subdomain, is_active',
        [tenantId]
      );
      const updatedTenant = updatedTenantResult.rows[0];

      res.status(200).json({
        success: true,
        data: {
          id: updatedTenant.id,
          name: updatedTenant.name,
          subdomain: updatedTenant.subdomain,
          isActive: updatedTenant.is_active,
        },
        message: "Tenant activated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Activate tenant error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to activate tenant",
      } as ApiResponse);
    }
  }

  /**
   * Get all tenants with their web inquiry secret keys
   * Requires super_admin access
   */
  static async getAllTenants(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantsResult = await pool.query(
        'SELECT id, name, subdomain, web_inquiry_secret_key, plan_type, is_active, created_at FROM tenants ORDER BY created_at DESC'
      );

      res.status(200).json({
        success: true,
        data: tenantsResult.rows,
      });
    } catch (error) {
      console.error("Get all tenants error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch tenants",
      } as ApiResponse);
    }
  }

  /**
   * Generate missing secret keys for all tenants
   * Requires super_admin access
   */
  static async generateMissingSecretKeys(req: AuthRequest, res: Response): Promise<void> {
    try {
      const crypto = require('crypto');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Find tenants without a secret key
        const missingKeysResult = await client.query(
          "SELECT id, subdomain FROM tenants WHERE web_inquiry_secret_key IS NULL OR web_inquiry_secret_key = ''"
        );
        
        let generatedCount = 0;
        
        for (const tenant of missingKeysResult.rows) {
          const secretKey = `${crypto.randomInt(10000, 100000)}/secretkey/${tenant.subdomain}`;
          await client.query(
            "UPDATE tenants SET web_inquiry_secret_key = $1, updated_at = NOW() WHERE id = $2",
            [secretKey, tenant.id]
          );
          generatedCount++;
        }
        
        await client.query('COMMIT');
        
        res.status(200).json({
          success: true,
          message: `Generated secret keys for ${generatedCount} tenants`,
          data: { generatedCount }
        });
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Generate missing secret keys error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate missing secret keys",
      } as ApiResponse);
    }
  }

  /**
   * Generate secret key for a specific tenant
   * Requires super_admin access
   */
  static async generateSecretKey(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { tenantId } = req.params;
      
      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant ID is required",
        } as ApiResponse);
        return;
      }
      
      const tenantResult = await pool.query("SELECT subdomain FROM tenants WHERE id = $1", [tenantId]);
      if (tenantResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Tenant not found",
        } as ApiResponse);
        return;
      }
      
      const crypto = require('crypto');
      const subdomain = tenantResult.rows[0].subdomain;
      const secretKey = `${crypto.randomInt(10000, 100000)}/secretkey/${subdomain}`;
      
      const updateResult = await pool.query(
        "UPDATE tenants SET web_inquiry_secret_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, subdomain, web_inquiry_secret_key",
        [secretKey, tenantId]
      );
      
      res.status(200).json({
        success: true,
        message: "Secret key generated successfully",
        data: updateResult.rows[0]
      });
    } catch (error) {
      console.error("Generate secret key error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate secret key",
      } as ApiResponse);
    }
  }

  /**
   * Get the current Chrome Extension install key for the active tenant (admin only).
   * The key lives in tenants.settings.extensionInstallKey (JSONB). Returns null
   * when none has been generated yet.
   */
  static async getExtensionInstallKey(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || req.tenantId;
      if (!tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is required" } as ApiResponse);
        return;
      }

      const result = await pool.query(
        "SELECT settings->>'extensionInstallKey' AS key FROM tenants WHERE id = $1",
        [tenantId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: "Tenant not found" } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: { installKey: result.rows[0].key || null },
      });
    } catch (error) {
      console.error("Get extension install key error:", error);
      res.status(500).json({ success: false, error: "Failed to get install key" } as ApiResponse);
    }
  }

  /**
   * Generate (or rotate) the Chrome Extension install key for the active tenant
   * (admin only). Distribute the returned key to that tenant's users; rotating
   * invalidates the previous key. Tenant is derived from the authenticated JWT.
   */
  static async generateExtensionInstallKey(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId || req.tenantId;
      if (!tenantId) {
        res.status(400).json({ success: false, error: "Tenant context is required" } as ApiResponse);
        return;
      }

      const tenantResult = await pool.query("SELECT subdomain FROM tenants WHERE id = $1", [tenantId]);
      if (tenantResult.rows.length === 0) {
        res.status(404).json({ success: false, error: "Tenant not found" } as ApiResponse);
        return;
      }

      const crypto = require("crypto");
      const subdomain = tenantResult.rows[0].subdomain;
      const installKey = `zk_${subdomain}_${crypto.randomBytes(18).toString("hex")}`;

      // Merge into the settings JSONB without clobbering other keys.
      await pool.query(
        `UPDATE tenants
           SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{extensionInstallKey}', to_jsonb($1::text)),
               updated_at = NOW()
         WHERE id = $2`,
        [installKey, tenantId]
      );

      res.status(200).json({
        success: true,
        message: "Install key generated successfully",
        data: { installKey },
      });
    } catch (error) {
      console.error("Generate extension install key error:", error);
      res.status(500).json({ success: false, error: "Failed to generate install key" } as ApiResponse);
    }
  }
}

export default TenantController;
