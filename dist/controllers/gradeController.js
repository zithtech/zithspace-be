"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradeController = void 0;
const database_1 = require("@/config/database");
class GradeController {
    // Create a new Grade
    static async createGrade(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { name, code, codes, levelOrder, description, isActive } = req.body;
            const createdById = req.user.id;
            if (!name || !code || levelOrder === undefined) {
                res.status(400).json({ success: false, error: "Name, code, and levelOrder are required." });
                return;
            }
            const newGrade = await database_1.prisma.grade.create({
                data: {
                    tenantId: req.tenantId,
                    name,
                    code,
                    codes,
                    levelOrder,
                    description,
                    isActive,
                    createdById,
                },
            });
            res.status(201).json({ success: true, data: newGrade, message: "Grade created successfully" });
        }
        catch (error) {
            console.error("Error creating grade:", error);
            if (error.code === 'P2002') {
                res.status(409).json({ success: false, error: "A grade with this code already exists." });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to create grade" });
        }
    }
    // Get all Grades for the tenant
    static async getAllGrades(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const grades = await database_1.prisma.grade.findMany({
                where: { tenantId: req.tenantId },
                orderBy: { levelOrder: "asc" },
                include: {
                    createdBy: { select: { id: true, name: true } },
                    updatedBy: { select: { id: true, name: true } }
                }
            });
            res.status(200).json({ success: true, data: grades });
        }
        catch (error) {
            console.error("Error fetching grades:", error);
            res.status(500).json({ success: false, error: "Failed to fetch grades" });
        }
    }
    // Get a single Grade by ID
    static async getGradeById(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const grade = await database_1.prisma.grade.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!grade) {
                res.status(404).json({ success: false, error: "Grade not found" });
                return;
            }
            res.status(200).json({ success: true, data: grade });
        }
        catch (error) {
            console.error("Error fetching grade:", error);
            res.status(500).json({ success: false, error: "Failed to fetch grade" });
        }
    }
    // Update a Grade
    static async updateGrade(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { id } = req.params;
            const updatedById = req.user.id;
            const { name, code, codes, levelOrder, description, isActive } = req.body;
            const existing = await database_1.prisma.grade.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Grade not found" });
                return;
            }
            if (code && code !== existing.code) {
                const duplicate = await database_1.prisma.grade.findUnique({
                    where: { tenantId_code: { tenantId: req.tenantId, code } }
                });
                if (duplicate) {
                    res.status(409).json({ success: false, error: "A grade with this code already exists." });
                    return;
                }
            }
            const updatedGrade = await database_1.prisma.grade.update({
                where: { id },
                data: { name, code, codes, levelOrder, description, isActive, updatedById },
            });
            res.status(200).json({ success: true, data: updatedGrade, message: "Grade updated successfully" });
        }
        catch (error) {
            console.error("Error updating grade:", error);
            res.status(500).json({ success: false, error: "Failed to update grade" });
        }
    }
    // Delete a Grade
    static async deleteGrade(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.grade.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Grade not found" });
                return;
            }
            await database_1.prisma.grade.delete({ where: { id } });
            res.status(200).json({ success: true, message: "Grade deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting grade:", error);
            if (error.code === 'P2003') {
                res.status(400).json({ success: false, error: "Cannot delete grade because it is in use." });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to delete grade" });
        }
    }
}
exports.GradeController = GradeController;
//# sourceMappingURL=gradeController.js.map