
import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

class ReimbursementCategoryController {

  // ==============================
  // CREATE CATEGORY
  // ==============================
  async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const {
        code,
        name,
        description,
        maxRequestsPerMonth,
        monthlyLimitAmount,
        yearlyLimitAmount,
        allowedRoles,
        approvalFlow,
        attachmentRequired,
        autoApproveUnderAmount,
        isActive,
      } = req.body;

      if (!code || !name || !allowedRoles || !approvalFlow) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
        return;
      }

      const category = await prisma.reimbursementCategory.create({
        data: {
          tenantId,
          code,
          name,
          description,

          maxRequestsPerMonth,
          monthlyLimitAmount,
          yearlyLimitAmount,

          allowedRoles,
          approvalFlow,

          attachmentRequired: attachmentRequired ?? false,
          autoApproveUnderAmount,

          isActive: isActive ?? true,

          createdBy: userId,
          updatedBy: userId,
        },
      });

      res.status(201).json({
        success: true,
        message: "Reimbursement category created successfully",
        data: category,
      });
    } catch (error: any) {
      console.error("Create reimbursement category error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // GET ALL CATEGORIES
  // ==============================
  async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;

      const categories = await prisma.reimbursementCategory.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error: any) {
      console.error("Get reimbursement categories error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // GET CATEGORY BY ID
  // ==============================
  async getCategoryById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const category = await prisma.reimbursementCategory.findFirst({
        where: {
          id,
          tenantId,
        },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: category,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // UPDATE CATEGORY
  // ==============================
  async updateCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { id } = req.params;

      const existing = await prisma.reimbursementCategory.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      const updated = await prisma.reimbursementCategory.update({
        where: { id },
        data: {
          code: req.body.code,
          name: req.body.name,
          description: req.body.description,

          maxRequestsPerMonth: req.body.maxRequestsPerMonth,
          monthlyLimitAmount: req.body.monthlyLimitAmount,
          yearlyLimitAmount: req.body.yearlyLimitAmount,

          allowedRoles: req.body.allowedRoles,
          approvalFlow: req.body.approvalFlow,

          attachmentRequired: req.body.attachmentRequired,
          autoApproveUnderAmount: req.body.autoApproveUnderAmount,

          isActive: req.body.isActive,

          updatedBy: userId,
        },
      });

      res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("Update reimbursement category error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // ==============================
  // DELETE (SOFT DELETE)
  // ==============================
  async deleteCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { id } = req.params;

      const category = await prisma.reimbursementCategory.findFirst({
        where: { id, tenantId },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      await prisma.reimbursementCategory.update({
        where: { id },
        data: {
          isActive: false,
          updatedBy: userId,
        },
      });

      res.status(200).json({
        success: true,
        message: "Category deactivated successfully",
      });
    } catch (error: any) {
      console.error("Delete reimbursement category error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new ReimbursementCategoryController();

