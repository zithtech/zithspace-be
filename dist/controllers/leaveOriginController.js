"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOriginLeaveType = exports.deleteOriginLeaveType = exports.deleteLeaveOriginStructure = exports.getAllLeaveOrigins = exports.createOriginLeaveType = exports.updateLeaveOriginStructure = exports.createLeaveOriginStructure = void 0;
const database_1 = require("@/config/database");
// Create Leave Origin Structure
const createLeaveOriginStructure = async (req, res) => {
    try {
        const { origin, subOrigin, leaveTypes } = req.body;
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: "Tenant context missing" });
        }
        const leaveOrigin = await database_1.prisma.leaveOriginStructure.create({
            data: {
                tenantId,
                origin,
                subOrigin,
                createdById: userId || "system",
                leaveTypes: {
                    create: Array.isArray(leaveTypes) ? leaveTypes.map((type) => ({
                        tenantId,
                        leaveType: type.leaveType,
                        unit: type.unit,
                        period: type.period,
                        carryForward: type.carryForward ?? false,
                        status: type.status || "Active",
                        createdById: userId || "system",
                    })) : [],
                },
            },
            include: {
                leaveTypes: true,
            },
        });
        res.status(201).json({ success: true, data: leaveOrigin });
    }
    catch (error) {
        console.error("Error creating leave origin structure:", error);
        if (error.code === 'P2002') {
            return res.status(409).json({ success: false, error: "Configuration already exists for this Origin and Sub-Origin." });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.createLeaveOriginStructure = createLeaveOriginStructure;
// Update Leave Origin Structure (Bulk update/create leave types)
const updateLeaveOriginStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { leaveTypes } = req.body;
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: "Tenant context missing" });
        }
        const existingStructure = await database_1.prisma.leaveOriginStructure.findFirst({
            where: { id, tenantId },
        });
        if (!existingStructure) {
            return res.status(404).json({ success: false, error: "Structure not found" });
        }
        // 1. Identify leave types to delete (present in DB but missing in payload)
        const existingLeaveTypes = await database_1.prisma.originLeaveType.findMany({
            where: { leaveOriginId: id, tenantId },
            select: { id: true },
        });
        const existingIds = existingLeaveTypes.map((lt) => lt.id);
        const payloadIds = (leaveTypes || [])
            .filter((type) => type.id)
            .map((type) => type.id);
        const idsToDelete = existingIds.filter((id) => !payloadIds.includes(id));
        const upsertOperations = (leaveTypes || []).map((type) => {
            if (type.id) {
                // Update existing leave type
                return database_1.prisma.originLeaveType.update({
                    where: { id: type.id },
                    data: {
                        leaveType: type.leaveType,
                        unit: type.unit,
                        period: type.period,
                        carryForward: type.carryForward ?? false,
                        status: type.status || "Active",
                        updatedById: userId || "system",
                    },
                });
            }
            else {
                // Create new leave type
                return database_1.prisma.originLeaveType.create({
                    data: {
                        tenantId,
                        leaveOriginId: id,
                        leaveType: type.leaveType,
                        unit: type.unit,
                        period: type.period,
                        carryForward: type.carryForward ?? false,
                        status: type.status || "Active",
                        createdById: userId || "system",
                    },
                });
            }
        });
        const deleteOperations = idsToDelete.map((deleteId) => database_1.prisma.originLeaveType.delete({
            where: { id: deleteId },
        }));
        await database_1.prisma.$transaction([...deleteOperations, ...upsertOperations]);
        const updatedStructure = await database_1.prisma.leaveOriginStructure.findUnique({
            where: { id },
            include: {
                leaveTypes: true,
            },
        });
        res.status(200).json({ success: true, data: updatedStructure });
    }
    catch (error) {
        console.error("Error updating leave origin structure:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.updateLeaveOriginStructure = updateLeaveOriginStructure;
// Create Origin Leave Type
const createOriginLeaveType = async (req, res) => {
    try {
        const { leaveOriginId, leaveType, unit, period, carryForward, status } = req.body;
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        if (!leaveOriginId) {
            return res.status(400).json({ success: false, error: "leaveOriginId is required" });
        }
        if (!tenantId) {
            return res.status(400).json({ success: false, error: "Tenant context missing" });
        }
        // Verify the parent structure exists and belongs to the tenant
        const parentStructure = await database_1.prisma.leaveOriginStructure.findUnique({
            where: { id: leaveOriginId },
        });
        if (!parentStructure || parentStructure.tenantId !== tenantId) {
            return res.status(404).json({ success: false, error: `Leave Origin Structure not found for ID: ${leaveOriginId}` });
        }
        const originLeaveType = await database_1.prisma.originLeaveType.create({
            data: {
                tenantId,
                leaveOriginId,
                leaveType,
                unit,
                period,
                carryForward,
                status,
                createdById: userId || "system",
            },
        });
        res.status(201).json({ success: true, data: originLeaveType });
    }
    catch (error) {
        console.error("Error creating origin leave type:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.createOriginLeaveType = createOriginLeaveType;
// Get all Leave Origin Structures with their types
const getAllLeaveOrigins = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: "Tenant context missing" });
        }
        const leaveOrigins = await database_1.prisma.leaveOriginStructure.findMany({
            where: { tenantId },
            include: {
                leaveTypes: true,
            },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ success: true, data: leaveOrigins });
    }
    catch (error) {
        console.error("Error fetching leave origins:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getAllLeaveOrigins = getAllLeaveOrigins;
// Delete Leave Origin Structure
const deleteLeaveOriginStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: "Tenant context missing" });
        }
        // Using deleteMany ensures we only delete if it belongs to the tenant
        const result = await database_1.prisma.leaveOriginStructure.deleteMany({
            where: {
                id: id,
                tenantId: tenantId,
            },
        });
        if (result.count === 0) {
            return res.status(404).json({ success: false, error: "Structure not found or access denied" });
        }
        res.status(200).json({ success: true, message: "Deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting leave origin structure:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.deleteLeaveOriginStructure = deleteLeaveOriginStructure;
// Delete Origin Leave Type
const deleteOriginLeaveType = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: "Tenant context missing" });
        }
        const result = await database_1.prisma.originLeaveType.deleteMany({
            where: {
                id: id,
                tenantId: tenantId,
            },
        });
        if (result.count === 0) {
            return res.status(404).json({ success: false, error: "Leave type not found or access denied" });
        }
        res.status(200).json({ success: true, message: "Deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting origin leave type:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.deleteOriginLeaveType = deleteOriginLeaveType;
// Update Origin Leave Type
const updateOriginLeaveType = async (req, res) => {
    try {
        const { id } = req.params;
        const { leaveType, unit, period, carryForward, status, leaveOriginId } = req.body;
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: "Tenant context missing" });
        }
        const existing = await database_1.prisma.originLeaveType.findFirst({
            where: { id, tenantId },
        });
        if (!existing) {
            return res.status(404).json({ success: false, error: "Leave type not found" });
        }
        const updated = await database_1.prisma.originLeaveType.update({
            where: { id },
            data: {
                leaveType,
                unit,
                period,
                carryForward,
                status,
                leaveOriginId,
                updatedById: userId || "system",
            },
        });
        res.status(200).json({ success: true, data: updated });
    }
    catch (error) {
        console.error("Error updating origin leave type:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.updateOriginLeaveType = updateOriginLeaveType;
//# sourceMappingURL=leaveOriginController.js.map