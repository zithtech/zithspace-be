"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepartmentController = void 0;
const database_1 = require("@/config/database");
class DepartmentController {
    // Create a new Department
    static async createDepartment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { name, code, employmentType, description, headId, isActive } = req.body;
            const createdById = req.user.id;
            if (!name || !code) {
                res.status(400).json({ success: false, error: "Name and code are required." });
                return;
            }
            // Check for duplicate code
            const existingCode = await database_1.prisma.department.findUnique({
                where: {
                    tenantId_code: {
                        tenantId: req.tenantId,
                        code,
                    },
                },
            });
            if (existingCode) {
                res.status(409).json({ success: false, error: "A department with this code already exists." });
                return;
            }
            // Check for duplicate name
            const existingName = await database_1.prisma.department.findUnique({
                where: {
                    tenantId_name: {
                        tenantId: req.tenantId,
                        name,
                    },
                },
            });
            if (existingName) {
                res.status(409).json({ success: false, error: "A department with this name already exists." });
                return;
            }
            const newDepartment = await database_1.prisma.department.create({
                data: {
                    tenantId: req.tenantId,
                    name,
                    code,
                    employmentType,
                    description,
                    headId,
                    isActive,
                    createdById,
                },
            });
            res.status(201).json({ success: true, data: newDepartment, message: "Department created successfully" });
        }
        catch (error) {
            console.error("Error creating department:", error);
            res.status(500).json({ success: false, error: "Failed to create department" });
        }
    }
    // Get all Departments for the tenant
    static async getAllDepartments(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const departments = await database_1.prisma.department.findMany({
                where: { tenantId: req.tenantId },
                orderBy: { name: "asc" },
                include: {
                    head: { select: { id: true, name: true } },
                    createdBy: { select: { id: true, name: true } },
                    updatedBy: { select: { id: true, name: true } },
                },
            });
            res.status(200).json({ success: true, data: departments });
        }
        catch (error) {
            console.error("Error fetching departments:", error);
            res.status(500).json({ success: false, error: "Failed to fetch departments" });
        }
    }
    // Get a single Department by ID
    static async getDepartmentById(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const department = await database_1.prisma.department.findFirst({
                where: { id, tenantId: req.tenantId },
                include: {
                    head: { select: { id: true, name: true } },
                },
            });
            if (!department) {
                res.status(404).json({ success: false, error: "Department not found" });
                return;
            }
            res.status(200).json({ success: true, data: department });
        }
        catch (error) {
            console.error("Error fetching department:", error);
            res.status(500).json({ success: false, error: "Failed to fetch department" });
        }
    }
    // Update a Department
    static async updateDepartment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { id } = req.params;
            const updatedById = req.user.id;
            const { name, code, employmentType, description, headId, isActive } = req.body;
            const existing = await database_1.prisma.department.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Department not found" });
                return;
            }
            // Check for duplicate code if changed
            if (code && code !== existing.code) {
                const duplicateCode = await database_1.prisma.department.findUnique({
                    where: { tenantId_code: { tenantId: req.tenantId, code } },
                });
                if (duplicateCode) {
                    res.status(409).json({ success: false, error: "A department with this code already exists." });
                    return;
                }
            }
            // Check for duplicate name if changed
            if (name && name !== existing.name) {
                const duplicateName = await database_1.prisma.department.findUnique({
                    where: { tenantId_name: { tenantId: req.tenantId, name } },
                });
                if (duplicateName) {
                    res.status(409).json({ success: false, error: "A department with this name already exists." });
                    return;
                }
            }
            const updatedDepartment = await database_1.prisma.department.update({
                where: { id },
                data: {
                    name,
                    code,
                    employmentType,
                    description,
                    headId,
                    isActive,
                    updatedById,
                },
            });
            res.status(200).json({ success: true, data: updatedDepartment, message: "Department updated successfully" });
        }
        catch (error) {
            console.error("Error updating department:", error);
            res.status(500).json({ success: false, error: "Failed to update department" });
        }
    }
    // Delete a Department
    static async deleteDepartment(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.department.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Department not found" });
                return;
            }
            await database_1.prisma.department.delete({ where: { id } });
            res.status(200).json({ success: true, message: "Department deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting department:", error);
            if (error.code === 'P2003') {
                res.status(400).json({ success: false, error: "Cannot delete department because it is in use." });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to delete department" });
        }
    }
}
exports.DepartmentController = DepartmentController;
//# sourceMappingURL=departmentController%202.js.map