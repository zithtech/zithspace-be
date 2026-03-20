
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
        max_per_request,
        monthly_limit,
        yearly_limit,
        eligible_roles,
        approval_flow,
        attachment_required,
        auto_approve_under_amount,
        is_active,
      } = req.body;

      if (!code || !name || !eligible_roles || !approval_flow) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
        return;
      }

      const category = await prisma.reimbursement_categories.create({
        data: {
          tenant_id,
          code,
          name,
          description,

          max_per_request,
          monthly_limit,
          yearly_limit,

          eligible_roles,
          approval_flow,

          attachment_required: attachment_required ?? false,
          auto_approve_under_amount,

          is_active: isActive ?? true,

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

      const categories = await prisma.reimbursement_categories.findMany({
        where: {
          tenant_id,
          is_active: true,
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

      const category = await prisma.reimbursement_categories.findFirst({
        where: {
          id,
          tenant_id,
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

      const existing = await prisma.reimbursement_categories.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      const updated = await prisma.reimbursement_categories.update({
        where: { id },
        data: {
          code: req.body.code,
          name: req.body.name,
          description: req.body.description,

          max_per_request: req.body.max_per_request,
          monthly_limit: req.body.monthly_limit,
          yearly_limit: req.body.yearly_limit,

          eligible_roles: req.body.eligible_roles,
          approval_flow: req.body.approval_flow,

          attachment_required: req.body.attachment_required,
          auto_approve_under_amount: req.body.auto_approve_under_amount,

          is_active: req.body.is_active,

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

      const category = await prisma.reimbursement_categories.findFirst({
        where: { id, tenantId },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          error: "Category not found",
        });
        return;
      }

      await prisma.reimbursement_categories.update({
        where: { id },
        data: {
          is_active: false,
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

