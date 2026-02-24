"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("@/config/database");
class ReimbursementCategoryController {
    // ==============================
    // CREATE CATEGORY
    // ==============================
    async createCategory(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user.id;
            const { code, name, description, maxRequestsPerMonth, monthlyLimitAmount, yearlyLimitAmount, allowedRoles, approvalFlow, attachmentRequired, autoApproveUnderAmount, isActive, } = req.body;
            if (!code || !name || !allowedRoles || !approvalFlow) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            const category = await database_1.prisma.reimbursementCategory.create({
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
        }
        catch (error) {
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
    async getCategories(req, res) {
        try {
            const tenantId = req.tenantId;
            const categories = await database_1.prisma.reimbursementCategory.findMany({
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
        }
        catch (error) {
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
    async getCategoryById(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            const category = await database_1.prisma.reimbursementCategory.findFirst({
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    // ==============================
    // UPDATE CATEGORY
    // ==============================
    async updateCategory(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user.id;
            const { id } = req.params;
            const existing = await database_1.prisma.reimbursementCategory.findFirst({
                where: { id, tenantId },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Category not found",
                });
                return;
            }
            const updated = await database_1.prisma.reimbursementCategory.update({
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
        }
        catch (error) {
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
    async deleteCategory(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user.id;
            const { id } = req.params;
            const category = await database_1.prisma.reimbursementCategory.findFirst({
                where: { id, tenantId },
            });
            if (!category) {
                res.status(404).json({
                    success: false,
                    error: "Category not found",
                });
                return;
            }
            await database_1.prisma.reimbursementCategory.update({
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
        }
        catch (error) {
            console.error("Delete reimbursement category error:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
}
exports.default = new ReimbursementCategoryController();
//# sourceMappingURL=reimbursementCategoryController.js.map