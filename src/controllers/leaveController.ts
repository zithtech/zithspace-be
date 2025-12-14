import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import emailService from "@/utils/emailService";

class LeaveController {
  // Apply for leave
  async applyLeave(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const {
        type,
        startDate,
        endDate,
        duration,
        durationType,
        reason,
        attachments,
      } = req.body;

      // Validate required fields
      if (
        !type ||
        !startDate ||
        !endDate ||
        !duration ||
        !durationType ||
        !reason
      ) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
        return;
      }

      // Get user details including reporting manager
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          workEmail: true,
          reportsToId: true,
          reportsTo: {
            select: {
              id: true,
              name: true,
              workEmail: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Create leave request
      const leave = await prisma.leave.create({
        data: {
          tenantId,
          userId,
          type,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          duration: parseFloat(duration),
          durationType,
          reason,
          attachments: attachments || [],
          status: "pending",
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              workEmail: true,
              position: true,
            },
          },
        },
      });

      // Send email notification to reporting manager
      if (user.reportsTo) {
        await emailService.sendLeaveApplicationEmail({
          to: user.reportsTo.workEmail,
          managerName: user.reportsTo.name,
          employeeName: user.name,
          employeeEmail: user.workEmail,
          leaveType: type,
          startDate,
          endDate,
          duration: parseFloat(duration),
          durationType,
          reason,
          leaveId: leave.id,
        });
      }

