"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmploymentTypeController = void 0;
const database_1 = require("@/config/database");
const transactionHistory_1 = require("../utils/transactionHistory");
class EmploymentTypeController {
    // Create a new employment type
    static async createEmploymentType(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { name, code, description, isActive } = req.body;
            const createdById = req.user.id;
            if (!name || typeof name !== 'string' || name.trim() === '') {
                res.status(400).json({ success: false, error: "A valid name is required." });
                return;
            }
            if (!code || typeof code !== 'string' || code.trim() === '') {
                res.status(400).json({ success: false, error: "A valid code is required." });
                return;
            }
            // Check if name already exists for this tenant
            const existing = await database_1.prisma.employmentType.findUnique({
                where: {
                    tenantId_name: {
                        tenantId: req.tenantId,
                        name: name.trim()
                    }
                }
            });
            if (existing) {
                res.status(409).json({ success: false, error: "Employment type with this name already exists for this tenant." });
                return;
            }
            // Check if code already exists for this tenant
            const existingCode = await database_1.prisma.employmentType.findUnique({
                where: {
                    tenantId_code: {
                        tenantId: req.tenantId,
                        code: code.trim()
                    }
                }
            });
            if (existingCode) {
                res.status(409).json({ success: false, error: "Employment type with this code already exists for this tenant." });
                return;
            }
            const employmentType = await database_1.prisma.employmentType.create({
                data: {
                    tenantId: req.tenantId,
                    code: code.trim(),
                    name: name.trim(),
                    description,
                    isActive: isActive !== undefined ? isActive : true,
                    createdById: createdById,
                    updatedById: createdById,
                },
            });
            res.status(201).json({ success: true, data: employmentType, message: "Employment type created successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.WORK,
                module: transactionHistory_1.Module.ORG_STRUCTURE,
                page: transactionHistory_1.Page.ORG_STRUCTURE_EMPLOYMENT_TYPES,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Created employment type "${employmentType.name}"`,
                entityType: transactionHistory_1.EntityType.ORG_EMPLOYMENT_TYPE,
                entityId: employmentType.id,
                entityLabel: employmentType.name,
                afterData: {
                    name: employmentType.name,
                    code: employmentType.code,
                    description: employmentType.description,
                    isActive: employmentType.isActive,
                },
            });
        }
        catch (error) {
            console.error("Error creating employment type:", error);
            if (error.code === 'P2002') {
                res.status(409).json({ success: false, error: "An employment type with this name already exists." });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to create employment type" });
        }
    }
    // Get all employment types for the tenant
    static async getAllEmploymentTypes(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const employmentTypes = await database_1.prisma.employmentType.findMany({
                where: { tenantId: req.tenantId },
                orderBy: { createdAt: 'desc' },
                include: {
                    createdBy: { select: { name: true, id: true } },
                    updatedBy: { select: { name: true, id: true } }
                }
            });
            res.status(200).json({ success: true, data: employmentTypes });
        }
        catch (error) {
            console.error("Error fetching employment types:", error);
            res.status(500).json({ success: false, error: "Failed to fetch employment types" });
        }
    }
    // Get a single employment type by ID
    static async getEmploymentTypeById(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const employmentType = await database_1.prisma.employmentType.findFirst({
                where: { id, tenantId: req.tenantId },
                include: {
                    createdBy: { select: { name: true, id: true } },
                    updatedBy: { select: { name: true, id: true } },
                },
            });
            if (!employmentType) {
                res.status(404).json({ success: false, error: "Employment type not found" });
                return;
            }
            res.status(200).json({ success: true, data: employmentType });
        }
        catch (error) {
            console.error("Error fetching employment type:", error);
            res.status(500).json({ success: false, error: "Failed to fetch employment type" });
        }
    }
    // Update an employment type
    static async updateEmploymentType(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Tenant context and user are missing" });
                return;
            }
            const { id } = req.params;
            const updatedById = req.user.id;
            const { name, code, description, isActive } = req.body;
            const employmentTypeToUpdate = await database_1.prisma.employmentType.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!employmentTypeToUpdate) {
                res.status(404).json({ success: false, error: "Employment type not found" });
                return;
            }
            if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
                res.status(400).json({ success: false, error: "If provided, name must be a valid string." });
                return;
            }
            if (code !== undefined && (typeof code !== 'string' || code.trim() === '')) {
                res.status(400).json({ success: false, error: "If provided, code must be a valid string." });
                return;
            }
            // Check for duplicate name if name is being updated
            if (name && name.trim() !== employmentTypeToUpdate.name) {
                const duplicate = await database_1.prisma.employmentType.findUnique({
                    where: {
                        tenantId_name: {
                            tenantId: req.tenantId,
                            name: name.trim()
                        }
                    }
                });
                if (duplicate) {
                    res.status(409).json({ success: false, error: "Employment type with this name already exists for this tenant." });
                    return;
                }
            }
            // Check for duplicate code if code is being updated
            if (code && code.trim() !== employmentTypeToUpdate.code) {
                const duplicateCode = await database_1.prisma.employmentType.findUnique({
                    where: {
                        tenantId_code: {
                            tenantId: req.tenantId,
                            code: code.trim()
                        }
                    }
                });
                if (duplicateCode) {
                    res.status(409).json({ success: false, error: "Employment type with this code already exists for this tenant." });
                    return;
                }
            }
            const updatedEmploymentType = await database_1.prisma.employmentType.update({
                where: { id },
                data: {
                    code: code ? code.trim() : undefined,
                    name: name ? name.trim() : undefined,
                    description,
                    isActive: isActive !== undefined ? isActive : undefined,
                    updatedById: updatedById,
                },
            });
            res.status(200).json({ success: true, data: updatedEmploymentType, message: "Employment type updated successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            if (employmentTypeToUpdate) {
                const beforeSnap = {
                    name: employmentTypeToUpdate.name,
                    code: employmentTypeToUpdate.code,
                    description: employmentTypeToUpdate.description,
                    isActive: employmentTypeToUpdate.isActive,
                };
                const afterSnap = {
                    name: updatedEmploymentType.name,
                    code: updatedEmploymentType.code,
                    description: updatedEmploymentType.description,
                    isActive: updatedEmploymentType.isActive,
                };
                const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.ORG_STRUCTURE,
                    page: transactionHistory_1.Page.ORG_STRUCTURE_EMPLOYMENT_TYPES,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Updated employment type "${updatedEmploymentType.name}"`,
                    entityType: transactionHistory_1.EntityType.ORG_EMPLOYMENT_TYPE,
                    entityId: id,
                    entityLabel: updatedEmploymentType.name,
                    beforeData: before,
                    afterData: after,
                    changedFields,
                });
            }
        }
        catch (error) {
            console.error("Error updating employment type:", error);
            res.status(500).json({ success: false, error: "Failed to update employment type" });
        }
    }
    // Delete an employment type
    static async deleteEmploymentType(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: "Tenant context missing" });
                return;
            }
            const { id } = req.params;
            const employmentTypeToDelete = await database_1.prisma.employmentType.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!employmentTypeToDelete) {
                res.status(404).json({ success: false, error: "Employment type not found" });
                return;
            }
            await database_1.prisma.employmentType.delete({
                where: { id },
            });
            res.status(200).json({ success: true, message: "Employment type deleted successfully" });
            // ─── Activity log ───────────────────────────────────────────────
            if (employmentTypeToDelete) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.WORK,
                    module: transactionHistory_1.Module.ORG_STRUCTURE,
                    page: transactionHistory_1.Page.ORG_STRUCTURE_EMPLOYMENT_TYPES,
                    action: transactionHistory_1.Action.DELETE,
                    actionLabel: `Deleted employment type "${employmentTypeToDelete.name}"`,
                    entityType: transactionHistory_1.EntityType.ORG_EMPLOYMENT_TYPE,
                    entityId: id,
                    entityLabel: employmentTypeToDelete.name,
                });
            }
        }
        catch (error) {
            console.error("Error deleting employment type:", error);
            // Handle foreign key constraint errors (P2003)
            if (error.code === 'P2003') {
                res.status(400).json({ success: false, error: "Cannot delete employment type because it is in use." });
                return;
            }
            res.status(500).json({ success: false, error: "Failed to delete employment type" });
        }
    }
}
exports.EmploymentTypeController = EmploymentTypeController;
//# sourceMappingURL=employmentTypeController.js.map