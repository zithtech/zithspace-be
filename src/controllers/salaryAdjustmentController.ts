import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

export class SalaryAdjustmentController {
  // ✅ ADD/UPDATE Salary Adjustment
  static async upsertAdjustment(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { id, employeeId, month, year, type, label, amount } = req.body;
      
      console.log("SalaryAdjustmentController: UPSERT", { id, tenantId, employeeId, month, year, type, label, amount });

      if (!employeeId || !month || !year || !type || !label || amount === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields: employeeId, month, year, type, label, amount" 
        });
      }

      let adjustment;
      if (id) {
        // UPDATE existing
        adjustment = await prisma.salaryAdjustment.update({
          where: { id, tenantId: tenantId! },
          data: {
            type,
            label,
            amount: Number(amount),
            month: Number(month),
            year: Number(year)
          }
        });
      } else {
        // CREATE new
        adjustment = await prisma.salaryAdjustment.create({
          data: {
            tenantId: tenantId!,
            employeeId,
            month: Number(month),
            year: Number(year),
            type,
            label,
            amount: Number(amount)
          }
        });
      }

      res.status(id ? 200 : 201).json({ 
        success: true, 
        data: adjustment,
        message: id ? "Salary adjustment updated successfully" : "Salary adjustment added successfully" 
      });
    } catch (err: any) {
      console.error("Upsert Adjustment Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ GET Adjustments (Optional Employee Filter)
  static async getAdjustments(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { employeeId, month, year } = req.query;

      console.log("SalaryAdjustmentController: GET", { tenantId, employeeId, month, year });

      if (!month || !year) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing required query params: month, year" 
        });
      }

      const where: any = {
        tenantId: tenantId!,
        month: Number(month),
        year: Number(year)
      };

      if (employeeId) {
        where.employeeId = employeeId as string;
      }

      const adjustments = await prisma.salaryAdjustment.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({ 
        success: true, 
        data: adjustments 
      });
    } catch (err: any) {
      console.error("Get Adjustments Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ DELETE Salary Adjustment
  static async deleteAdjustment(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { id } = req.params;

      const adjustment = await prisma.salaryAdjustment.findFirst({
        where: { id, tenantId }
      });

      if (!adjustment) {
        return res.status(404).json({ success: false, error: "Adjustment not found" });
      }

      await prisma.salaryAdjustment.delete({
        where: { id }
      });

      res.status(200).json({ 
        success: true, 
        message: "Adjustment deleted successfully" 
      });
    } catch (err: any) {
      console.error("Delete Adjustment Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ BULK ADD Salary Adjustments
  static async bulkAdjustment(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { employeeIds, month, year, type, label, amount } = req.body;

      console.log("SalaryAdjustmentController: BULK", { tenantId, employeeCount: employeeIds?.length, month, year, type, label, amount });

      if (!employeeIds || !Array.isArray(employeeIds) || !month || !year || !type || !label || amount === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields: employeeIds (array), month, year, type, label, amount" 
        });
      }

      const results = await prisma.salaryAdjustment.createMany({
        data: employeeIds.map((empId: string) => ({
          tenantId: tenantId!,
          employeeId: empId,
          month: Number(month),
          year: Number(year),
          type,
          label,
          amount: Number(amount)
        }))
      });

      res.status(201).json({ 
        success: true, 
        message: `${results.count} adjustments added successfully`,
        data: results 
      });
    } catch (err: any) {
      console.error("Bulk Adjustment Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
