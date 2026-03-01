import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

// Helper to map DB fields to API response format
const mapResponse = (settings: any) => {
  if (!settings) return null;
  return {
    ...settings,
    employeeCodePrefix: settings.employeePrefix, // Map DB 'employeePrefix' to frontend 'employeeCodePrefix'
  };
};

// ✅ CREATE Employee Settings
export const createEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    const { employeeCodePrefix } = req.body;

    // Check if already exists for tenant
    const existing = await prisma.employeeSetting.findFirst({
      where: { tenantId: req.tenantId },
    });

    if (existing) {
      return res.status(400).json({
        message: "Employee settings already exist for this tenant",
      });
    }
    console.log("Creating Employee Settings with prefix:", employeeCodePrefix);

    const settings = await prisma.employeeSetting.create({
      data: {
        tenantId: req.tenantId,
        // createdById: req.user.id,
        // updatedById: req.user.id,
        employeePrefix: employeeCodePrefix || "EMP",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Employee settings created successfully",
      data: mapResponse(settings),
    });
  } catch (error) {
    console.error("Create Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ GET Employee Settings (Single per tenant)
export const getEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    let settings = await prisma.employeeSetting.findFirst({
      where: { tenantId: req.tenantId },
    });

    if (!settings) {
      // If settings don't exist, create default "EMP" record
      // This ensures there is always one record and we don't need explicit create logic in frontend
      settings = await prisma.employeeSetting.create({
        data: {
          tenantId: req.tenantId,
          employeePrefix: "EMP",
        },
      });
    }

    // Standardized response format
    return res.status(200).json({
      success: true,
      data: mapResponse(settings),
    });
  } catch (error) {
    console.error("Get Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ UPDATE Employee Settings
export const updateEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    const { employeeCodePrefix } = req.body;

    const existing = await prisma.employeeSetting.findFirst({
      where: { tenantId: req.tenantId },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Employee settings not found",
      });
    }

    const updated = await prisma.employeeSetting.update({
      where: { id: existing.id },
      data: {
        employeePrefix: employeeCodePrefix || "EMP",
        // updatedById: req.user.id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Employee settings updated successfully",
      data: mapResponse(updated),
    });
  } catch (error) {
    console.error("Update Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ DELETE Employee Settings
export const deleteEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    const existing = await prisma.employeeSetting.findFirst({
      where: { tenantId: req.tenantId },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Employee settings not found",
      });
    }

    await prisma.employeeSetting.delete({
      where: { id: existing.id },
    });

    return res.status(200).json({
      success: true,
      message: "Employee settings deleted successfully",
    });
  } catch (error) {
    console.error("Delete Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
