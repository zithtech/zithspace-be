import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

/* ================================
   APPLY LEAVE
================================ */

export const applyLeave = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;

    const { leaveTypeId, fromDate, toDate , reason } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!leaveTypeId || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: "Missing fields",
      });
    }

    /* 🔹 Get employeeId from user */
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId,
      },
      select: {
        employeeId: true,
      },
    });

    if (!user || !user.employeeId) {
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

    /* 🔹 Check overlapping leave */
    const overlappingLeave = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        tenantId,
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
        message: "You already have an overlapping leave request",
      });
    }

    /* 🔹 Calculate leave days */
    const diffTime = end.getTime() - start.getTime();
    const totalDays = diffTime / (1000 * 60 * 60 * 24) + 1;

    const totalUnits = new Prisma.Decimal(totalDays);

    /* 🔹 Get latest balance */
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

    const currentBalance = lastLedger
      ? new Prisma.Decimal(lastLedger.balanceAfter)
      : new Prisma.Decimal(0);

const LOP_LEAVE_TYPE_ID = "lop";

if (leaveTypeId !== LOP_LEAVE_TYPE_ID) {
  if (currentBalance.lessThan(totalUnits)) {
    return res.status(400).json({
      success: false,
      message: "Insufficient leave balance",
    });
  }
}

    /* 🔹 Create leave request */
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

    return res.status(201).json({
      success: true,
      message: "Leave applied successfully",
      data: leaveRequest,
    });
  } catch (error: any) {
    console.error("Apply Leave Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* ================================
   GET LEAVE REQUESTS
================================ */

export const getLeaveRequests = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    const { status } = req.query;

    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        message: "Tenant or User ID missing",
      });
    }

    /* 🔹 Get employeeId */
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId,
      },
      select: {
        employeeId: true,
      },
    });

    if (!user || !user.employeeId) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    const whereCondition: any = {
      tenantId,
      employeeId: user.employeeId,
      ...(status && { status: status as string }),
    };

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

    return res.status(200).json({
      success: true,
      data: leaveRequests,
    });
  } catch (error: any) {
    console.error("Get Leave Requests Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* ================================
   UPDATE LEAVE STATUS
================================ */

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

    /* 🔹 Reject Leave */
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

    /* 🔹 Approve Leave with Ledger Transaction */

    const result = await prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.leaveRequest.update({
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
          expiryDate: null,
          policyVersion: 1,
          createdById: approverId,
        },
      });

      return updatedRequest;
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
export const cancelLeaveRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;

    if (!tenantId || !userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
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

    // Only creator can cancel
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