      res.status(201).json({
        success: true,
        message: "Leave application submitted successfully",
        data: leave,
      });
    } catch (error: any) {
      console.error("Apply leave error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to apply for leave",
        details: error.message,
      });
    }
  }

  // Get my leaves
  async getMyLeaves(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const {
        status,
        type,
        startDate,
        endDate,
        page = 1,
        limit = 10,
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        tenantId,
        userId,
      };

      if (status) where.status = status as string;
      if (type) where.type = type as string;
      if (startDate || endDate) {
        where.startDate = {};
        if (startDate) where.startDate.gte = new Date(startDate as string);
        if (endDate) where.startDate.lte = new Date(endDate as string);
      }

      const [leaves, total] = await Promise.all([
        prisma.leave.findMany({
          where,
          include: {
            approvedBy: {
              select: {
                id: true,
                name: true,
                position: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.leave.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: leaves,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error: any) {
      console.error("Get my leaves error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch leaves",
        details: error.message,
      });
    }
  }

  // Get pending approvals (for managers and super admins)
  async getPendingApprovals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      let where: any = {
        tenantId,
        status: "pending",
      };

      // Super admins can see all pending leaves
      if (userRole === "super_admin") {
        // No additional filter needed
      } else {
        // Regular users and managers can only see their subordinates' leaves
        where.user = {
          reportsToId: userId,
        };
      }

      const leaves = await prisma.leave.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              workEmail: true,
              position: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        success: true,
        data: leaves,
      });
    } catch (error: any) {
      console.error("Get pending approvals error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch pending approvals",
        details: error.message,
      });
    }
  }

  // Get all leaves (admin only)
  async getAllLeaves(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        status,
        type,
        userId,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { tenantId };

      if (status) where.status = status as string;
      if (type) where.type = type as string;
      if (userId) where.userId = userId as string;
      if (startDate || endDate) {
        where.startDate = {};
        if (startDate) where.startDate.gte = new Date(startDate as string);
        if (endDate) where.startDate.lte = new Date(endDate as string);
      }

      const [leaves, total] = await Promise.all([
        prisma.leave.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                workEmail: true,
                position: true,
              },
            },
            approvedBy: {
              select: {
                id: true,
                name: true,
                position: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.leave.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: leaves,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error: any) {
      console.error("Get all leaves error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch leaves",
        details: error.message,
      });
    }
  }

  // Get leave by ID
  async getLeaveById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const leave = await prisma.leave.findFirst({
        where: { id, tenantId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              workEmail: true,
              position: true,
              reportsToId: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              position: true,
            },
          },
        },
      });

      if (!leave) {
        res.status(404).json({
          success: false,
          error: "Leave not found",
        });
        return;
      }

      // Check access: user can see their own leaves, managers can see subordinates', admins can see all
      const canAccess =
        leave.userId === userId ||
        leave.user.reportsToId === userId ||
        userRole === "super_admin" ||
        userRole === "admin";

      if (!canAccess) {
        res.status(403).json({
          success: false,
          error: "Access denied",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: leave,
      });
    } catch (error: any) {
      console.error("Get leave by ID error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch leave",
        details: error.message,
      });
    }
  }

  // Approve leave (managers and super admins only)
  async approveLeave(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const approverId = req.user!.id;
      const userRole = req.user!.role;

      // Get leave details
      const leave = await prisma.leave.findFirst({
        where: { id, tenantId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              workEmail: true,
              reportsToId: true,
            },
          },
        },
      });

      if (!leave) {
        res.status(404).json({
          success: false,
          error: "Leave not found",
        });
        return;
      }

      if (leave.status !== "pending") {
        res.status(400).json({
          success: false,
          error: `Leave is already ${leave.status}`,
        });
        return;
      }

      // Check if user has permission to approve
      // Super admins can approve all, managers can approve their subordinates' leaves
      const canApprove =
        userRole === "super_admin" || leave.user.reportsToId === approverId;

      if (!canApprove) {
        res.status(403).json({
          success: false,
          error: "You do not have permission to approve this leave",
        });
        return;
      }

      // Update leave status
      const updatedLeave = await prisma.leave.update({
        where: { id },
        data: {
          status: "approved",
          approvedById: approverId,
          approvedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              workEmail: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Send approval email to employee
      await emailService.sendLeaveApprovalEmail({
        to: updatedLeave.user.workEmail,
        employeeName: updatedLeave.user.name,
        approverName: updatedLeave.approvedBy!.name,
        leaveType: updatedLeave.type,
        startDate: updatedLeave.startDate.toISOString(),
        endDate: updatedLeave.endDate.toISOString(),
        duration: parseFloat(updatedLeave.duration.toString()),
        durationType: updatedLeave.durationType,
      });

      res.status(200).json({
        success: true,
        message: "Leave approved successfully",
        data: updatedLeave,
      });
    } catch (error: any) {
      console.error("Approve leave error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to approve leave",
        details: error.message,
      });
    }
  }

  // Reject leave (managers and super admins only)
  async rejectLeave(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const { rejectionReason } = req.body;
      const approverId = req.user!.id;
      const userRole = req.user!.role;

      if (!rejectionReason) {
        res.status(400).json({
          success: false,
          error: "Rejection reason is required",
        });
        return;
      }

      // Get leave details
      const leave = await prisma.leave.findFirst({
        where: { id, tenantId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              workEmail: true,
              reportsToId: true,
            },
          },
        },
      });

      if (!leave) {
        res.status(404).json({
          success: false,
          error: "Leave not found",
        });
        return;
      }

      if (leave.status !== "pending") {
        res.status(400).json({
          success: false,
          error: `Leave is already ${leave.status}`,
        });
        return;
      }

      // Check if user has permission to reject
      const canReject =
        userRole === "super_admin" || leave.user.reportsToId === approverId;

      if (!canReject) {
        res.status(403).json({
          success: false,
          error: "You do not have permission to reject this leave",
        });
        return;
      }

      // Update leave status
      const updatedLeave = await prisma.leave.update({
        where: { id },
        data: {
          status: "rejected",
          approvedById: approverId,
          approvedAt: new Date(),
          rejectionReason,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              workEmail: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Send rejection email to employee
      await emailService.sendLeaveRejectionEmail({
        to: updatedLeave.user.workEmail,
        employeeName: updatedLeave.user.name,
        approverName: updatedLeave.approvedBy!.name,
        leaveType: updatedLeave.type,
        startDate: updatedLeave.startDate.toISOString(),
        endDate: updatedLeave.endDate.toISOString(),
        duration: parseFloat(updatedLeave.duration.toString()),
        durationType: updatedLeave.durationType,
        rejectionReason,
      });

      res.status(200).json({
        success: true,
        message: "Leave rejected",
        data: updatedLeave,
      });
    } catch (error: any) {
      console.error("Reject leave error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reject leave",
        details: error.message,
      });
    }
  }

  // Cancel leave (user can cancel their own pending leave)
  async cancelLeave(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const userId = req.user!.id;

      const leave = await prisma.leave.findFirst({
        where: { id, tenantId, userId },
      });

      if (!leave) {
        res.status(404).json({
          success: false,
          error: "Leave not found",
        });
        return;
      }

      if (leave.status !== "pending") {
        res.status(400).json({
          success: false,
          error: "Only pending leaves can be cancelled",
        });
        return;
      }

      const updatedLeave = await prisma.leave.update({
        where: { id },
        data: { status: "cancelled" },
      });

      res.status(200).json({
        success: true,
        message: "Leave cancelled successfully",
        data: updatedLeave,
      });
    } catch (error: any) {
      console.error("Cancel leave error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to cancel leave",
        details: error.message,
      });
    }
  }
}

export default new LeaveController();
