"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubDepartmentController = void 0;
const database_1 = require("@/config/database");
const transactionHistory_1 = require("../utils/transactionHistory");
class SubDepartmentController {
    // Create a new sub-department
    static async createSubDepartment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { code, name, parentDepartmentId, description, isActive } = req.body;
            const createdById = req.user.id;
            if (!code || !name || !parentDepartmentId) {
                res.status(400).json({ success: false, error: "Code, Name, and Parent Department are required." });
                return;
            }
            // Check for duplicate code within tenant
            const existingCode = await database_1.prisma.subDepartment.findUnique({
                where: {
                    tenantId_code: {
                        tenantId: req.tenantId,
                        code: code.trim().toUpperCase()
                    }
                }
            });
            if (existingCode) {
                res.status(409).json({ success: false, error: "Sub-Department with this code already exists." });
                return;
            }
            const subDepartment = await database_1.prisma.subDepartment.create({
                data: {
                    tenantId: req.tenantId,
                    code: code.trim().toUpperCase(),
                    name: name.trim(),
                    parentDepartmentId,
                    description,
                    isActive: isActive !== undefined ? isActive : true,
                    createdById,
                    updatedById: createdById,
                },
            });
            res.status(201).json({ success: true, data: subDepartment, message: "Sub-Department created successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.ORG_STRUCTURE,
                page: transactionHistory_1.Page.ORG_STRUCTURE_SUB_DEPARTMENTS,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Created sub-department "${subDepartment.name}"`,
                entityType: transactionHistory_1.EntityType.ORG_SUB_DEPARTMENT,
                entityId: subDepartment.id,
                entityLabel: subDepartment.name,
                afterData: {
                    name: subDepartment.name,
                    code: subDepartment.code,
                    parentDepartmentId: subDepartment.parentDepartmentId,
                    description: subDepartment.description,
                    isActive: subDepartment.isActive,
                },
            });
        }
        catch (error) {
            console.error("Error creating sub-department:", error);
            if (error.code === 'P2003') {
                res.status(400).json({ success: false, error: "Parent Department not found." });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to create sub-department" });
        }
    }
    // Get all sub-departments
    static async getAllSubDepartments(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { page, limit, search, parentDepartmentId } = req.query;
            const pageNum = page ? parseInt(page, 10) : undefined;
            const limitNum = limit ? parseInt(limit, 10) : undefined;
            const where = { tenantId: req.tenantId };
            if (typeof search === 'string' && search.trim()) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ];
            }
            if (typeof parentDepartmentId === 'string' && parentDepartmentId.trim()) {
                where.parentDepartmentId = parentDepartmentId;
            }
            const include = {
                parentDepartment: { select: { id: true, name: true, code: true } },
                createdBy: { select: { id: true, name: true } },
                updatedBy: { select: { id: true, name: true } },
            };
            if (limitNum) {
                const skip = pageNum ? (pageNum - 1) * limitNum : 0;
                const [subDepartments, total] = await Promise.all([
                    database_1.prisma.subDepartment.findMany({
                        where,
                        include,
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: limitNum
                    }),
                    database_1.prisma.subDepartment.count({ where })
                ]);
                res.status(200).json({
                    success: true,
                    data: subDepartments,
                    pagination: {
                        total,
                        page: pageNum || 1,
                        limit: limitNum,
                        pages: Math.ceil(total / limitNum)
                    }
                });
            }
            else {
                const subDepartments = await database_1.prisma.subDepartment.findMany({
                    where,
                    include,
                    orderBy: { createdAt: 'desc' },
                });
                res.status(200).json({ success: true, data: subDepartments });
            }
        }
        catch (error) {
            console.error("Error fetching sub-departments:", error);
            res.status(500).json({ success: false, error: "Failed to fetch sub-departments" });
        }
    }
    // Get single sub-department
    static async getSubDepartmentById(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const subDepartment = await database_1.prisma.subDepartment.findFirst({
                where: { id, tenantId: req.tenantId },
                include: {
                    parentDepartment: { select: { id: true, name: true } },
                },
            });
            if (!subDepartment) {
                res.status(404).json({ success: false, error: "Sub-Department not found" });
                return;
            }
            res.status(200).json({ success: true, data: subDepartment });
        }
        catch (error) {
            console.error("Error fetching sub-department:", error);
            res.status(500).json({ success: false, error: "Failed to fetch sub-department" });
        }
    }
    // Update sub-department
    static async updateSubDepartment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { id } = req.params;
            const { name, parentDepartmentId, description, isActive } = req.body;
            const updatedById = req.user.id;
            const existing = await database_1.prisma.subDepartment.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Sub-Department not found" });
                return;
            }
            const updatedSubDepartment = await database_1.prisma.subDepartment.update({
                where: { id },
                data: {
                    name: name ? name.trim() : undefined,
                    parentDepartmentId,
                    description,
                    isActive,
                    updatedById,
                },
            });
            res.status(200).json({ success: true, data: updatedSubDepartment, message: "Sub-Department updated successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            if (existing) {
                const beforeSnap = {
                    name: existing.name,
                    parentDepartmentId: existing.parentDepartmentId,
                    description: existing.description,
                    isActive: existing.isActive,
                };
                const afterSnap = {
                    name: updatedSubDepartment.name,
                    parentDepartmentId: updatedSubDepartment.parentDepartmentId,
                    description: updatedSubDepartment.description,
                    isActive: updatedSubDepartment.isActive,
                };
                const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.ORG_STRUCTURE,
                    page: transactionHistory_1.Page.ORG_STRUCTURE_SUB_DEPARTMENTS,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Updated sub-department "${updatedSubDepartment.name}"`,
                    entityType: transactionHistory_1.EntityType.ORG_SUB_DEPARTMENT,
                    entityId: id,
                    entityLabel: updatedSubDepartment.name,
                    beforeData: before,
                    afterData: after,
                    changedFields,
                });
            }
        }
        catch (error) {
            console.error("Error updating sub-department:", error);
            if (error.code === 'P2003') {
                res.status(400).json({ success: false, error: "Parent Department not found." });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to update sub-department" });
        }
    }
    // Delete sub-department
    static async deleteSubDepartment(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.subDepartment.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Sub-Department not found" });
                return;
            }
            await database_1.prisma.subDepartment.delete({
                where: { id },
            });
            res.status(200).json({ success: true, message: "Sub-Department deleted successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.ORG_STRUCTURE,
                page: transactionHistory_1.Page.ORG_STRUCTURE_SUB_DEPARTMENTS,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Deleted sub-department "${existing.name}"`,
                entityType: transactionHistory_1.EntityType.ORG_SUB_DEPARTMENT,
                entityId: id,
                entityLabel: existing.name,
            });
        }
        catch (error) {
            console.error("Error deleting sub-department:", error);
            if (error.code === 'P2025') {
                res.status(404).json({ success: false, error: "Sub-Department not found" });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to delete sub-department" });
        }
    }
}
exports.SubDepartmentController = SubDepartmentController;
//# sourceMappingURL=subDepartmentController.js.map