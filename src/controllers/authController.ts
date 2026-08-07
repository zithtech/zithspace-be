import { Response } from "express";
import bcrypt from "bcryptjs";
import axios from "axios";
import { tenantAwarePrisma, prisma } from "@/config/database";
import crypto from "crypto";
import { EmailService } from "@/utils/emailService";
import { JWTUtils } from "@/utils/jwt";
import {
  AuthRequest,
  LoginCredentials,
  LoginResponse,
  ApiResponse,
  AuthenticationError,
  NotFoundError,
  CreateUserData,
} from "@/types";
import { RBACService } from "@/modules/rbac/rbac.service";
import { recordTransaction, Section, Module, Page, Action, EntityType } from "../utils/transactionHistory";

import { Request } from "express";

export class AuthController {
  /**
   * Global login for Chrome Extension
   */
  static async extensionLogin(req: Request, res: Response): Promise<void> {
    console.log("extensionLogin hit:", req.body);
    try {
      const { email, password, tenantSlug } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: "Email and password are required",
        } as ApiResponse);
        return;
      }

      // When the extension install is bound to a workspace, scope the lookup to
      // that tenant. This enforces the pre-bound model and prevents a user whose
      // email exists in multiple tenants from being resolved to the wrong one.
      let boundTenantId: string | undefined;
      if (tenantSlug) {
        const boundTenant = await prisma.tenant.findFirst({
          where: {
            OR: [
              { subdomain: String(tenantSlug).toLowerCase() },
              { id: String(tenantSlug) },
            ],
            isActive: true,
          },
          select: { id: true },
        });

        if (!boundTenant) {
          res.status(404).json({
            success: false,
            error: "Workspace not found or inactive",
          } as ApiResponse);
          return;
        }

        boundTenantId = boundTenant.id;
      }

      // Search for the user, scoped to the bound tenant when provided.
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { workEmail: email.toLowerCase() },
            { personalEmail: email.toLowerCase() },
          ],
          isActive: true,
          ...(boundTenantId ? { tenantId: boundTenantId } : {}),
        },
        include: {
          tenant: true,
          employee: true,
          position: {
            select: {
              id: true,
              title: true,
              code: true,
            },
          },
        },
      });

      if (!user || !user.tenant.isActive) {
        res.status(401).json({
          success: false,
          error: "Invalid credentials",
        } as ApiResponse);
        return;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          error: "Invalid credentials",
        } as ApiResponse);
        return;
      }

      // Create auth user object for token generation
      const authUser = {
        id: user.id,
        tenantId: user.tenantId,
        email: user.workEmail,
        role: user.role as any,
        position: user.position?.title || null,
        name: user.name,
      };

      // Generate tokens
      const { accessToken, refreshToken } = JWTUtils.generateTokenPair(authUser);

      // Prepare user data for response
      const { passwordHash: _, ...userWithoutPassword } = user;
      
      const userData = {
        ...userWithoutPassword,
        tenantSlug: user.tenant.subdomain || 'zithmi' // In Zukvov2 it's subdomain
      };

      res.status(200).json({
        success: true,
        accessToken,
        refreshToken,
        user: userData,
      });
    } catch (error) {
      console.error("Extension login error:", error);
      res.status(500).json({
        success: false,
        error: "An unexpected error occurred during login",
      } as ApiResponse);
    }
  }

  /**
   * Resolve a workspace by slug for the Chrome Extension activation screen.
   * Public (no auth): only exposes whether the workspace exists + its display
   * name, so the extension can bind an install to a tenant before login.
   */
  static async resolveWorkspace(req: Request, res: Response): Promise<void> {
    try {
      const slug = (req.query.slug as string) || "";
      if (!slug) {
        res.status(400).json({
          success: false,
          error: "Workspace slug is required",
        } as ApiResponse);
        return;
      }

      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [{ subdomain: slug.toLowerCase() }, { id: slug }],
          isActive: true,
        },
        select: { id: true, name: true, subdomain: true },
      });

      if (!tenant) {
        res.status(404).json({
          success: false,
          error: "Workspace not found or inactive",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        tenant: {
          name: tenant.name,
          slug: tenant.subdomain,
        },
      });
    } catch (error) {
      console.error("Resolve workspace error:", error);
      res.status(500).json({
        success: false,
        error: "An unexpected error occurred",
      } as ApiResponse);
    }
  }

  /**
   * Redeem a one-time install key for the Chrome Extension activation screen.
   * Unlike /resolve-tenant (which takes a public slug), the install key is a
   * high-entropy secret provisioned per tenant — so this endpoint is not an
   * existence oracle for workspace names. Returns the bound workspace on match.
   */
  static async redeemInstallKey(req: Request, res: Response): Promise<void> {
    try {
      const key = (req.body?.key as string) || "";
      if (!key || key.trim().length < 8) {
        res.status(400).json({
          success: false,
          error: "A valid install key is required",
        } as ApiResponse);
        return;
      }

      const tenant = await prisma.tenant.findFirst({
        where: {
          isActive: true,
          settings: { path: ["extensionInstallKey"], equals: key.trim() },
        },
        select: { id: true, name: true, subdomain: true },
      });

      if (!tenant) {
        // Generic message — never reveal whether a key "almost" matched.
        res.status(404).json({
          success: false,
          error: "Invalid or expired install key",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        tenant: {
          name: tenant.name,
          slug: tenant.subdomain,
        },
      });
    } catch (error) {
      console.error("Redeem install key error:", error);
      res.status(500).json({
        success: false,
        error: "An unexpected error occurred",
      } as ApiResponse);
    }
  }

  /**
   * User login with tenant context
   */
  static async login(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, password } = req.body as LoginCredentials;

      // Validate input
      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: "Email and password are required",
        } as ApiResponse);
        return;
      }

      // Ensure we have tenant context for login
      if (!req.tenantId || !req.tenant) {
        res.status(400).json({
          success: false,
          error: "Tenant context is required for login",
        } as ApiResponse);
        return;
      }

      // Find user by email within the tenant
      const user = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          return await client.user.findFirst({
            where: {
              OR: [
                { workEmail: email.toLowerCase() },
                { personalEmail: email.toLowerCase() },
              ],
              tenantId: req.tenantId,
            },
            include: {
              tenant: true,
              employee: true,
              position: {
                select: {
                  id: true,
                  title: true,
                  code: true,
                },
              },
            },
          });
        },
      );

      if (!user) {
        res.status(401).json({
          success: false,
          error: "Invalid credentials",
        } as ApiResponse);
        return;
      }

      // Check if user is active
      if (!user.isActive) {
        res.status(403).json({
          success: false,
          error: "Your account is deactivated. Please contact your administrator.",
        } as ApiResponse);
        return;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      // const isPasswordValid = true
      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          error: "Invalid credentials",
        } as ApiResponse);
        return;
      }

      // Check if tenant is active
      if (!user.tenant.isActive) {
        res.status(403).json({
          success: false,
          error: "Account suspended",
        } as ApiResponse);
        return;
      }

      // Create auth user object for token generation
      const authUser = {
        id: user.id,
        tenantId: user.tenantId,
        email: user.workEmail,
        role: user.role as any,
        position: user.position?.title || null,
        name: user.name,
      };

      // Generate token pair
      const { accessToken, refreshToken } =
        JWTUtils.generateTokenPair(authUser);

      // Store refresh token in database
      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        await client.refreshToken.create({
          data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });
      });

      // Set refresh token cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/", // Ensure cookie is available for all paths
      });

      // Load permissions
      const permSet = await RBACService.getUserPermissions(
        user.id,
        user.tenantId,
        user.role
      );

      // Return user data and access token
      const loginResponse: LoginResponse = {
        success: true,
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.workEmail,
          workEmail: user.workEmail,
          personalEmail: user.personalEmail,
          role: user.role as any,
          position: user.position ? { id: user.position.id, title: user.position.title } : null as any,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          tenantLogo: (user.tenant.settings as any)?.logoUrl || null,
          avatarUrl: user.avatarUrl,
          isActive: user.isActive,
          permissions: Array.from(permSet),
        },
        message: "Login successful",
      };

      // Populate req.user temporarily for transaction history logging
      req.user = {
        id: user.id,
        email: user.workEmail,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role as any,
        position: user.position?.title || null,
      };

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.AUTH,
        page: Page.LOGIN,
        action: Action.LOGIN,
        actionLabel: `User ${user.name || user.workEmail} logged in`,
        entityType: EntityType.SESSION,
        entityId: user.id,
        entityLabel: user.workEmail,
        metadata: {
          ip: req.ip ?? req.socket?.remoteAddress ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        },
      });

      res.status(200).json(loginResponse);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        error: "Login failed",
      } as ApiResponse);
    }
  }

  /**
   * Refresh access token
   */
  static async refresh(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.cookies;

      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: "Refresh token required",
        } as ApiResponse);
        return;
      }

      // Verify refresh token
      const decoded = JWTUtils.verifyRefreshToken(refreshToken);

      // Check if token exists in database and is not expired
      const storedToken = await tenantAwarePrisma.withTenant(
        decoded.tenantId,
        async (client) => {
          return await client.refreshToken.findFirst({
            where: {
              token: refreshToken,
              userId: decoded.userId,
              expiresAt: { gt: new Date() },
            },
            include: {
              user: {
                include: {
                  tenant: true,
                  position: {
                    select: {
                      id: true,
                      title: true,
                      code: true,
                    },
                  },
                },
              },
            },
          });
        },
      );

      if (
        !storedToken ||
        !storedToken.user.isActive ||
        !storedToken.user.tenant.isActive
      ) {
        res.status(401).json({
          success: false,
          error: "Invalid or expired refresh token",
        } as ApiResponse);
        return;
      }

      // Create auth user object for new token generation //
      const authUser = {
        id: storedToken.user.id,
        tenantId: storedToken.user.tenantId,
        email: storedToken.user.workEmail,
        role: storedToken.user.role as any,
        position: storedToken.user.position?.title || null,
        name: storedToken.user.name,
      };

      // Generate new token pair
      const { accessToken, refreshToken: newRefreshToken } =
        JWTUtils.generateTokenPair(authUser);

      // Replace old refresh token with new one
      await tenantAwarePrisma.withTenant(
        decoded.tenantId,
        async (client) => {
          await client.refreshToken.deleteMany({
            where: { id: storedToken.id },
          });

        await client.refreshToken.create({
          data: {
            token: newRefreshToken,
            userId: storedToken.user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });
      });

      // Set new refresh token cookie
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 30 days
        path: "/", // Ensure cookie is available for all paths
      });

      res.status(200).json({
        success: true,
        accessToken,
        message: "Token refreshed successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(401).json({
        success: false,
        error: "Token refresh failed",
      } as ApiResponse);
    }
  }

  /**
   * User logout
   */
  static async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.cookies;

      // Revoke refresh token from database if present
      if (refreshToken && req.user) {
        try {
          await tenantAwarePrisma.withTenant(
            req.user.tenantId,
            async (client) => {
              await client.refreshToken.deleteMany({
                where: {
                  token: refreshToken,
                  userId: req.user!.id,
                },
              });
            },
          );
        } catch (error) {
          console.error("Error revoking refresh token:", error);
          // Continue with logout even if token deletion fails
        }
      }

      // Log logout transaction
      if (req.user) {
        recordTransaction({
          req,
          section: Section.ADMIN,
          module: Module.AUTH,
          page: Page.LOGIN,
          action: Action.LOGOUT,
          actionLabel: `User ${(req.user as any).name || (req.user as any).email} logged out`,
          entityType: EntityType.SESSION,
          entityId: req.user.id,
          entityLabel: (req.user as any).email,
        });
      }

      // Clear refresh token cookie
      res.clearCookie("refreshToken");

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({
        success: false,
        error: "Logout failed",
      } as ApiResponse);
    }
  }

  /**
   * Get current user profile
   */
  static async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        } as ApiResponse);
        return;
      }

      // Get fresh user data
      const user = await tenantAwarePrisma.withTenant(
        req.user.tenantId,
        async (client) => {
          return await client.user.findFirst({
            where: {
              id: req.user!.id,
              tenantId: req.user!.tenantId,
            },
            include: {
              employee:true,
              reportsTo: {
                select: {
                  id: true,
                  name: true,
                  position: {
                    select: {
                      id: true,
                      title: true,
                      code: true,
                    },
                  },
                },
              },
              position: {
                select: {
                  id: true,
                  title: true,
                  code: true,
                },
              },
              tenant: {
                select: {
                  id: true,
                  name: true,
                  subdomain: true,
                  settings: true,
                  generalSettings: { take: 1 },
                  companyLocations: { take: 1 },
                },
              },
            },
          });
        },
      );

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      // Load permissions
      const permSet = await RBACService.getUserPermissions(
        user.id,
        user.tenantId,
        user.role
      );

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          workEmail: user.workEmail,
          personalEmail: user.personalEmail,
          phone: user.phone,
          role: user.role,
          position: user.position,
          positionTitle: user.position?.title,
          dateOfBirth: user.dateOfBirth,
          avatarUrl: user.avatarUrl,
          workDays: user.workDays,
          isActive: user.isActive,
          reportsTo: user.reportsTo,
          employeeId: user.employeeId,
          employee: user.employee || {}, 
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
            subdomain: user.tenant.subdomain,
            logoUrl: (user.tenant.settings as any)?.logoUrl || null,
            generalSettings: (user.tenant as any).generalSettings?.[0] || null,
            companyLocation: (user.tenant as any).companyLocations?.[0] || null,
          },
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          permissions: Array.from(permSet),
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get user profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get user profile",
      } as ApiResponse);
    }
  }

  /**
   * Check authentication status
   */
  static async check(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          authenticated: false,
          error: "Not authenticated",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        authenticated: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
          position: req.user.position,
          tenantId: req.user.tenantId,
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Auth check error:", error);
      res.status(500).json({
        success: false,
        error: "Authentication check failed",
      } as ApiResponse);
    }
  }

  /**
   * Create a new user (for testing and tenant setup)
   */
  static async createUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.tenant) {
        res.status(400).json({
          success: false,
          error: "Tenant context is required",
        } as ApiResponse);
        return;
      }

      const userData: CreateUserData = req.body;

      // Validate required fields
      if (
        !userData.name ||
        !userData.workEmail ||
        !userData.personalEmail ||
        !userData.phone ||
        !userData.password ||
        !userData.positionId
      ) {
        res.status(400).json({
          success: false,
          error: "All required fields must be provided",
        } as ApiResponse);
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Create user
      const user = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          return await client.user.create({
            data: {
              tenantId: req.tenantId!,
              name: userData.name,
              workEmail: userData.workEmail.toLowerCase(),
              personalEmail: userData.personalEmail.toLowerCase(),
              phone: userData.phone,
              passwordHash,
              role: userData.role || "user",
              positionId: userData.positionId,
              reportsToId: userData.reportsToId || null,
              dateOfBirth: userData.dateOfBirth || null,
              workDays: userData.workDays || [1, 2, 3, 4, 5], // Monday to Friday
            },
            include: {
              position: {
                select: {
                  id: true,
                  title: true,
                  code: true,
                },
              },
            },
          });
        },
      );

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          workEmail: user.workEmail,
          personalEmail: user.personalEmail,
          phone: user.phone,
          role: user.role,
          position: user.position,
          positionTitle: user.position?.title,
          isActive: user.isActive,
        },
        message: "User created successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create user error:", error);

      if (error.code === "P2002") {
        res.status(409).json({
          success: false,
          error: "User with this email or phone already exists",
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create user",
      } as ApiResponse);
    }
  }

  /**
   * Get new profile including employee info
   */
  static async getNewProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        } as ApiResponse);
        return;
      }

      // Fetch user and linked employee
      const user = await tenantAwarePrisma.withTenant(
        req.user.tenantId,
        async (client) => {
          return await client.user.findFirst({
            where: {
              id: req.user!.id,
              tenantId: req.user!.tenantId,
            },
            include: {
              employee: true, // Assuming `employee` is the relation in Prisma
              reportsTo: {
                select: {
                  id: true,
                  name: true,
                  position: {
                    select: {
                      id: true,
                      title: true,
                      code: true,
                    },
                  },
                },
              },
              position: {
                select: {
                  id: true,
                  title: true,
                  code: true,
                },
              },
              tenant: {
                select: {
                  id: true,
                  name: true,
                  subdomain: true,
                  settings: true,
                },
              },
            },
          });
        },
      );

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        } as ApiResponse);
        return;
      }

      // Load effective permissions from RBAC service (cached)
      const permSet = await RBACService.getUserPermissions(
        user.id,
        user.tenantId,
        user.role,
      );

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          workEmail: user.workEmail,
          personalEmail: user.personalEmail,
          phone: user.phone,
          role: user.role,
          position: user.position,
          positionTitle: user.position?.title,
          dateOfBirth: user.dateOfBirth,
          workDays: user.workDays,
          isActive: user.isActive,
          reportsTo: user.reportsTo,
          tenant: {
            ...user.tenant,
            logoUrl: (user.tenant.settings as any)?.logoUrl || null,
          },
          employeeId: user.employee?.id || null, // Employee ID from linked table
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          permissions: Array.from(permSet),
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get new profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get profile",
      } as ApiResponse);
    }
  }

  /**
   * Google User login with tenant context
   */
  static async googleLogin(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          success: false,
          error: "Google access token is required",
        } as ApiResponse);
        return;
      }

      // Ensure we have tenant context for login
      if (!req.tenantId || !req.tenant) {
        res.status(400).json({
          success: false,
          error: "Tenant context is required for login",
        } as ApiResponse);
        return;
      }

      // Fetch user info from Google using access token
      let googleUser;
      try {
        const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` }
        });
        googleUser = response.data;
      } catch (err) {
        console.error("Failed to verify Google access token:", err);
        res.status(400).json({
          success: false,
          error: "Invalid Google token",
        } as ApiResponse);
        return;
      }

      if (!googleUser || !googleUser.email) {
        res.status(400).json({
          success: false,
          error: "Failed to retrieve email from Google",
        } as ApiResponse);
        return;
      }

      const email = googleUser.email.toLowerCase().trim();

      // Find user by email within the tenant
      const user = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          return await client.user.findFirst({
            where: {
              OR: [
                { workEmail: email },
                { personalEmail: email },
              ],
              tenantId: req.tenantId,
              isActive: true,
            },
            include: {
              tenant: true,
              employee: true,
              position: {
                select: {
                  id: true,
                  title: true,
                  code: true,
                },
              },
            },
          });
        },
      );

      if (!user) {
        res.status(401).json({
          success: false,
          error: "No account found matching this email in this tenant",
        } as ApiResponse);
        return;
      }

      // Check if tenant is active
      if (!user.tenant.isActive) {
        res.status(403).json({
          success: false,
          error: "Account suspended",
        } as ApiResponse);
        return;
      }

      // Create auth user object for token generation
      const authUser = {
        id: user.id,
        tenantId: user.tenantId,
        email: user.workEmail,
        role: user.role as any,
        position: user.position?.title || null,
        name: user.name,
      };

      // Generate token pair
      const { accessToken, refreshToken } =
        JWTUtils.generateTokenPair(authUser);

      // Store refresh token in database
      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        await client.refreshToken.create({
          data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });
      });

      // Set refresh token cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/", // Ensure cookie is available for all paths
      });

      // Load permissions
      const permSet = await RBACService.getUserPermissions(
        user.id,
        user.tenantId,
        user.role
      );

      // Return user data and access token
      const loginResponse: LoginResponse = {
        success: true,
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.workEmail,
          workEmail: user.workEmail,
          personalEmail: user.personalEmail,
          role: user.role as any,
          position: user.position ? { id: user.position.id, title: user.position.title } : null as any,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          tenantLogo: (user.tenant.settings as any)?.logoUrl || null,
          avatarUrl: user.avatarUrl,
          isActive: user.isActive,
          permissions: Array.from(permSet),
        },
        message: "Login successful",
      };

      // Populate req.user temporarily for transaction history logging
      req.user = {
        id: user.id,
        email: user.workEmail,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role as any,
        position: user.position?.title || null,
      };

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.AUTH,
        page: Page.LOGIN,
        action: Action.LOGIN,
        actionLabel: `User ${user.name || user.workEmail} logged in with Google SSO`,
        entityType: EntityType.SESSION,
        entityId: user.id,
        entityLabel: user.workEmail,
        metadata: {
          ip: req.ip ?? req.socket?.remoteAddress ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        },
      });

      res.status(200).json(loginResponse);
    } catch (error) {
      console.error("Google login error:", error);
      res.status(500).json({
        success: false,
        error: "Google login failed",
      } as ApiResponse);
    }
  }

  /**
   * Microsoft User login with tenant context
   */
  static async microsoftLogin(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          success: false,
          error: "Microsoft access token is required",
        } as ApiResponse);
        return;
      }

      // Ensure we have tenant context for login
      if (!req.tenantId || !req.tenant) {
        res.status(400).json({
          success: false,
          error: "Tenant context is required for login",
        } as ApiResponse);
        return;
      }

      // Fetch user info from Microsoft using access token
      let msUser;
      try {
        const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        msUser = response.data;
      } catch (err) {
        console.error("Failed to verify Microsoft access token:", err);
        res.status(400).json({
          success: false,
          error: "Invalid Microsoft token",
        } as ApiResponse);
        return;
      }

      if (!msUser || !(msUser.mail || msUser.userPrincipalName)) {
        res.status(400).json({
          success: false,
          error: "Failed to retrieve email from Microsoft",
        } as ApiResponse);
        return;
      }

      const email = (msUser.mail || msUser.userPrincipalName).toLowerCase().trim();

      // Find user by email within the tenant
      const user = await tenantAwarePrisma.withTenant(
        req.tenantId,
        async (client) => {
          return await client.user.findFirst({
            where: {
              OR: [
                { workEmail: email },
                { personalEmail: email },
              ],
              tenantId: req.tenantId,
              isActive: true,
            },
            include: {
              tenant: true,
              employee: true,
              position: {
                select: {
                  id: true,
                  title: true,
                  code: true,
                },
              },
            },
          });
        },
      );

      if (!user) {
        res.status(401).json({
          success: false,
          error: "No account found matching this email in this tenant",
        } as ApiResponse);
        return;
      }

      // Check if tenant is active
      if (!user.tenant.isActive) {
        res.status(403).json({
          success: false,
          error: "Account suspended",
        } as ApiResponse);
        return;
      }

      // Create auth user object for token generation
      const authUser = {
        id: user.id,
        tenantId: user.tenantId,
        email: user.workEmail,
        role: user.role as any,
        position: user.position?.title || null,
        name: user.name,
      };

      // Generate token pair
      const { accessToken, refreshToken } =
        JWTUtils.generateTokenPair(authUser);

      // Store refresh token in database
      await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
        await client.refreshToken.create({
          data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        });
      });

      // Set refresh token cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/", // Ensure cookie is available for all paths
      });

      // Load permissions
      const permSet = await RBACService.getUserPermissions(
        user.id,
        user.tenantId,
        user.role
      );

      // Return user data and access token
      const loginResponse: LoginResponse = {
        success: true,
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.workEmail,
          workEmail: user.workEmail,
          personalEmail: user.personalEmail,
          role: user.role as any,
          position: user.position ? { id: user.position.id, title: user.position.title } : null as any,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          tenantLogo: (user.tenant.settings as any)?.logoUrl || null,
          avatarUrl: user.avatarUrl,
          isActive: user.isActive,
          permissions: Array.from(permSet),
        },
        message: "Login successful",
      };

      // Populate req.user temporarily for transaction history logging
      req.user = {
        id: user.id,
        email: user.workEmail,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role as any,
        position: user.position?.title || null,
      };

      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.AUTH,
        page: Page.LOGIN,
        action: Action.LOGIN,
        actionLabel: `User ${user.name || user.workEmail} logged in with Microsoft SSO`,
        entityType: EntityType.SESSION,
        entityId: user.id,
        entityLabel: user.workEmail,
        metadata: {
          ip: req.ip ?? req.socket?.remoteAddress ?? null,
          userAgent: req.headers["user-agent"] ?? null,
        },
      });

      res.status(200).json(loginResponse);
    } catch (error) {
      console.error("Microsoft login error:", error);
      res.status(500).json({
        success: false,
        error: "Microsoft login failed",
      } as ApiResponse);
    }
  }

  static async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email, tenantSubdomain } = req.body;
      
      if (!email) {
        res.status(400).json({ success: false, error: "Email is required" });
        return;
      }

      let tenantCondition: any = {};
      
      // Look up tenant based on subdomain if provided
      if (tenantSubdomain) {
        const tenant = await prisma.tenant.findFirst({
          where: { subdomain: String(tenantSubdomain).toLowerCase(), isActive: true }
        });
        if (tenant) {
          tenantCondition = { tenantId: tenant.id };
        }
      }

      // We still use a generic success message to prevent email enumeration
      const genericResponse = {
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      };

      const user = await prisma.user.findFirst({
        where: { 
          workEmail: email.toLowerCase(),
          isActive: true,
          ...tenantCondition
        },
        include: { tenant: true }
      });

      if (!user) {
        res.status(200).json(genericResponse);
        return;
      }

      // Invalidate existing unused tokens for this user
      await prisma.password_reset_tokens.updateMany({
        where: { user_id: user.id, used: false },
        data: { used: true }
      });

      // Generate token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

      await prisma.password_reset_tokens.create({
        data: {
          user_id: user.id,
          token: hashedToken,
          expires_at: expiresAt,
          used: false
        }
      });

      // Send email
      let frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";
      if (user.tenant?.subdomain) {
        try {
          const urlObj = new URL(frontendUrl);
          const parts = urlObj.hostname.split('.');
          if (parts[0] === 'app' || parts[0] === 'www') {
            parts[0] = user.tenant.subdomain;
            urlObj.hostname = parts.join('.');
          } else if (parts[0] === 'localhost' || parts[0] === '127') {
            urlObj.hostname = `${user.tenant.subdomain}.${urlObj.hostname}`;
          } else {
            parts.unshift(user.tenant.subdomain);
            urlObj.hostname = parts.join('.');
          }
          frontendUrl = urlObj.toString().replace(/\/$/, '');
        } catch (e) {
          // Fallback if URL parsing fails
        }
      }
      
      const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;
      const emailService = new EmailService();

      await emailService.sendPasswordResetEmail({
        to: user.workEmail,
        displayName: user.name,
        username: user.workEmail,
        resetLink
      }, user.tenantId);

      // Audit Log
      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.AUTH,
        page: Page.LOGIN,
        action: Action.UPDATE,
        actionLabel: `Password reset requested for ${user.workEmail}`,
        entityType: "user" as any,
        entityId: user.id,
        entityLabel: user.workEmail,
        metadata: { ip: req.ip ?? null }
      });

      res.status(200).json(genericResponse);
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  static async validateResetToken(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        res.status(400).json({ success: false, error: "Invalid token format" });
        return;
      }

      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      const resetToken = await prisma.password_reset_tokens.findFirst({
        where: { token: hashedToken, used: false, expires_at: { gt: new Date() } }
      });

      if (!resetToken) {
        res.status(400).json({ success: false, error: "Invalid or expired token" });
        return;
      }

      res.status(200).json({ success: true, message: "Token is valid" });
    } catch (error) {
      console.error("Validate token error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        res.status(400).json({ success: false, error: "Token and new password are required" });
        return;
      }

      // Strong password validation on backend
      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        res.status(400).json({ success: false, error: "Password must be at least 8 characters long and contain numbers and special characters." });
        return;
      }

      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      const resetToken = await prisma.password_reset_tokens.findFirst({
        where: { token: hashedToken, used: false, expires_at: { gt: new Date() } }
      });

      if (!resetToken || !resetToken.user_id) {
        res.status(400).json({ success: false, error: "Invalid or expired token" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: resetToken.user_id }
      });

      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      // Update password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: newPasswordHash }
        });

        await tx.password_reset_tokens.update({
          where: { id: resetToken.id },
          data: { used: true }
        });

        // Revoke active sessions
        await tx.refreshToken.deleteMany({
          where: { userId: user.id }
        });
      });

      // Audit Log
      recordTransaction({
        req,
        section: Section.ADMIN,
        module: Module.AUTH,
        page: Page.LOGIN,
        action: Action.UPDATE,
        actionLabel: `Password successfully reset for ${user.workEmail}`,
        entityType: "user" as any,
        entityId: user.id,
        entityLabel: user.workEmail,
        metadata: { ip: req.ip ?? null }
      });

      res.status(200).json({ success: true, message: "Password has been successfully reset" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
}

export default AuthController;
