import { Response } from "express";
import { prisma } from "@/config/database";
import { Prisma } from "@prisma/client";
import { AuthRequest } from "@/types";

export const getLeaveBalances = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;

    // 1️⃣ Validate request
    if (!tenantId || !userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 2️⃣ Get employeeId from User table
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
      },
      select: {
        employeeId: true,
        workEmail: true,
      },

    });

    let employeeId = user?.employeeId;

    // Fallback: Try to find employee by email if not linked
    if (!employeeId && user?.workEmail) {
      const employee = await prisma.employee.findFirst({
        where: {
          tenantId,
        
        },
        select: { id: true },
      });

      if (employee) {
        employeeId = employee.id;
        // Auto-link for future
        await prisma.user.update({
          where: { id: userId },
          data: { employeeId: employee.id },
        });
      }
    }

    if (!employeeId) {
      return res.status(404).json({
        success: false,
        message: "Employee not linked to this user",
      });
    }

    // 3️⃣ Get leave types
    const leaveTypes = await prisma.leaveType.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
      },
    });

    // ✨ NEW: Get total allocations for the current year
    const currentYearStart = new Date(new Date().getFullYear(), 0, 1);
    const allocations = await prisma.leaveLedger.groupBy({
      by: ["leaveTypeId"],
      where: {
        tenantId,
        employeeId,
        units: {
          gt: 0,
        },
        transactionDate: {
          gte: currentYearStart,
        },
      },
      _sum: {
        units: true,
      },
    });

    const allocationMap = new Map(
      allocations.map((a) => [a.leaveTypeId, a._sum.units || 0])
    );

    // ✨ NEW: Get pending leave requests to calculate provisional balance
    const pendingLeaves = await prisma.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId,
        status: "PENDING",
      },
      select: {
        leaveTypeId: true,
        totalUnits: true,
      },
    });

    const pendingUnitsMap = new Map<string, Prisma.Decimal>();
    for (const leave of pendingLeaves) {
      const current =
        pendingUnitsMap.get(leave.leaveTypeId) || new Prisma.Decimal(0);
      pendingUnitsMap.set(leave.leaveTypeId, current.plus(leave.totalUnits));
    }

    // 4️⃣ Get latest ledger for each leave type
    const balances = await Promise.all(
      leaveTypes.map(async (leaveType) => {
        const lastLedger = await prisma.leaveLedger.findFirst({
          where: {
            tenantId,
            employeeId,
            leaveTypeId: leaveType.id,
          },
          orderBy: [
            { transactionDate: "desc" },
            { createdAt: "desc" },
          ],
        });

        const allocatedSum = allocationMap.get(leaveType.id);
        // The sum can be a Decimal object or 0. Ensure it's a number.
        const totalAllocation = allocatedSum ? Number(allocatedSum.toString()) : 0;

        const ledgerBalance = lastLedger
          ? new Prisma.Decimal(lastLedger.balanceAfter)
          : new Prisma.Decimal(0);

        const pendingUnits =
          pendingUnitsMap.get(leaveType.id) || new Prisma.Decimal(0);
        const finalBalance = ledgerBalance.minus(pendingUnits);

        return {
          employeeId,
          leaveTypeId: leaveType.id,
          leaveTypeName: leaveType.name,
          balance: Number(finalBalance.toString()),
          total: totalAllocation,
        };
      })
    );

    // 5️⃣ Response
    return res.status(200).json({
      success: true,
      employeeId,
      data: balances,
    });

  } catch (error: any) {
    console.error("Leave Balance Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};