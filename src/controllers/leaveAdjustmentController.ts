import { Request, Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

// const prisma = new PrismaClient(); // This is inefficient. Use the shared prisma instance.

export const createLeaveAdjustment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const createdById = req.user?.id;

    if (!tenantId || !createdById) {
      return res.status(401).json({ error: "Unauthorized or missing tenant context" });
    }

    const {
      userId,
      leaveType,
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
      return res.status(400).json({ error: "A valid, non-negative amount is required." });
    }

    const leaveAdjustment = await prisma.leaveAdjustment.create({
      data: {
        tenantId,
        userId,
        leaveType,
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

    res.status(201).json({
      success: true,
      data: leaveAdjustment,
      message: "Leave adjustment created successfully",
    });
  } catch (error) {
    console.error("Error creating leave adjustment:", error);
    res.status(500).json({
      error: "Failed to create leave adjustment",
      ...(process.env.NODE_ENV === "development" && {
        details: error instanceof Error ? error.message : String(error),
      }),
    });
  }
};

export const getLeaveAdjustments = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized or missing tenant context" });
    }

    const leaveAdjustments = await prisma.leaveAdjustment.findMany({
      where: {
        tenantId: tenantId,
      },
      include: {
        user: {
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

    res.status(200).json({ success: true, data: leaveAdjustments });
  } catch (error) {
    console.error("Error fetching leave adjustments:", error);
    res.status(500).json({
      error: "Failed to fetch leave adjustments",
      ...(process.env.NODE_ENV === "development" && {
        details: error instanceof Error ? error.message : String(error),
      }),
    });
  }
};

export const updateLeaveAdjustment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const updatedById = req.user?.id;

    const { id } = req.params;
    const {
      leaveType,
      adjustmentType,
      amount,
      unit,
      reason,
      approvedById,
      compOffWorkDate,
      expiryDate,
    } = req.body;

    if (!tenantId || !updatedById) {
      return res.status(401).json({ error: "Unauthorized or missing tenant context" });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ error: "A valid, non-negative amount is required." });
    }

    // Ensure the record belongs to the tenant before updating
    const existingAdjustment = await prisma.leaveAdjustment.findFirst({
      where: { id, tenantId },
    });

    if (!existingAdjustment) {
      return res.status(404).json({ error: "Leave adjustment not found." });
    }

    const leaveAdjustment = await prisma.leaveAdjustment.update({
      where: { id },
      data: {
        leaveType,
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

    res.status(200).json({
      success: true,
      data: leaveAdjustment,
      message: "Leave adjustment updated successfully",
    });
  } catch (error) {
    console.error("Error updating leave adjustment:", error);
    res.status(500).json({
      error: "Failed to update leave adjustment",
      ...(process.env.NODE_ENV === "development" && {
        details: error instanceof Error ? error.message : String(error),
      }),
    });
  }
};

export const deleteLeaveAdjustment = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized or missing tenant context" });
    }

    // Ensure the record belongs to the tenant before deleting
    const existingAdjustment = await prisma.leaveAdjustment.findFirst({
      where: { id, tenantId },
    });

    if (!existingAdjustment) {
      return res.status(404).json({ error: "Leave adjustment not found." });
    }

    await prisma.leaveAdjustment.delete({
      where: { id },
    });

    res
      .status(200)
      .json({ success: true, message: "Leave adjustment deleted successfully" });
  } catch (error) {
    console.error("Error deleting leave adjustment:", error);
    res.status(500).json({
      error: "Failed to delete leave adjustment",
      ...(process.env.NODE_ENV === "development" && {
        details: error instanceof Error ? error.message : String(error),
      }),
    });
  }
};