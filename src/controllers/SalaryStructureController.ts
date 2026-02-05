import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class SalaryStructureController {
  /** =========================
   * GET ALL SALARY STRUCTURES
   ========================== */
  static async getSalaryStructures(req: AuthRequest, res: Response) {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { isActive, visibility, search } = req.query;

    const where: any = {
      tenantId: req.tenantId,
    };

    if (isActive === "true") where.isActive = true;
    if (isActive === "false") where.isActive = false;

    if (visibility) where.visibility = visibility;

    if (search) {
      where.name = {
        contains: search as string,
        mode: "insensitive",
      };
    }

    const [data, total] = await Promise.all([
      prisma.salaryStructure.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          earnings: true,
          deductions: true,
        },
      }),
      prisma.salaryStructure.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        current: page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    } as ApiResponse);
  }

  /** =========================
   * GET SALARY STRUCTURE BY ID
   ========================== */
  static async getSalaryStructureById(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid salary structure id");

    const structure = await prisma.salaryStructure.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
      include: {
        earnings: true,
        deductions: true,
      },
    });

    if (!structure) {
      throw new NotFoundError("Salary structure not found");
    }

    res.json({
      success: true,
      data: structure,
    } as ApiResponse);
  }

  /** =========================
   * CREATE SALARY STRUCTURE
   ========================== */
  static async createSalaryStructure(req: AuthRequest, res: Response) {
    const {
      name,
      description,
      grossSalary,
      deductionsEnabled,
      visibility,
      companyId,
      roleId,
      earnings,
      deductions,
    } = req.body;

    if (!name) throw new ValidationError("Structure name is required");
    if (!grossSalary) throw new ValidationError("Gross salary is required");

    const exists = await prisma.salaryStructure.findFirst({
      where: {
        tenantId: req.tenantId,
        name,
      },
    });

    if (exists) {
      throw new ValidationError("Salary structure already exists");
    }

   // Controller update snippet for safer mapping
const structure = await prisma.salaryStructure.create({
  data: {
    tenantId: req.tenantId!,
    name,
    description,
    grossSalary: Number(grossSalary),
    deductionsEnabled: Boolean(deductionsEnabled),
    visibility,
    companyId: companyId ? Number(companyId) : null,
    roleId: roleId ? Number(roleId) : null,
    isActive: false,
    createdById: req.user!.id,
    earnings: {
      create: earnings?.map((e: any) => ({
        name: e.name,
        percentage: Number(e.percentage),
        description: e.description,
      })) || [],
    },
    deductions: {
      create: deductions?.map((d: any) => ({
        name: d.name,
        type: d.type,
        value: Number(d.value),
      })) || [],
    },
  },
  include: { earnings: true, deductions: true },
});

    res.status(201).json({
      success: true,
      data: structure,
      message: "Salary structure created successfully",
    } as ApiResponse);
  }

  /** =========================
   * UPDATE SALARY STRUCTURE
   ========================== */
  static async updateSalaryStructure(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid salary structure id");

    const existing = await prisma.salaryStructure.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!existing) {
      throw new NotFoundError("Salary structure not found");
    }

   const {
  name,
  description,
  grossSalary,
  deductionsEnabled,
  visibility,
  companyId,
  roleId,
  earnings,
  deductions,
  isActive, // ✅ ADD HERE
} = req.body;


    // 🔥 easiest & safest: delete children and recreate
    await prisma.earning.deleteMany({
      where: { salaryStructureId: id },
    });

    await prisma.deduction.deleteMany({
      where: { salaryStructureId: id },
    });

    const updated = await prisma.salaryStructure.update({
  where: { id },
  data: {
    name,
    description,
    grossSalary,
    deductionsEnabled,
    visibility,
    companyId,
    roleId,
    isActive: isActive ?? existing.isActive, // ✅ FIX
    updatedById: req.user!.id,

    earnings: {
      create: earnings?.map((e: any) => ({
        name: e.name,
        percentage: e.percentage,
        description: e.description,
      })),
    },

    deductions: {
      create: deductions?.map((d: any) => ({
        name: d.name,
        type: d.type,
        value: d.value,
      })),
    },
  },
  include: {
    earnings: true,
    deductions: true,
  },
});


    res.json({
      success: true,
      data: updated,
      message: "Salary structure updated successfully",
    } as ApiResponse);
  }

  /** =========================
   * TOGGLE ACTIVE (MULTI ACTIVE)
   ========================== */
  static async toggleActive(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid salary structure id");

    const structure = await prisma.salaryStructure.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!structure) {
      throw new NotFoundError("Salary structure not found");
    }

    const updated = await prisma.salaryStructure.update({
      where: { id },
      data: {
        isActive: !structure.isActive,
        updatedById: req.user!.id,
      },
    });

    res.json({
      success: true,
      data: updated,
      message: updated.isActive
        ? "Salary structure activated"
        : "Salary structure deactivated",
    } as ApiResponse);
  }


  /** =========================
 * DELETE SALARY STRUCTURE
 ========================== */
static async deleteSalaryStructure(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  if (!id) throw new ValidationError("Invalid salary structure id");

  const structure = await prisma.salaryStructure.findFirst({
    where: {
      id,
      tenantId: req.tenantId,
    },
  });

  if (!structure) {
    throw new NotFoundError("Salary structure not found");
  }

  // ❌ Block delete if active
  if (structure.isActive) {
    throw new ValidationError("Active salary structure cannot be deleted");
  }

  // 🔥 Delete children first (safe for FK constraints)
  await prisma.earning.deleteMany({
    where: { salaryStructureId: id },
  });

  await prisma.deduction.deleteMany({
    where: { salaryStructureId: id },
  });

  // 🔥 Delete parent
  await prisma.salaryStructure.delete({
    where: { id },
  });

  res.json({
    success: true,
    message: "Salary structure deleted successfully",
  } as ApiResponse);
}

}
