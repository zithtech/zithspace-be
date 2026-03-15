import { Response } from "express";
import bcrypt from "bcryptjs";
import { tenantAwarePrisma } from "@/config/database";
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

export class AuthController {
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
              isActive: true,
            },
            include: {
              tenant: true,
              // employee: true,
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
      if (!(user as any).tenant.isActive) {
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
        position: (user as any).position?.title || null,
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
          position: (user as any).position?.title || null,
          tenantId: user.tenantId,
          tenantName: (user as any).tenant.name,
          isActive: user.isActive,
        },
        message: "Login successful",
      };

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
      await tenantAwarePrisma.withTenant(decoded.tenantId, async (client) => {
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
              //employee: true,
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

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          workEmail: user.workEmail,
          personalEmail: user.personalEmail,
          phone: user.phone,
          role: user.role,
          position: user.positionId,
          positionTitle: (user as any).position?.title,
          dateOfBirth: user.dateOfBirth,
          workDays: user.workDays,
          isActive: user.isActive,
          reportsTo: (user as any).reportsTo,
          employeeId: (user as any).employee?.id || null,
          employee: (user as any).employee || {}, // Include linked employee data if available
          tenant: (user as any).tenant,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
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
              // employee: true, // Assuming `employee` is the relation in Prisma
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
          position: (user as any).position,
          positionTitle: (user as any).position?.title,
          dateOfBirth: user.dateOfBirth,
          workDays: user.workDays,
          isActive: user.isActive,
          reportsTo: (user as any).reportsTo,
          tenant: (user as any).tenant,
          employeeId: (user as any).employee?.id || null, // Employee ID from linked table
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
}

export default AuthController;
