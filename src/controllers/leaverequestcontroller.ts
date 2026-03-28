import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

/* =========================================
   APPLY LEAVE
========================================= */

export const applyLeave = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;

    const { leaveTypeId, fromDate, toDate, reason } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { employeeId: true },
    });

    if (!user?.employeeId) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    const employeeId = user.employeeId;

    const start = new Date(fromDate);
    const end = new Date(toDate);

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "From date cannot be greater than To date",
      });
    }

    /* Overlapping leave check */

    const overlappingLeave = await prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        employeeId,
        status: { in: ["PENDING", "APPROVED"] },
        OR: [
          {
            fromDate: { lte: end },
            toDate: { gte: start },
          },
        ],
      },
    });

    if (overlappingLeave) {
      return res.status(409).json({
        success: false,
        message: "Overlapping leave request exists",
      });
    }

    const LOP_LEAVE_TYPE_ID = "lop";

    /* Calculate leave days */
    let totalDays;
    if (leaveTypeId === LOP_LEAVE_TYPE_ID) {
      let count = 0;
      const curDate = new Date(start.getTime());
      while (curDate <= end) {
        const dayOfWeek = curDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0=Sun, 6=Sat
          count++;
        }
        curDate.setDate(curDate.getDate() + 1);
      }
      totalDays = count;
      if (totalDays === 0) {
        return res.status(400).json({
          success: false,
          message: "LOP cannot be applied only on weekends. No working days in selected range.",
        });
      }
    } else {
      const diffTime = end.getTime() - start.getTime();
      totalDays = diffTime / (1000 * 60 * 60 * 24) + 1;
    }

    const totalUnits = new Prisma.Decimal(totalDays);

    /* Check leave balance */

    const lastLedger = await prisma.leaveLedger.findFirst({
      where: {
        tenantId,
        employeeId,
        leaveTypeId,
      },
      orderBy: {
        transactionDate: "desc",
      },
    });

    const balance = lastLedger
      ? new Prisma.Decimal(lastLedger.balanceAfter)
      : new Prisma.Decimal(0);

    if (leaveTypeId !== LOP_LEAVE_TYPE_ID) {
      if (balance.lessThan(totalUnits)) {
        return res.status(400).json({
          success: false,
          message: "Insufficient leave balance",
        });
      }
    }

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId,
        leaveTypeId,
        fromDate: start,
        toDate: end,
        totalUnits,
        status: "PENDING",
        createdById: userId,
        reason,
      },
    });

    return res.json({
      success: true,
      message: "Leave applied successfully",
      data: leaveRequest,
    });

  } catch (error: any) {
    console.error("Apply Leave Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/* =========================================
   GET LEAVE REQUESTS
========================================= */

export const getLeaveRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    const role = req.user?.role;

    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing tenant or user",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { employeeId: true },
    });

    if (!user?.employeeId) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    let whereCondition: any = { tenantId };

    /* Employee view */

    if (role === "EMPLOYEE") {
      whereCondition.employeeId = user.employeeId;
    }

    /* Manager view (employees who report to them) */

    if (role === "MANAGER" || role === "ADMIN") {
      const team = await prisma.employeeProjectMapping.findMany({
        where: {
          reportingManager: userId,
        },
        select: {
          employeeId: true,
        },
      });

      const employeeIds = team.map((t) => t.employeeId);

      whereCondition.employeeId = {
        in: employeeIds,
      };
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: whereCondition,
      include: {
        employee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },
        approvedByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formatted = leaveRequests.map((leave) => ({
      ...leave,
      leaveType: leave.leaveType || {
        id: "lop",
        name: "Loss Of Pay (LOP)",
      },
    }));

    return res.json({
      success: true,
      data: formatted,
    });

  } catch (error: any) {
    console.error("Get Leave Requests Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* =========================================
   APPROVE / REJECT LEAVE
========================================= */

export const updateLeaveStatus = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const approverId = req.user?.id;

    const { id } = req.params;
    const { status } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!leaveRequest || leaveRequest.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    if (leaveRequest.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Leave already processed",
      });
    }

    /* Reject Leave */

    if (status === "REJECTED") {
      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          approvedById: approverId,
          approvedAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: "Leave rejected",
        data: updated,
      });
    }

    /* Approve Leave + Ledger */

    const result = await prisma.$transaction(async (tx) => {

      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: approverId,
          approvedAt: new Date(),
        },
      });

      const lastLedger = await tx.leaveLedger.findFirst({
        where: {
          tenantId,
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
        },
        orderBy: {
          transactionDate: "desc",
        },
      });

      const previousBalance = lastLedger
        ? new Prisma.Decimal(lastLedger.balanceAfter)
        : new Prisma.Decimal(0);

      const newBalance = previousBalance.minus(
        new Prisma.Decimal(leaveRequest.totalUnits)
      );

      await tx.leaveLedger.create({
        data: {
          tenantId,
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          transactionType: "leave_debit",
          referenceId: leaveRequest.id,
          units: new Prisma.Decimal(leaveRequest.totalUnits).negated(),
          balanceAfter: newBalance,
          transactionDate: new Date(),
          policyVersion: 1,
          createdById: approverId,
        },
      });

      return updated;
    });

    return res.json({
      success: true,
      message: "Leave approved successfully",
      data: result,
    });

  } catch (error: any) {
    console.error("Update Leave Status Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* =========================================
   CANCEL LEAVE
========================================= */

export const cancelLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {

    const tenantId = req.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!leaveRequest || leaveRequest.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    if (leaveRequest.createdById !== userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot cancel this leave",
      });
    }

    if (leaveRequest.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Only pending leave can be cancelled",
      });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "CANCELLED",
      },
    });

    return res.json({
      success: true,
      message: "Leave cancelled successfully",
      data: updated,
    });

  } catch (error: any) {
    console.error("Cancel Leave Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
/* =========================================
   GET PENDING APPROVALS (MANAGER / ADMIN)
========================================= */

export const getPendingApprovals = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;

    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Missing tenant or user",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId, tenantId },
      select: { employeeId: true, role: true },
    });

    if (!user?.employeeId) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    let employeeIds: string[] = [];

    if (user?.role === "admin" || user?.role === "super_admin") {
      // Admins see all employees in the tenant
      const allEmployees = await prisma.employee.findMany({
        where: { tenantId },
        select: { id: true },
      });
      employeeIds = allEmployees.map((e) => e.id);
    } else {
      /* Find employees reporting to this manager */
      const team = await prisma.employeeProjectMapping.findMany({
        where: {
          reportingManager: userId,
        },
        select: {
          employeeId: true,
        },
      });
      employeeIds = team.map((t) => t.employeeId);
    }

    const approvals = await prisma.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId: { in: employeeIds },
        status: "PENDING",
      },
      include: {
        employee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            profile_pic: true,
          },
        },
        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formatted = approvals.map((leave) => ({
      ...leave,
      leaveType: leave.leaveType || {
        id: "lop",
        name: "Loss Of Pay (LOP)",
      },
    }));

    return res.json({
      success: true,
      data: formatted,
    });

  } catch (error: any) {
    console.error("Get Approvals Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};