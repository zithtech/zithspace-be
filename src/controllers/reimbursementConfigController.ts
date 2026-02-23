import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class ReimbursementConfigurationController {
  /**
   * CREATE
   */
  static async createConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const {
        origin,
        subOrigin,
        categoryType,
        amount,
        period,
        status,
      } = req.body;

      if (!origin || !categoryType || !amount || !period)
        throw new ValidationError("Required fields missing");

      if (!["MONTH", "YEAR"].includes(period))
        throw new ValidationError("Period must be MONTH or YEAR");

      const config = await prisma.reimbursementConfiguration.create({
        data: {
          tenantId: req.tenantId,
          origin,
          subOrigin,
          categoryType,
          amount,
          period,
          status: status || "ACTIVE",
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: config,
      } as ApiResponse);
    } catch (error: any) {
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message,
      } as ApiResponse);
    }
  }

  /**
   * GET ALL (with calculated amount)
   */
  static async getConfigs(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const configs = await prisma.reimbursementConfiguration.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "desc" },
      });

      // 🔥 Amount calculation logic
      const calculated = configs.map((config) => {
        let yearlyAmount = 0;
        let monthlyAmount = 0;

        if (config.period === "MONTH") {
          monthlyAmount = Number(config.amount);
          yearlyAmount = Number(config.amount) * 12;
        } else if (config.period === "YEAR") {
          yearlyAmount = Number(config.amount);
          monthlyAmount = Number(config.amount) / 12;
        }

        return {
          ...config,
          monthlyAmount,
          yearlyAmount,
        };
      });

      res.status(200).json({
        success: true,
        data: calculated,
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch configurations",
      } as ApiResponse);
    }
  }

  /**
   * GET BY ID (with calculation)
   */
  static async getConfigById(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const config = await prisma.reimbursementConfiguration.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!config) throw new NotFoundError("Configuration not found");

      let yearlyAmount = 0;
      let monthlyAmount = 0;

      if (config.period === "MONTH") {
        monthlyAmount = Number(config.amount);
        yearlyAmount = Number(config.amount) * 12;
      } else if (config.period === "YEAR") {
        yearlyAmount = Number(config.amount);
        monthlyAmount = Number(config.amount) / 12;
      }

      res.status(200).json({
        success: true,
        data: {
          ...config,
          monthlyAmount,
          yearlyAmount,
        },
      } as ApiResponse);
    } catch (error: any) {
      res
        .status(error instanceof NotFoundError ? 404 : 500)
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * UPDATE
   */
  static async updateConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;
      const {
        origin,
        subOrigin,
        categoryType,
        amount,
        period,
        status,
      } = req.body;

      const existing = await prisma.reimbursementConfiguration.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) throw new NotFoundError("Configuration not found");

      if (period && !["MONTH", "YEAR"].includes(period))
        throw new ValidationError("Period must be MONTH or YEAR");

      const updated = await prisma.reimbursementConfiguration.update({
        where: { id },
        data: {
          origin,
          subOrigin,
          categoryType,
          amount,
          period,
          status,
          updatedById: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Configuration updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      res
        .status(
          error instanceof ValidationError
            ? 400
            : error instanceof NotFoundError
            ? 404
            : 500
        )
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * DELETE
   */
  static async deleteConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const existing = await prisma.reimbursementConfiguration.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) throw new NotFoundError("Configuration not found");

      await prisma.reimbursementConfiguration.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Configuration deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      res
        .status(error instanceof NotFoundError ? 404 : 500)
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }
}

export default ReimbursementConfigurationController;