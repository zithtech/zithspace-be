import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

/* =====================================================
   CREATE LEAVE ADJUSTMENT
===================================================== */

export const createLeaveAdjustment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const createdById = req.user?.id;

    if (!tenantId || !createdById) {
      return res.status(401).json({
        error: "Unauthorized or missing tenant context",
      });
    }

    const {
      userId,
      employeeId,
      leaveTypeId,
      adjustmentType,
      amount,
      unit,
      reason,
      approvedById,
      compOffWorkDate,
      expiryDate,
    } = req.body;

    const numericAmount = parseFloat(amount);

    if (isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({
        error: "Invalid amount",
      });
    }

    const result = await prisma.$transaction(async (tx) => {

      const adjustment = await tx.leaveAdjustment.create({
        data: {
          tenantId,
          userId,
          employeeId,
          leaveTypeId,
          adjustmentType,
          amount: numericAmount,
          unit,
          reason,
          approvedById,
          compOffWorkDate: compOffWorkDate ? new Date(compOffWorkDate) : null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          createdById,
        },
      });

      const lastLedger = await tx.leaveLedger.findFirst({
        where: {
          tenantId,
          employeeId,
          leaveTypeId,
        },
        orderBy: {
          transactionDate: "desc",
        },
      });

      const previousBalance = lastLedger
        ? new Prisma.Decimal(lastLedger.balanceAfter)
        : new Prisma.Decimal(0);

      const units =
        adjustmentType === "Credit"
          ? new Prisma.Decimal(numericAmount)
          : new Prisma.Decimal(numericAmount).negated();

      const newBalance = previousBalance.plus(units);

      if (newBalance.lessThan(0)) {
        throw new Error("Leave balance cannot be negative");
      }

      await tx.leaveLedger.create({
        data: {
          tenantId,
          employeeId,
          leaveTypeId,
          transactionType:
            adjustmentType === "Credit"
              ? "adjustment_credit"
              : "leave_debit",
          referenceId: adjustment.id,
          units,
          balanceAfter: newBalance,
          transactionDate: new Date(),
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          policyVersion: 1,
          createdById,
        },
      });

      return adjustment;
    });

    res.status(201).json({
      success: true,
      data: result,
      message: "Leave adjustment created successfully",
    });

  } catch (error) {
    console.error("Create Adjustment Error:", error);

    res.status(500).json({
      error: "Failed to create leave adjustment",
    });
  }
};


/* =====================================================
   GET LEAVE ADJUSTMENTS
===================================================== */

export const getLeaveAdjustments = async (req: AuthRequest, res: Response) => {
  try {

    const tenantId = req.tenantId;

    const data = await prisma.leaveAdjustment.findMany({
      where: { tenantId },
      include: {
        employee: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            employee_code: true,
          },
        },
        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },
        approvedBy: {
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

    res.json({
      success: true,
      data,
    });

  } catch (error) {
    console.error("Fetch Adjustment Error:", error);

    res.status(500).json({
      error: "Failed to fetch leave adjustments",
    });
  }
};


/* =====================================================
   UPDATE LEAVE ADJUSTMENT
===================================================== */

export const updateLeaveAdjustment = async (req: AuthRequest, res: Response) => {
  try {

    const tenantId = req.tenantId;
    const updatedById = req.user?.id;
    const { id } = req.params;

    const {
      leaveTypeId,
      adjustmentType,
      amount,
      unit,
      reason,
      approvedById,
      compOffWorkDate,
      expiryDate,
    } = req.body;

    const numericAmount = parseFloat(amount);

    const existing = await prisma.leaveAdjustment.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({
        error: "Adjustment not found",
      });
    }

    const result = await prisma.$transaction(async (tx) => {

      const lastLedger = await tx.leaveLedger.findFirst({
        where: {
          tenantId,
          employeeId: existing.employeeId,
          leaveTypeId: existing.leaveTypeId,
        },
        orderBy: {
          transactionDate: "desc",
        },
      });

      const previousBalance = lastLedger
        ? new Prisma.Decimal(lastLedger.balanceAfter)
        : new Prisma.Decimal(0);

      const oldAmount = new Prisma.Decimal(existing.amount);
      const newAmount = new Prisma.Decimal(numericAmount);

      const difference = newAmount.minus(oldAmount);

      const newBalance = previousBalance.plus(difference);

      if (newBalance.lessThan(0)) {
        throw new Error("Leave balance cannot be negative");
      }

      const updated = await tx.leaveAdjustment.update({
        where: { id },
        data: {
          leaveTypeId,
          adjustmentType,
          amount: numericAmount,
          unit,
          reason,
          approvedById,
          compOffWorkDate: compOffWorkDate ? new Date(compOffWorkDate) : null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          updatedById,
        },
      });

      await tx.leaveLedger.create({
        data: {
          tenantId,
          employeeId: existing.employeeId,
          leaveTypeId,
          transactionType:
            adjustmentType === "Credit"
              ? "adjustment_credit"
              : "leave_debit",
          referenceId: id,
          units: difference,
          balanceAfter: newBalance,
          transactionDate: new Date(),
          policyVersion: 1,
          createdById: updatedById,
        },
      });

      return updated;
    });

    res.json({
      success: true,
      data: result,
      message: "Leave adjustment updated",
    });

  } catch (error) {
    console.error("Update Adjustment Error:", error);

    res.status(500).json({
      error: "Failed to update leave adjustment",
    });
  }
};


/* =====================================================
   DELETE LEAVE ADJUSTMENT
===================================================== */

export const deleteLeaveAdjustment = async (req: AuthRequest, res: Response) => {
  try {

    const tenantId = req.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;

    const adjustment = await prisma.leaveAdjustment.findFirst({
      where: { id, tenantId },
    });

    if (!adjustment) {
      return res.status(404).json({
        error: "Adjustment not found",
      });
    }

    const result = await prisma.$transaction(async (tx) => {

      const lastLedger = await tx.leaveLedger.findFirst({
        where: {
          tenantId,
          employeeId: adjustment.employeeId,
          leaveTypeId: adjustment.leaveTypeId,
        },
        orderBy: {
          createdAt: "desc"
        },
      });

      const previousBalance = lastLedger
        ? new Prisma.Decimal(lastLedger.balanceAfter)
        : new Prisma.Decimal(0);

      if (adjustment?.adjustmentType === "Debit" && previousBalance.lessThanOrEqualTo(0)) {
        throw new Error("No leave balance available to debit");
      }

      const reverseUnits =
        adjustment.adjustmentType === "Credit"
          ? new Prisma.Decimal(adjustment.amount).negated()
          : new Prisma.Decimal(adjustment.amount);

      const newBalance = previousBalance.plus(reverseUnits);

      await tx.leaveLedger.create({
        data: {
          tenantId,
          employeeId: adjustment.employeeId,
          leaveTypeId: adjustment.leaveTypeId,
          transactionType: "reversal",
          referenceId: adjustment.id,
          units: reverseUnits,
          balanceAfter: newBalance,
          transactionDate: new Date(),
          policyVersion: 1,
          createdById: userId,
        },
      });

      await tx.leaveAdjustment.delete({
        where: { id },
      });

    });

    res.json({
      success: true,
      message: "Leave adjustment deleted successfully",
    });

  } catch (error) {
    console.error("Delete Adjustment Error:", error);

    res.status(500).json({
      error: "Failed to delete leave adjustment",
    });
  }
};