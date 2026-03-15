import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class FixedHolidayController {
  static async createFixedHoliday(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res
          .status(400)
          .json({
            success: false,
            error: "Tenant context missing",
          } as ApiResponse);
        return;
      }

      const { holidayName, country, state, fromDate, toDate, type, rule } =
        req.body;

      if (!holidayName || !country || !fromDate || !toDate || !type || !rule) {
        res
          .status(400)
          .json({
            success: false,
            error: "Missing required fields",
          } as ApiResponse);
        return;
      }

      const fixedHoliday = await prisma.fixedHoliday.create({
        data: {
          tenantId: req.tenantId,
          holidayName,
          country,
          state, // Prisma handles String[] automatically
          fromDate: new Date(fromDate),
          toDate: new Date(toDate),
          type,
          rule,
        },
      });

      res
        .status(201)
        .json({
          success: true,
          data: fixedHoliday,
          message: "Holiday created successfully",
        } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating fixed holiday:", error);
      res
        .status(500)
        .json({
          success: false,
          error: "Failed to create fixed holiday",
        } as ApiResponse);
    }
  }

  static async getFixedHolidays(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res
          .status(400)
          .json({
            success: false,
            error: "Tenant context missing",
          } as ApiResponse);
        return;
      }

      const holidays = await prisma.fixedHoliday.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { fromDate: "asc" },
      });

      res.status(200).json({ success: true, data: holidays } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching fixed holidays:", error);
      res
        .status(500)
        .json({
          success: false,
          error: "Failed to fetch fixed holidays",
        } as ApiResponse);
    }
  }

  static async getFixedHolidayById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res
          .status(400)
          .json({
            success: false,
            error: "Tenant context missing",
          } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const holiday = await prisma.fixedHoliday.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!holiday) {
        res
          .status(404)
          .json({
            success: false,
            error: "Fixed holiday not found",
          } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: holiday } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching fixed holiday:", error);
      res
        .status(500)
        .json({
          success: false,
          error: "Failed to fetch fixed holiday",
        } as ApiResponse);
    }
  }

  static async updateFixedHoliday(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res
          .status(400)
          .json({
            success: false,
            error: "Tenant context missing",
          } as ApiResponse);
        return;
      }
      const { id } = req.params;
      const { holidayName, country, state, fromDate, toDate, type, rule } =
        req.body;

      // Verify existence and ownership
      const existing = await prisma.fixedHoliday.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res
          .status(404)
          .json({
            success: false,
            error: "Fixed holiday not found",
          } as ApiResponse);
        return;
      }

      const updatedHoliday = await prisma.fixedHoliday.update({
        where: { id },
        data: {
          holidayName,
          country,
          state,
          fromDate: fromDate ? new Date(fromDate) : undefined,
          toDate: toDate ? new Date(toDate) : undefined,
          type,
          rule,
        },
      });

      res
        .status(200)
        .json({
          success: true,
          data: updatedHoliday,
          message: "Holiday updated successfully",
        } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating fixed holiday:", error);
      res
        .status(500)
        .json({
          success: false,
          error: "Failed to update fixed holiday",
        } as ApiResponse);
    }
  }

  static async deleteFixedHoliday(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res
          .status(400)
          .json({
            success: false,
            error: "Tenant context missing",
          } as ApiResponse);
        return;
      }
      const { id } = req.params;

      const existing = await prisma.fixedHoliday.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res
          .status(404)
          .json({
            success: false,
            error: "Fixed holiday not found",
          } as ApiResponse);
        return;
      }

      await prisma.fixedHoliday.delete({
        where: { id },
      });

      res
        .status(200)
        .json({
          success: true,
          message: "Fixed holiday deleted successfully",
        } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting fixed holiday:", error);
      res
        .status(500)
        .json({
          success: false,
          error: "Failed to delete fixed holiday",
        } as ApiResponse);
    }
  }
}
