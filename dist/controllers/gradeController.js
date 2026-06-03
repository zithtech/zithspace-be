"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradeController = void 0;
const database_1 = require("@/config/database");
const transactionHistory_1 = require("../utils/transactionHistory");
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
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.ORG_STRUCTURE,
                page: transactionHistory_1.Page.ORG_STRUCTURE_GRADES,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Created grade "${newGrade.name}"`,
                entityType: transactionHistory_1.EntityType.ORG_GRADE,
                entityId: newGrade.id,
                entityLabel: newGrade.name,
                afterData: {
                    name: newGrade.name,
                    code: newGrade.code,
                    codes: newGrade.codes,
                    levelOrder: newGrade.levelOrder,
                    description: newGrade.description,
                    isActive: newGrade.isActive,
                },
            });
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
            // ─── Activity log ───────────────────────────────────────────────
            if (existing) {
                const beforeSnap = {
                    name: existing.name,
                    code: existing.code,
                    codes: existing.codes,
                    levelOrder: existing.levelOrder,
                    description: existing.description,
                    isActive: existing.isActive,
                };
                const afterSnap = {
                    name: updatedGrade.name,
                    code: updatedGrade.code,
                    codes: updatedGrade.codes,
                    levelOrder: updatedGrade.levelOrder,
                    description: updatedGrade.description,
                    isActive: updatedGrade.isActive,
                };
                const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.ORG_STRUCTURE,
                    page: transactionHistory_1.Page.ORG_STRUCTURE_GRADES,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Updated grade "${updatedGrade.name}"`,
                    entityType: transactionHistory_1.EntityType.ORG_GRADE,
                    entityId: id,
                    entityLabel: updatedGrade.name,
                    beforeData: before,
                    afterData: after,
                    changedFields,
                });
            }
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
            // ─── Activity log ───────────────────────────────────────────────
            if (existing) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.ORG_STRUCTURE,
                    page: transactionHistory_1.Page.ORG_STRUCTURE_GRADES,
                    action: transactionHistory_1.Action.DELETE,
                    actionLabel: `Deleted grade "${existing.name}"`,
                    entityType: transactionHistory_1.EntityType.ORG_GRADE,
                    entityId: id,
                    entityLabel: existing.name,
                });
            }
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