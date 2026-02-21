import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class SalaryComponentController {

  /** =========================
   * GET ALL COMPONENTS
   ========================== */
  // static async getSalaryComponents(req: AuthRequest, res: Response): Promise<void> {
  //   try {
  //     if (!req.tenantId) {
  //       throw new ValidationError("Tenant required");
  //     }

  //     const { search, type, status } = req.query;

  //     const where: any = {
  //       tenantId: req.tenantId,
  //     };

  //     if (type) where.type = type;
  //     if (status === "Active") where.status = true;
  //     if (status === "Inactive") where.status = false;

  //     if (search) {
  //       where.OR = [
  //         {
  //           componentName: {
  //             contains: search as string,
  //             mode: "insensitive",
  //           },
  //         },
  //         {
  //           componentCode: {
  //             contains: search as string,
  //             mode: "insensitive",
  //           },
  //         },
  //       ];
  //     }

  //     const components = await prisma.salaryComponent.findMany({
  //       where,
  //       orderBy: { createdAt: "desc" },
  //     });

  //     res.json({
  //       success: true,
  //       data: components,
  //     } as ApiResponse);

  //   } catch (error) {
  //     throw error;
  //   }
  // }
  static async getSalaryComponents(req: AuthRequest, res: Response) {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { search, type, status } = req.query;

  const where: any = { tenantId: req.tenantId };

  if (type) where.type = type;
  if (status === "Active") where.status = true;
  if (status === "Inactive") where.status = false;

  if (search) {
    where.OR = [
      { componentName: { contains: search as string, mode: "insensitive" } },
      { componentCode: { contains: search as string, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.salaryComponent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.salaryComponent.count({ where }),
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
  });
}


  /** =========================
   * GET COMPONENT BY ID
   ========================== */
  static async getSalaryComponentById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);

      if (!id) {
        throw new ValidationError("Invalid component id");
      }

      const component = await prisma.salaryComponent.findFirst({
        where: {
          key: id,
          tenantId: req.tenantId,
        },
      });

      if (!component) {
        throw new NotFoundError("Salary component not found");
      }

      res.json({
        success: true,
        data: component,
      } as ApiResponse);

    } catch (error) {
      throw error;
    }
  }

  /** =========================
   * CREATE COMPONENT
   ========================== */
  static async createSalaryComponent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { componentName, componentCode, type, status } = req.body;

      if (!componentName || !componentCode) {
        throw new ValidationError("Component name & code are required");
      }

      const existing = await prisma.salaryComponent.findFirst({
        where: {
          tenantId: req.tenantId,
          componentCode,
        },
      });

      if (existing) {
        throw new ValidationError("Component code already exists");
      }

      const component = await prisma.salaryComponent.create({
        data: {
          tenantId: req.tenantId!,
          componentName,
          componentCode,
          type,
          status,
          createdById: req.user!.id,
        },
      });

      res.status(201).json({
        success: true,
        data: component,
        message: "Salary component created successfully",
      } as ApiResponse);

    } catch (error) {
      throw error;
    }
  }

  /** =========================
   * UPDATE COMPONENT
   ========================== */
  static async updateSalaryComponent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { componentName, componentCode, type, status } = req.body;

      if (!id) {
        throw new ValidationError("Invalid component id");
      }

      const existing = await prisma.salaryComponent.findFirst({
        where: {
          key: id,
          tenantId: req.tenantId,
        },
      });

      if (!existing) {
        throw new NotFoundError("Salary component not found");
      }

      const updated = await prisma.salaryComponent.update({
        where: { key: id },
        data: {
          componentName,
          componentCode,
          type,
          status,
          updatedById: req.user!.id,
        },
      });

      res.json({
        success: true,
        data: updated,
        message: "Salary component updated successfully",
      } as ApiResponse);

    } catch (error) {
      throw error;
    }
  }

  /** =========================
   * UPDATE STATUS ONLY
   ========================== */
  static async updateSalaryStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      if (!id) {
        throw new ValidationError("Invalid component id");
      }

      if (typeof status !== "boolean") {
        throw new ValidationError("Status must be boolean");
      }

      const component = await prisma.salaryComponent.update({
        where: {
          key: id,
        },
        data: {
          status,
          updatedById: req.user!.id,
        },
      });

      res.json({
        success: true,
        data: component,
        message: "Status updated successfully",
      } as ApiResponse);

    } catch (error) {
      throw error;
    }
  }

  /** =========================
 * DELETE COMPONENT
 ========================== */
static async deleteSalaryComponent(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (!id) {
      throw new ValidationError("Invalid component id");
    }

    const existing = await prisma.salaryComponent.findFirst({
      where: {
        key: id,
        tenantId: req.tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Salary component not found");
    }

    await prisma.salaryComponent.delete({
      where: {
        key: id,
      },
    });

    res.json({
      success: true,
      message: "Salary component deleted successfully",
    } as ApiResponse);

  } catch (error) {
    throw error;
  }
}

}


