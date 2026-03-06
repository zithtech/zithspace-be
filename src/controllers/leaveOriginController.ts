// src/controllers/leaveOriginController.ts
import { Request, Response } from "express";
import { prisma } from "@/config/database";

// Create Leave Origin Structure
export const createLeaveOriginStructure = async (req: Request, res: Response) => {
  try {
    const { origin, subOriginId, leaveTypes } = req.body;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    const leaveOrigin = await prisma.leaveOriginStructure.create({
      data: {
        tenantId,
        origin,
        subOriginId,
        createdById: userId || "system",
        leaveTypes: {
          create: Array.isArray(leaveTypes) ? leaveTypes.map((type: any) => ({
            tenantId,
            leaveTypeId: type.leaveTypeId,
            unit: type.unit,
            period: type.period,
            carryForward: type.carryForward ?? false,
            status: type.status || "Active",
            createdById: userId || "system",
          })) : [],
        },
      },
      include: {
        leaveTypes: {
          include: { leaveType: true },
        },
      },
    });

    res.status(201).json({ success: true, data: leaveOrigin });
  } catch (error: any) {
    console.error("Error creating leave origin structure:", error);
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: "Configuration already exists for this Origin and Sub-Origin." });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update Leave Origin Structure (Bulk update/create leave types)
export const updateLeaveOriginStructure = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { leaveTypes } = req.body;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    const existingStructure = await prisma.leaveOriginStructure.findFirst({
      where: { id, tenantId },
    });

    if (!existingStructure) {
      return res.status(404).json({ success: false, error: "Structure not found" });
    }

    // 1. Identify leave types to delete (present in DB but missing in payload)
    const existingLeaveTypes = await prisma.originLeaveType.findMany({
      where: { leaveOriginId: id, tenantId },
      select: { id: true },
    });

    const existingIds = existingLeaveTypes.map((lt) => lt.id);
    const payloadIds = (leaveTypes || [])
      .filter((type: any) => type.id)
      .map((type: any) => type.id);

    const idsToDelete = existingIds.filter((id) => !payloadIds.includes(id));

    const upsertOperations = (leaveTypes || []).map((type: any) => {
      if (type.id) {
        // Update existing leave type
        return prisma.originLeaveType.update({
          where: { id: type.id },
          data: {
            leaveTypeId: type.leaveTypeId,
            unit: type.unit,
            period: type.period,
            carryForward: type.carryForward ?? false,
            status: type.status || "Active",
            updatedById: userId || "system",
          },
        });
      } else {
        // Create new leave type
        return prisma.originLeaveType.create({
          data: {
            tenantId,
            leaveOriginId: id,
            leaveTypeId: type.leaveTypeId,
            unit: type.unit,
            period: type.period,
            carryForward: type.carryForward ?? false,
            status: type.status || "Active",
            createdById: userId || "system",
          },
        });
      }
    });

    const deleteOperations = idsToDelete.map((deleteId) =>
      prisma.originLeaveType.delete({
        where: { id: deleteId },
      })
    );

    await prisma.$transaction([...deleteOperations, ...upsertOperations]);

    const updatedStructure = await prisma.leaveOriginStructure.findUnique({
      where: { id },
      include: {
        leaveTypes: {
          include: { leaveType: true },
        },
      },
    });

    res.status(200).json({ success: true, data: updatedStructure });
  } catch (error: any) {
    console.error("Error updating leave origin structure:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create Origin Leave Type
export const createOriginLeaveType = async (req: Request, res: Response) => {
  try {
    const { leaveOriginId, leaveTypeId, unit, period, carryForward, status } = req.body;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!leaveOriginId) {
      return res.status(400).json({ success: false, error: "leaveOriginId is required" });
    }

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    // Verify the parent structure exists and belongs to the tenant
    const parentStructure = await prisma.leaveOriginStructure.findUnique({
      where: { id: leaveOriginId },
    });

    if (!parentStructure || parentStructure.tenantId !== tenantId) {
      return res.status(404).json({ success: false, error: `Leave Origin Structure not found for ID: ${leaveOriginId}` });
    }

    const originLeaveType = await prisma.originLeaveType.create({
      data: {
        tenantId,
        leaveOriginId,
        leaveTypeId,
        unit,
        period,
        carryForward,
        status,
        createdById: userId || "system",
      },
    });

    res.status(201).json({ success: true, data: originLeaveType });
  } catch (error: any) {
    console.error("Error creating origin leave type:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all Leave Origin Structures with their types
export const getAllLeaveOrigins = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    const leaveOrigins = await prisma.leaveOriginStructure.findMany({
      where: { tenantId },
      include: {
        leaveTypes: {
          include: { leaveType: true },
        },
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: leaveOrigins });
  } catch (error: any) {
    console.error("Error fetching leave origins:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete Leave Origin Structure
export const deleteLeaveOriginStructure = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    // Using deleteMany ensures we only delete if it belongs to the tenant
    const result = await prisma.leaveOriginStructure.deleteMany({
      where: {
        id: id,
        tenantId: tenantId,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ success: false, error: "Structure not found or access denied" });
    }

    res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting leave origin structure:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete Origin Leave Type
export const deleteOriginLeaveType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = (req as any).tenantId;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    const result = await prisma.originLeaveType.deleteMany({
      where: {
        id: id,
        tenantId: tenantId,
      },
    });

    if (result.count === 0) {
      return res.status(404).json({ success: false, error: "Leave type not found or access denied" });
    }

    res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting origin leave type:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update Origin Leave Type
export const updateOriginLeaveType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { leaveTypeId, unit, period, carryForward, status, leaveOriginId } = req.body;
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    const existing = await prisma.originLeaveType.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: "Leave type not found" });
    }

    const updated = await prisma.originLeaveType.update({
      where: { id },
      data: {
        leaveTypeId,
        unit,
        period,
        carryForward,
        status,
        leaveOriginId,
        updatedById: userId || "system",
      },
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Error updating origin leave type:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
