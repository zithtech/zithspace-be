"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionController = void 0;
const database_1 = require("@/config/database");
const transactionHistory_1 = require("../utils/transactionHistory");
class PositionController {
    // Create a new Position
    static async createPosition(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { code, title, departmentId, subDepartmentId, gradeId, description, isActive, } = req.body;
            const createdById = req.user.id;
            // Basic validation
            if (!code || !title || !departmentId || !gradeId) {
                res.status(400).json({ success: false, error: "Code, Title, Department, and Grade are required." });
                return;
            }
            const position = await database_1.prisma.position.create({
                data: {
                    tenantId: req.tenantId,
                    code,
                    title,
                    departmentId,
                    subDepartmentId,
                    gradeId,
                    description,
                    isActive: isActive !== undefined ? isActive : true,
                    createdById,
                    updatedById: createdById,
                },
            });
            res.status(201).json({ success: true, data: position, message: "Position created successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.ORG_STRUCTURE,
                page: transactionHistory_1.Page.ORG_STRUCTURE_POSITIONS,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Created position "${position.title}"`,
                entityType: transactionHistory_1.EntityType.ORG_POSITION,
                entityId: position.id,
                entityLabel: position.title,
                afterData: {
                    title: position.title,
                    code: position.code,
                    departmentId: position.departmentId,
                    subDepartmentId: position.subDepartmentId,
                    gradeId: position.gradeId,
                    description: position.description,
                    isActive: position.isActive,
                },
            });
        }
        catch (error) {
            console.error("Error creating position:", error);
            // Handle unique constraint violation (P2002)
            if (error.code === 'P2002') {
                res.status(409).json({ success: false, error: "Position code already exists" });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to create position" });
        }
    }
    // Get all Positions
    static async getPositions(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { page, limit, search, departmentId, subDepartmentId } = req.query;
            const pageNum = page ? parseInt(page, 10) : undefined;
            const limitNum = limit ? parseInt(limit, 10) : undefined;
            const where = { tenantId: req.tenantId };
            if (typeof search === 'string' && search.trim()) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ];
            }
            if (typeof departmentId === 'string' && departmentId.trim()) {
                where.departmentId = departmentId;
            }
            if (typeof subDepartmentId === 'string' && subDepartmentId.trim()) {
                where.subDepartmentId = subDepartmentId;
            }
            const include = {
                department: { select: { id: true, name: true } },
                subDepartment: { select: { id: true, name: true } },
                grade: { select: { id: true, name: true } },
                createdBy: {
                    select: { name: true },
                },
            };
            if (limitNum) {
                const skip = pageNum ? (pageNum - 1) * limitNum : 0;
                const [positions, total] = await Promise.all([
                    database_1.prisma.position.findMany({
                        where,
                        include,
                        orderBy: { createdAt: "desc" },
                        skip,
                        take: limitNum
                    }),
                    database_1.prisma.position.count({ where })
                ]);
                res.status(200).json({
                    success: true,
                    data: positions,
                    pagination: {
                        total,
                        page: pageNum || 1,
                        limit: limitNum,
                        pages: Math.ceil(total / limitNum)
                    }
                });
            }
            else {
                const positions = await database_1.prisma.position.findMany({
                    where,
                    include,
                    orderBy: { createdAt: "desc" },
                });
                res.status(200).json({ success: true, data: positions });
            }
        }
        catch (error) {
            console.error("Error fetching positions:", error);
            res.status(500).json({ success: false, error: "Failed to fetch positions" });
        }
    }
    // Get Position by ID
    static async getPositionById(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const position = await database_1.prisma.position.findFirst({
                where: { id, tenantId: req.tenantId },
                include: {
                    department: true,
                    subDepartment: true,
                    grade: true,
                },
            });
            if (!position) {
                res.status(404).json({ success: false, error: "Position not found" });
                return;
            }
            res.status(200).json({ success: true, data: position });
        }
        catch (error) {
            console.error("Error fetching position:", error);
            res.status(500).json({ success: false, error: "Failed to fetch position" });
        }
    }
    // Update Position
    static async updatePosition(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { id } = req.params;
            const updatedById = req.user.id;
            const { code, title, departmentId, subDepartmentId, gradeId, description, isActive, } = req.body;
            const existing = await database_1.prisma.position.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Position not found" });
                return;
            }
            const updatedPosition = await database_1.prisma.position.update({
                where: { id },
                data: {
                    code,
                    title,
                    departmentId,
                    subDepartmentId,
                    gradeId,
                    description,
                    isActive,
                    updatedById,
                },
            });
            res.status(200).json({ success: true, data: updatedPosition, message: "Position updated successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            if (existing) {
                const beforeSnap = {
                    title: existing.title,
                    code: existing.code,
                    departmentId: existing.departmentId,
                    subDepartmentId: existing.subDepartmentId,
                    gradeId: existing.gradeId,
                    description: existing.description,
                    isActive: existing.isActive,
                };
                const afterSnap = {
                    title: updatedPosition.title,
                    code: updatedPosition.code,
                    departmentId: updatedPosition.departmentId,
                    subDepartmentId: updatedPosition.subDepartmentId,
                    gradeId: updatedPosition.gradeId,
                    description: updatedPosition.description,
                    isActive: updatedPosition.isActive,
                };
                const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.ORG_STRUCTURE,
                    page: transactionHistory_1.Page.ORG_STRUCTURE_POSITIONS,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Updated position "${updatedPosition.title}"`,
                    entityType: transactionHistory_1.EntityType.ORG_POSITION,
                    entityId: id,
                    entityLabel: updatedPosition.title,
                    beforeData: before,
                    afterData: after,
                    changedFields,
                });
            }
        }
        catch (error) {
            console.error("Error updating position:", error);
            if (error.code === 'P2002') {
                res.status(409).json({ success: false, error: "Position code already exists" });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to update position" });
        }
    }
    // Delete Position
    static async deletePosition(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.position.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res.status(404).json({ success: false, error: "Position not found" });
                return;
            }
            await database_1.prisma.position.delete({
                where: { id },
            });
            res.status(200).json({ success: true, message: "Position deleted successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            if (existing) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.ORG_STRUCTURE,
                    page: transactionHistory_1.Page.ORG_STRUCTURE_POSITIONS,
                    action: transactionHistory_1.Action.DELETE,
                    actionLabel: `Deleted position "${existing.title}"`,
                    entityType: transactionHistory_1.EntityType.ORG_POSITION,
                    entityId: id,
                    entityLabel: existing.title,
                });
            }
        }
        catch (error) {
            console.error("Error deleting position:", error);
            res.status(500).json({ success: false, error: "Failed to delete position" });
        }
    }
}
exports.PositionController = PositionController;
//# sourceMappingURL=positionController.js.map