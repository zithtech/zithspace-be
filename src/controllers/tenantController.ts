import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { tenantAwarePrisma } from "@/config/database";
import { JWTUtils } from "@/utils/jwt";
import TenantLogger from "@/utils/tenantLogger";
import pool from "@/config/dbpool";
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

      const rawClient = tenantAwarePrisma.getRawClient();

      // Check if subdomain is already taken
      TenantLogger.debug('Checking subdomain availability', {
        operation: 'TENANT_REGISTRATION',
        step: 'SUBDOMAIN_CHECK',
        metadata: { subdomain: tenantData.subdomain }
      });

      const existingTenant = await rawClient.tenant.findUnique({
        where: { subdomain: tenantData.subdomain.toLowerCase() },
      });

      if (existingTenant) {
        TenantLogger.warn('Subdomain already exists', {
          operation: 'TENANT_REGISTRATION',
          step: 'SUBDOMAIN_CONFLICT',
          metadata: { 
            subdomain: tenantData.subdomain,
            existingTenantId: existingTenant.id
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

      const result = await rawClient.$transaction(async (tx) => {
        // Create tenant
        const tenant = await tx.tenant.create({
          data: {
            name: tenantData.name,
            subdomain: tenantData.subdomain.toLowerCase(),
            planType: tenantData.planType || "basic",
            maxUsers: tenantData.maxUsers || 10,
            settings: tenantData.settings || {},
          },
        });

        TenantLogger.info('Tenant created successfully', {
          operation: 'TENANT_REGISTRATION',
          step: 'TENANT_CREATED',
          tenantId: tenant.id,
          metadata: {
            tenantId: tenant.id,
            subdomain: tenant.subdomain,
            planType: tenant.planType
          }
        });

        // Create admin user
        const adminUser = await tx.user.create({
          data: {
            tenant: {
              connect: { id: tenant.id }
            },
            name: tenantData.adminUser.name,
            workEmail: tenantData.adminUser.email.toLowerCase(),
            personalEmail: tenantData.adminUser.email.toLowerCase(),
            phone: tenantData.adminUser.phone,
            passwordHash,
            role: "admin",
            // Position will be assigned later after positions are set up
            workDays: [1, 2, 3, 4, 5], // Monday to Friday
          },
        });

        TenantLogger.info('Admin user created successfully', {
          operation: 'TENANT_REGISTRATION',
          step: 'ADMIN_USER_CREATED',
          tenantId: tenant.id,
          userId: adminUser.id,
          metadata: {
            tenantId: tenant.id,
            userId: adminUser.id,
            adminEmail: adminUser.workEmail
          }
        });

        return { tenant, adminUser };
      });

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
            planType: result.tenant.planType,
          },
          adminUser: {
            id: result.adminUser.id,
            name: result.adminUser.name,
            email: result.adminUser.workEmail,
          },
        },
        message: "Tenant registered successfully",
      } as ApiResponse);
    } catch (error: any) {
      TenantLogger.logTenantError(error, req, 'TENANT_REGISTRATION');
      timer.end('tenant_registration_failed');

      if (error.code === "P2002") {
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

      const rawClient = tenantAwarePrisma.getRawClient();
      const tenant = await rawClient.tenant.findUnique({
        where: { id: req.tenantId },
        include: {
          _count: {
            select: {
              users: { where: { isActive: true } },
              projects: true,
            },
          },
        },
      });

      if (!tenant) {
        throw new NotFoundError("Tenant not found");
      }

      res.status(200).json({
        success: true,
        data: {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          planType: tenant.planType,
          maxUsers: tenant.maxUsers,
          isActive: tenant.isActive,
          settings: tenant.settings,
          stats: {
            activeUsers: tenant._count.users,
            totalProjects: tenant._count.projects,
          },
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
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

      const rawClient = tenantAwarePrisma.getRawClient();
      const updateData = { ...req.body };

      // Handle logo uploads (original, cropped, or setting final)
      const currentTenant = await rawClient.tenant.findUnique({
        where: { id: req.tenantId },
        select: { name: true, settings: true }
      });
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

      const updatedTenant = await rawClient.tenant.update({
        where: { id: req.tenantId },
        data: updateData,
      });

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
          entityLabel: 'General Settings',
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
          planType: updatedTenant.planType,
          maxUsers: updatedTenant.maxUsers,
          isActive: updatedTenant.isActive,
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

      const rawClient = tenantAwarePrisma.getRawClient();
      const tenant = await rawClient.tenant.findUnique({
        where: { id: req.tenantId },
        select: { settings: true }
      });

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
      await rawClient.tenant.update({
        where: { id: req.tenantId },
        data: {
          settings: {
            ...settings,
            logoUrl: currentLogoUrl,
            logoVersions: logoVersions
          }
        }
      });

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

      const stats = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          const [
            totalUsers,
            activeUsers,
            totalProjects,
            activeProjects,
            totalTickets,
            openTickets,
          ] = await Promise.all([
            client.user.count({ where: { tenantId: req.tenantId } }),
            client.user.count({
              where: { tenantId: req.tenantId, isActive: true },
            }),
            client.project.count({ where: { tenantId: req.tenantId } }),
            client.project.count({
              where: { tenantId: req.tenantId, status: "active" },
            }),
            client.ticket.count({ where: { tenantId: req.tenantId } }),
            client.ticket.count({
              where: { tenantId: req.tenantId, status: "open" },
            }),
          ]);

          return {
            users: { total: totalUsers, active: activeUsers },
            projects: { total: totalProjects, active: activeProjects },
            tickets: { total: totalTickets, open: openTickets },
          };
        }
      );

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

      const rawClient = tenantAwarePrisma.getRawClient();
      const existingTenant = await rawClient.tenant.findUnique({
        where: { subdomain: subdomain.toLowerCase() },
      });

      res.status(200).json({
        success: true,
        data: {
          available: !existingTenant,
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

      const rawClient = tenantAwarePrisma.getRawClient();
      const updatedTenant = await rawClient.tenant.update({
        where: { id: tenantId },
        data: { isActive: false, updatedAt: new Date() },
      });

      res.status(200).json({
        success: true,
        data: {
          id: updatedTenant.id,
          name: updatedTenant.name,
          subdomain: updatedTenant.subdomain,
          isActive: updatedTenant.isActive,
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

      const rawClient = tenantAwarePrisma.getRawClient();
      const updatedTenant = await rawClient.tenant.update({
        where: { id: tenantId },
        data: { isActive: true, updatedAt: new Date() },
      });

      res.status(200).json({
        success: true,
        data: {
          id: updatedTenant.id,
          name: updatedTenant.name,
          subdomain: updatedTenant.subdomain,
          isActive: updatedTenant.isActive,
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
}

export default TenantController;
