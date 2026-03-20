"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReimbursementSettingsCategoriesController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class ReimbursementSettingsCategoriesController {
    /**
     * CREATE CATEGORY
     */
    static async createCategory(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { name, code, description, // 👈 changed from maxRequestsPerMonth
            attachmentRequired, isActive, } = req.body;
            if (!name || !code)
                throw new types_1.ValidationError("Name and Code are required");
            const category = await database_1.prisma.reimbursementCategory.create({
                data: {
                    tenantId: req.tenantId,
                    name,
                    code,
                    description, // 👈 new field
                    attachmentRequired: attachmentRequired ?? false,
                    isActive: isActive ?? true,
                    createdBy: req.user.id,
                },
            });
            res.status(201).json({
                success: true,
                data: category,
            });
        }
        catch (error) {
            res.status(error instanceof types_1.ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
    /**
     * GET ALL CATEGORIES
     */
    static async getCategories(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const categories = await database_1.prisma.reimbursementCategory.findMany({
                where: { tenantId: req.tenantId },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true, // 👈 changed
                    attachmentRequired: true,
                    isActive: true,
                },
            });
            res.status(200).json({
                success: true,
                data: categories,
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to fetch categories",
            });
        }
    }
    /**
     * GET BY ID
     */
    static async getCategoryById(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const category = await database_1.prisma.reimbursementCategory.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!category)
                throw new types_1.NotFoundError("Category not found");
            res.status(200).json({
                success: true,
                data: category,
            });
        }
        catch (error) {
            res
                .status(error instanceof types_1.NotFoundError ? 404 : 500)
                .json({ success: false, error: error.message });
        }
    }
    /**
     * UPDATE CATEGORY
     */
    static async updateCategory(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const { name, code, description, // 👈 changed
            attachmentRequired, isActive, } = req.body;
            const existing = await database_1.prisma.reimbursementCategory.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing)
                throw new types_1.NotFoundError("Category not found");
            const updated = await database_1.prisma.reimbursementCategory.update({
                where: { id },
                data: {
                    name,
                    code,
                    description, // 👈 new field
                    attachmentRequired,
                    isActive,
                    updatedBy: req.user.id,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Category updated successfully",
            });
        }
        catch (error) {
            res
                .status(error instanceof types_1.ValidationError
                ? 400
                : error instanceof types_1.NotFoundError
                    ? 404
                    : 500)
                .json({ success: false, error: error.message });
        }
    }
    /**
     * DELETE CATEGORY
     */
    static async deleteCategory(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const existing = await database_1.prisma.reimbursementCategory.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing)
                throw new types_1.NotFoundError("Category not found");
            await database_1.prisma.reimbursementCategory.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Category deleted successfully",
            });
        }
        catch (error) {
            res
                .status(error instanceof types_1.NotFoundError ? 404 : 500)
                .json({ success: false, error: error.message });
        }
    }
}
exports.ReimbursementSettingsCategoriesController = ReimbursementSettingsCategoriesController;
exports.default = ReimbursementSettingsCategoriesController;
//# sourceMappingURL=reimbursementsettingsController.js.map