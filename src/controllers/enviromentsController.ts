import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse, NotFoundError, ValidationError } from "@/types";

export class EnviromentsController {

  /**
   * Get all environments (tenant-aware)
   */
  static async getEnviroments(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { page = 1, limit = 20, status, search } = req.query;

      const where: any = {
        tenantId: req.tenantId,
      };

      if (status && status !== "all") where.status = status;

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { code: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [data, total] = await Promise.all([
        prisma.enviroments.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.enviroments.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      } as ApiResponse);

    } catch (error) {
      console.error("Get environments error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch environments",
      } as ApiResponse);
    }
  }

  /**
   * Create environment
   */
  static async createEnviroment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { name, code, status } = req.body;

      if (!name || !code) {
        throw new ValidationError("Name and code are required");
      }

      const existing = await prisma.enviroments.findFirst({
        where: {
          tenantId: req.tenantId,
          code: code.toUpperCase(),
        },
      });

      if (existing) {
        throw new ValidationError("Environment code already exists in this tenant");
      }

      const newEnv = await prisma.enviroments.create({
        data: {
          tenantId: req.tenantId,
          name,
          code: code.toUpperCase(),
          status: status || "ACTIVE",
          createdBy: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: newEnv,
        message: "Environment created successfully",
      } as ApiResponse);

    } catch (error: any) {
      console.error("Create environment error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create environment",
      } as ApiResponse);
    }
  }

  /**
   * Update environment
   */
  static async updateEnviroment(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { name, code, status } = req.body;

      const existing = await prisma.enviroments.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        throw new NotFoundError("Environment not found");
      }

      const updated = await prisma.enviroments.update({
        where: { id },
        data: {
          name,
          code: code?.toUpperCase(),
          status,
          updatedBy: req.user.id,
          updatedAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Environment updated successfully",
      } as ApiResponse);

    } catch (error: any) {
      console.error("Update environment error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to update environment",
      } as ApiResponse);
    }
  }

  /**
   * Delete environment (hard delete via status)
   */
static async deleteEnviroment(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;

    const existing = await prisma.enviroments.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!existing) {
      throw new NotFoundError("Environment not found");
    }

    // 🔥 HARD DELETE
    await prisma.enviroments.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Environment permanently deleted",
    } as ApiResponse);

  } catch (error: any) {
    console.error("Delete environment error:", error);

    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      } as ApiResponse);
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to delete environment",
    } as ApiResponse);
  }
}

  /**
 * Get single environment by ID
 */
static async getEnviromentById(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;

    const env = await prisma.enviroments.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!env) {
      throw new NotFoundError("Environment not found");
    }

    res.status(200).json({
      success: true,
      data: env,
    } as ApiResponse);

  } catch (error: any) {
    console.error("Get environment by id error:", error);

    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: error.message,
      } as ApiResponse);
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch environment",
    } as ApiResponse);
  }
}

}

export default EnviromentsController;
