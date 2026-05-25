import { Response } from "express";
import { prisma } from "@/config/database";
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

      // Build filter query
      const where: any = {
        tenantId: req.tenantId,
      };

      if (role) where.role = role;
      if (position) where.position = { title: position }; // Filter by position title if string passed
      if (reportsToId) where.reportsToId = reportsToId;
      if (isActive !== "all") where.isActive = isActive === "true";

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { workEmail: { contains: search as string, mode: "insensitive" } },
          {
            personalEmail: { contains: search as string, mode: "insensitive" },
          },
        ];
      }

      // Build sort object
      const orderBy: any = {};
      orderBy[sortBy as string] = sortOrder === "desc" ? "desc" : "asc";

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);

      const [members, total] = await Promise.all([
        await prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            workEmail: true,
            personalEmail: true,
            phone: true,
            role: true,
            avatarUrl: true,
            position: { select: { id: true, title: true } },
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            reportsTo: {
              select: {
                id: true,
                name: true,
                position: { select: { title: true } },
              },
            },
            userRoles: {
              select: {
                role: { select: { name: true, slug: true } }
              }
            }
          },
          orderBy,
          skip,
          take: Number(limit),
        }),

        await prisma.user.count({ where }),
      ]);

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

      const member = await prisma.user.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
        select: {
          id: true,
          name: true,
          workEmail: true,
          personalEmail: true,
          phone: true,
          role: true,
          avatarUrl: true,
          position: { select: { id: true, title: true } },
          reportsToId: true,
          dateOfBirth: true,
          workDays: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          reportsTo: {
            select: {
              id: true,
              name: true,
              position: { select: { title: true } },
            },
          },
        },
      });

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

      // Validate required fields
      if (
        !userData.name ||
        !userData.workEmail ||
        !userData.password ||
        !userData.positionId
      ) {
        res.status(400).json({
          success: false,
          error: "Name, work email, password, and position are required",
        } as ApiResponse);
        return;
      }

      // Check if user already exists within tenant
      const existingUser = await prisma.user.findFirst({
        where: {
          tenantId: req.tenantId,
          OR: [
            { workEmail: userData.workEmail.toLowerCase() },
            { personalEmail: userData.personalEmail?.toLowerCase() },
            { phone: userData.phone },
          ],
        },
      });

      if (existingUser) {
        throw new ValidationError(
          "User with this email or phone already exists in this tenant",
        );
      }

      // Validate reports to user if provided
      if (userData.reportsToId) {
        const reportsToUser = await prisma.user.findFirst({
          where: {
            id: userData.reportsToId,
            tenantId: req.tenantId,
            isActive: true,
          },
        });

        if (!reportsToUser) {
          throw new ValidationError("Reports to user not found in this tenant");
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // Validate assigned shift if provided
      if (userData.assignedShiftId) {
        const shift = await prisma.shift.findFirst({
          where: {
            id: userData.assignedShiftId,
            tenantId: req.tenantId,
            isActive: true,
          },
        });

        if (!shift) {
          throw new ValidationError(
            "Assigned shift not found or inactive in this tenant",
          );
        }
      }

      // Create user
      const newUser = await prisma.user.create({
        data: {
          tenantId: req.tenantId,
          name: userData.name,
          workEmail: userData.workEmail.toLowerCase(),
          personalEmail: userData.personalEmail?.toLowerCase(),
          phone: userData.phone,
          passwordHash,
          role: userData.role || "user",
          positionId: userData.positionId,
          reportsToId: userData.reportsToId,
          dateOfBirth: userData.dateOfBirth
            ? new Date(userData.dateOfBirth)
            : null,
          workDays: userData.workDays || [1, 2, 3, 4, 5], // Default to weekdays
          assignedShiftId: userData.assignedShiftId, // FIXED: Process shift assignment
          isActive: userData.isActive !== undefined ? userData.isActive : true, // FIXED: Process isActive
        },
        select: {
          id: true,
          name: true,
          workEmail: true,
          personalEmail: true,
          phone: true,
          role: true,
          position: { select: { id: true, title: true } },
          isActive: true,
          avatarUrl: true,
          createdAt: true,
          reportsTo: {
            select: {
              id: true,
              name: true,
              position: { select: { title: true } },
            },
          },
          userRoles: {
            select: {
              role: { select: { name: true, slug: true } }
            }
          }
        },
      });

      // RBAC Sync: Assign the role in UserRole table if it's an RBAC role
      if (userData.role) {
        const rbacRole = await prisma.role.findFirst({
          where: { tenantId: req.tenantId, slug: userData.role }
        });
        if (rbacRole) {
          await prisma.userRole.create({
            data: {
              userId: newUser.id,
              roleId: rbacRole.id,
              tenantId: req.tenantId,
              assignedById: req.user.id
            }
          });
        }
      }

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

      // Remove fields that shouldn't be updated directly
      delete (updates as any).passwordHash;
      delete (updates as any).tenantId;
      delete (updates as any).createdAt;

      // Check if user exists and belongs to tenant
      const existingUser = await prisma.user.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!existingUser) {
        throw new NotFoundError("User not found in this tenant");
      }

      // Check for email conflicts within tenant if email is being updated
      if (
        updates.workEmail &&
        updates.workEmail.toLowerCase() !== existingUser.workEmail
      ) {
        const duplicateUser = await prisma.user.findFirst({
          where: {
            workEmail: updates.workEmail.toLowerCase(),
            tenantId: req.tenantId,
            id: { not: id },
          },
        });

        if (duplicateUser) {
          throw new ValidationError("Work email already exists in this tenant");
        }
      }

      // Validate reports to user if provided
      if (updates.reportsToId) {
        const reportsToUser = await prisma.user.findFirst({
          where: {
            id: updates.reportsToId,
            tenantId: req.tenantId,
            isActive: true,
          },
        });

        if (!reportsToUser) {
          throw new ValidationError("Reports to user not found in this tenant");
        }
      }

      // Validate assigned shift if provided
      if (updates.assignedShiftId) {
        const shift = await prisma.shift.findFirst({
          where: {
            id: updates.assignedShiftId,
            tenantId: req.tenantId,
            isActive: true,
          },
        });

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

      // Update shift assignment tracking if shift is being changed
      const updateData: any = { ...updates, updatedAt: new Date() };
      if (
        updates.assignedShiftId &&
        updates.assignedShiftId !== existingUser.assignedShiftId
      ) {
        updateData.shiftAssignedById = req.user!.id;
        updateData.shiftAssignedDate = new Date();
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          workEmail: true,
          personalEmail: true,
          phone: true,
          role: true,
          position: { select: { id: true, title: true } },
          workDays: true,
          isActive: true,
          avatarUrl: true,
          updatedAt: true,
          assignedShift: {
            select: {
              id: true,
              name: true,
              startTime: true,
              endTime: true,
            },
          },
          reportsTo: {
            select: {
              id: true,
              name: true,
              position: { select: { title: true } },
            },
          },
          userRoles: {
            select: {
              role: { select: { name: true, slug: true } }
            }
          }
        },
      });

      // RBAC Sync: If role is updated, sync UserRole table
      if (updates.role) {
        const rbacRole = await prisma.role.findFirst({
          where: { tenantId: req.tenantId, slug: updates.role }
        });
        if (rbacRole) {
          await prisma.userRole.deleteMany({
            where: { userId: id, tenantId: req.tenantId }
          });
          await prisma.userRole.create({
            data: {
              userId: id,
              roleId: rbacRole.id,
              tenantId: req.tenantId,
              assignedById: req.user!.id
            }
          });
        }
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

      const existingUser = await prisma.user.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!existingUser) {
        throw new NotFoundError("User not found in this tenant");
      }

      // Soft delete
      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          workEmail: true,
          isActive: true,
          updatedAt: true,
        },
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

      const existingUser = await prisma.user.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!existingUser) {
        throw new NotFoundError("User not found in this tenant");
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          isActive: true,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          workEmail: true,
          isActive: true,
          updatedAt: true,
        },
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

      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          tenantId: req.tenantId,
        },
        select: {
          id: true,
          name: true,
          workEmail: true,
          personalEmail: true,
          phone: true,
          role: true,
          avatarUrl: true,
          position: { select: { id: true, title: true } },
          dateOfBirth: true,
          workDays: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          employeeId: true,
          employee: {
            select: {
              employee_code: true,
            },
          },
          reportsTo: {
            select: {
              id: true,
              name: true,
              position: { select: { title: true } },
            },
          },
        },
      });

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

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          workEmail: true,
          personalEmail: true,
          phone: true,
          avatarUrl: true,
          position: { select: { id: true, title: true } },
          dateOfBirth: true,
          workDays: true,
          updatedAt: true,
          reportsTo: {
            select: {
              id: true,
              name: true,
              position: { select: { title: true } },
            },
          },
        },
      });

      res.status(200).json({
        success: true,
        data: updatedUser,
        message: "Profile updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update user profile error:", error);

      if (error.code === "P2002") {
        res.status(409).json({
          success: false,
          error: "Email or phone already exists",
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
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          tenantId: req.tenantId,
        },
      });

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
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        },
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

      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          tenantId: req.tenantId,
        },
      });

      if (!user) {
        throw new NotFoundError("User not found in this tenant");
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        },
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

      const where: any = {
        tenantId: req.tenantId,
        isActive: true,
      };

      if (role) where.role = role;
      if (position) where.position = { title: position };

      const members = await prisma.user.findMany({
        where,
        select: {
          id: true,
          employeeId: true,
          name: true,
          workEmail: true,
          position: { select: { id: true, title: true } },
          role: true,
          avatarUrl: true,
        },
        orderBy: { name: "asc" },
      });

      const formattedMembers = members.map((member) => ({
        value: member.id,
        employeeId: member.employeeId,
        label: member.name,
        email: member.workEmail,
        position: member.position?.title,
        role: member.role,
        avatarUrl: member.avatarUrl,
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
      const member = await prisma.user.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!member) {
        throw new NotFoundError("Member not found in this tenant");
      }

      // Verify shift exists and belongs to tenant
      const shift = await prisma.shift.findFirst({
        where: {
          id: shiftId,
          tenantId: req.tenantId,
          isActive: true,
        },
      });

      if (!shift) {
        throw new ValidationError("Shift not found or inactive in this tenant");
      }

      // Update member with shift assignment
      const updatedMember = await prisma.user.update({
        where: { id },
        data: {
          assignedShiftId: shiftId,
          shiftAssignedById: req.user!.id,
          shiftAssignedDate: new Date(),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          workEmail: true,
          personalEmail: true,
          phone: true,
          role: true,
          position: { select: { id: true, title: true } },
          isActive: true,
          updatedAt: true,
          assignedShift: {
            select: {
              id: true,
              name: true,
              startTime: true,
              endTime: true,
            },
          },
          shiftAssignedBy: {
            select: {
              id: true,
              name: true,
              position: { select: { title: true } },
            },
          },
          reportsTo: {
            select: {
              id: true,
              name: true,
              position: { select: { title: true } },
            },
          },
        },
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
}

export default UserController;
