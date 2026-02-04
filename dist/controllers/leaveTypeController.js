"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaveTypeController = void 0;
const database_1 = require("@/config/database");
class LeaveTypeController {
    // Create a new leave type
    static async createLeaveType(req, res) {
        try {
            const { name, code, description, type, isPaid, requiresApproval, isActive, days, hours } = req.body;
            const tenantId = req.tenantId;
            const userId = req.user?.id;
            if (!tenantId) {
                return res.status(400).json({ success: false, error: "Tenant context missing" });
            }
            // Check if code already exists for this tenant
            const existing = await database_1.prisma.leaveType.findUnique({
                where: {
                    tenantId_code: {
                        tenantId,
                        code
                    }
                }
            });
            if (existing) {
                return res.status(409).json({ success: false, error: "Leave type code already exists" });
            }
            const leaveType = await database_1.prisma.leaveType.create({
                data: {
                    tenantId,
                    name,
                    code,
                    description,
                    type,
                    isPaid,
                    requiresApproval,
                    isActive,
                    days,
                    hours,
                    createdById: userId,
                    updatedById: userId,
                },
            });
            res.status(201).json({ success: true, data: leaveType });
        }
        catch (error) {
            console.error("Error creating leave type:", error);
            res.status(500).json({ success: false, error: "Failed to create leave type" });
        }
    }
    // Get all leave types for the tenant
    static async getAllLeaveTypes(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, error: "Tenant context missing" });
            }
            const leaveTypes = await database_1.prisma.leaveType.findMany({
                where: { tenantId },
                orderBy: { createdAt: 'desc' },
                include: {
                    createdBy: { select: { name: true, id: true } },
                    updatedBy: { select: { name: true, id: true } }
                }
            });
            res.status(200).json({ success: true, data: leaveTypes });
        }
        catch (error) {
            console.error("Error fetching leave types:", error);
            res.status(500).json({ success: false, error: "Failed to fetch leave types" });
        }
    }
    // Get a single leave type by ID
    static async getLeaveTypeById(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const leaveType = await database_1.prisma.leaveType.findFirst({
                where: { id, tenantId },
            });
            if (!leaveType) {
                return res.status(404).json({ success: false, error: "Leave type not found" });
            }
            res.status(200).json({ success: true, data: leaveType });
        }
        catch (error) {
            console.error("Error fetching leave type:", error);
            res.status(500).json({ success: false, error: "Failed to fetch leave type" });
        }
    }
    // Update a leave type
    static async updateLeaveType(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const userId = req.user?.id;
            const { name, code, description, type, isPaid, requiresApproval, isActive, days, hours } = req.body;
            const existing = await database_1.prisma.leaveType.findFirst({
                where: { id, tenantId },
            });
            if (!existing) {
                return res.status(404).json({ success: false, error: "Leave type not found" });
            }
            // Check for duplicate code if code is being updated
            if (code && code !== existing.code) {
                const duplicate = await database_1.prisma.leaveType.findUnique({
                    where: {
                        tenantId_code: {
                            tenantId,
                            code
                        }
                    }
                });
                if (duplicate) {
                    return res.status(409).json({ success: false, error: "Leave type code already exists" });
                }
            }
            const updatedLeaveType = await database_1.prisma.leaveType.update({
                where: { id },
                data: {
                    name,
                    code,
                    description,
                    type,
                    isPaid,
                    requiresApproval,
                    isActive,
                    days,
                    hours,
                    updatedById: userId,
                },
            });
            res.status(200).json({ success: true, data: updatedLeaveType });
        }
        catch (error) {
            console.error("Error updating leave type:", error);
            res.status(500).json({ success: false, error: "Failed to update leave type" });
        }
    }
    // Delete a leave type
    static async deleteLeaveType(req, res) {
        try {
            const { id } = req.params;
            const tenantId = req.tenantId;
            const existing = await database_1.prisma.leaveType.findFirst({
                where: { id, tenantId },
            });
            if (!existing) {
                return res.status(404).json({ success: false, error: "Leave type not found" });
            }
            await database_1.prisma.leaveType.delete({
                where: { id },
            });
            res.status(200).json({ success: true, message: "Leave type deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting leave type:", error);
            // Handle foreign key constraint errors (P2003)
            if (error.code === 'P2003') {
                return res.status(400).json({ success: false, error: "Cannot delete leave type because it is in use." });
            }
            res.status(500).json({ success: false, error: "Failed to delete leave type" });
        }
    }
}
exports.LeaveTypeController = LeaveTypeController;
//# sourceMappingURL=leaveTypeController.js.map