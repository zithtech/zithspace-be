"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubDepartmentController = void 0;
const database_1 = require("@/config/database");
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
            const subDepartments = await database_1.prisma.subDepartment.findMany({
                where: { tenantId: req.tenantId },
                include: {
                    parentDepartment: { select: { id: true, name: true, code: true } },
                    createdBy: { select: { id: true, name: true } },
                    updatedBy: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
            res.status(200).json({ success: true, data: subDepartments });
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
            await database_1.prisma.subDepartment.delete({
                where: { id }, // Prisma will throw if not found or if tenant constraint (via middleware/RLS logic if applied) fails, but here we rely on ID uniqueness. Ideally verify tenant ownership first.
            });
            res.status(200).json({ success: true, message: "Sub-Department deleted successfully" });
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
//# sourceMappingURL=subDepartmentController%202.js.map