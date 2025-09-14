"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiftsController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class ShiftsController {
    /**
     * Get all shifts with filtering and pagination (tenant-aware)
     */
    static async getShifts(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, isActive = 'true', search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
            // Build filter query
            const where = {
                tenantId: req.tenantId,
            };
            if (isActive !== 'all')
                where.isActive = isActive === 'true';
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { startTime: { contains: search, mode: 'insensitive' } },
                    { endTime: { contains: search, mode: 'insensitive' } }
                ];
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [shifts, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.shift.findMany({
                        where,
                        orderBy,
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.shift.count({ where });
                })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: shifts,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: totalPages,
                    hasNext: Number(page) < totalPages,
                    hasPrev: Number(page) > 1
                }
            });
        }
        catch (error) {
            console.error('Get shifts error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch shifts'
            });
        }
    }
    /**
     * Get shift by ID (tenant-aware)
     */
    static async getShiftById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const shift = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.shift.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
            });
            if (!shift) {
                res.status(404).json({
                    success: false,
                    error: 'Shift not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: shift
            });
        }
        catch (error) {
            console.error('Get shift by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch shift'
            });
        }
    }
    /**
     * Create new shift (tenant-aware)
     */
    static async createShift(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { name, startTime, endTime } = req.body;
            // Validate required fields
            if (!name || !startTime || !endTime) {
                res.status(400).json({
                    success: false,
                    error: 'Name, start time, and end time are required'
                });
                return;
            }
            // Validate time format (HH:mm)
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid time format. Use HH:mm format (e.g., 09:00, 17:30)'
                });
                return;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if shift with same name already exists within tenant
                const existingShift = await client.shift.findFirst({
                    where: {
                        name,
                        tenantId: req.tenantId,
                    }
                });
                if (existingShift) {
                    throw new types_1.ValidationError('Shift with this name already exists in this tenant');
                }
                // Create shift
                const newShift = await client.shift.create({
                    data: {
                        tenantId: req.tenantId,
                        name,
                        startTime,
                        endTime,
                        isActive: true,
                    }
                });
                res.status(201).json({
                    success: true,
                    data: newShift,
                    message: 'Shift created successfully'
                });
            });
        }
        catch (error) {
            console.error('Create shift error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create shift'
            });
        }
    }
    /**
     * Update shift (tenant-aware)
     */
    static async updateShift(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const updates = req.body;
            // Remove fields that shouldn't be updated directly
            delete updates.tenantId;
            delete updates.createdAt;
            // Validate time format if time fields are being updated
            if (updates.startTime || updates.endTime) {
                const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
                if (updates.startTime && !timeRegex.test(updates.startTime)) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid start time format. Use HH:mm format (e.g., 09:00)'
                    });
                    return;
                }
                if (updates.endTime && !timeRegex.test(updates.endTime)) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid end time format. Use HH:mm format (e.g., 17:30)'
                    });
                    return;
                }
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if shift exists and belongs to tenant
                const existingShift = await client.shift.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingShift) {
                    throw new types_1.NotFoundError('Shift not found in this tenant');
                }
                // Check for name conflicts within tenant if name is being updated
                if (updates.name && updates.name !== existingShift.name) {
                    const duplicateShift = await client.shift.findFirst({
                        where: {
                            name: updates.name,
                            tenantId: req.tenantId,
                            id: { not: id }
                        }
                    });
                    if (duplicateShift) {
                        throw new types_1.ValidationError('Shift with this name already exists in this tenant');
                    }
                }
                const updatedShift = await client.shift.update({
                    where: { id },
                    data: {
                        ...updates,
                        updatedAt: new Date()
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedShift,
                    message: 'Shift updated successfully'
                });
            });
        }
        catch (error) {
            console.error('Update shift error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update shift'
            });
        }
    }
    /**
     * Delete shift (soft delete - tenant-aware)
     */
    static async deleteShift(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const existingShift = await client.shift.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingShift) {
                    throw new types_1.NotFoundError('Shift not found in this tenant');
                }
                // Check if any users are assigned to this shift
                const usersWithShift = await client.user.count({
                    where: {
                        assignedShiftId: id,
                        tenantId: req.tenantId,
                        isActive: true
                    }
                });
                if (usersWithShift > 0) {
                    throw new types_1.ValidationError(`Cannot delete shift. ${usersWithShift} users are currently assigned to this shift.`);
                }
                // Soft delete
                const updatedShift = await client.shift.update({
                    where: { id },
                    data: {
                        isActive: false,
                        updatedAt: new Date()
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedShift,
                    message: 'Shift deactivated successfully'
                });
            });
        }
        catch (error) {
            console.error('Delete shift error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to delete shift'
            });
        }
    }
    /**
     * Activate shift (tenant-aware)
     */
    static async activateShift(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const existingShift = await client.shift.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingShift) {
                    throw new types_1.NotFoundError('Shift not found in this tenant');
                }
                const updatedShift = await client.shift.update({
                    where: { id },
                    data: {
                        isActive: true,
                        updatedAt: new Date()
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedShift,
                    message: 'Shift activated successfully'
                });
            });
        }
        catch (error) {
            console.error('Activate shift error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to activate shift'
            });
        }
    }
    /**
     * Assign shift to user (tenant-aware)
     */
    static async assignShiftToUser(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { shiftId } = req.params;
            const { userId } = req.body;
            if (!userId) {
                res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
                return;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate shift exists and belongs to tenant
                const shift = await client.shift.findFirst({
                    where: {
                        id: shiftId,
                        tenantId: req.tenantId,
                        isActive: true
                    }
                });
                if (!shift) {
                    throw new types_1.NotFoundError('Active shift not found in this tenant');
                }
                // Validate user exists and belongs to tenant
                const user = await client.user.findFirst({
                    where: {
                        id: userId,
                        tenantId: req.tenantId,
                        isActive: true
                    }
                });
                if (!user) {
                    throw new types_1.NotFoundError('Active user not found in this tenant');
                }
                // Assign shift to user
                const updatedUser = await client.user.update({
                    where: { id: userId },
                    data: {
                        assignedShiftId: shiftId,
                        shiftAssignedById: req.user.id,
                        shiftAssignedDate: new Date(),
                        updatedAt: new Date()
                    },
                    select: {
                        id: true,
                        name: true,
                        workEmail: true,
                        assignedShiftId: true,
                        shiftAssignedDate: true,
                        assignedShift: {
                            select: { id: true, name: true, startTime: true, endTime: true }
                        },
                        shiftAssignedBy: {
                            select: { id: true, name: true, position: true }
                        }
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedUser,
                    message: 'Shift assigned successfully'
                });
            });
        }
        catch (error) {
            console.error('Assign shift to user error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to assign shift'
            });
        }
    }
    /**
     * Remove shift assignment from user (tenant-aware)
     */
    static async removeShiftFromUser(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { userId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate user exists and belongs to tenant
                const user = await client.user.findFirst({
                    where: {
                        id: userId,
                        tenantId: req.tenantId,
                    }
                });
                if (!user) {
                    throw new types_1.NotFoundError('User not found in this tenant');
                }
                // Remove shift assignment
                const updatedUser = await client.user.update({
                    where: { id: userId },
                    data: {
                        assignedShiftId: null,
                        shiftAssignedById: null,
                        shiftAssignedDate: null,
                        updatedAt: new Date()
                    },
                    select: {
                        id: true,
                        name: true,
                        workEmail: true,
                        assignedShiftId: true,
                        updatedAt: true
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedUser,
                    message: 'Shift assignment removed successfully'
                });
            });
        }
        catch (error) {
            console.error('Remove shift from user error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to remove shift assignment'
            });
        }
    }
    /**
     * Get shifts for dropdown/select (tenant-aware)
     */
    static async getShiftsForSelect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const shifts = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.shift.findMany({
                    where: {
                        tenantId: req.tenantId,
                        isActive: true
                    },
                    select: {
                        id: true,
                        name: true,
                        startTime: true,
                        endTime: true,
                    },
                    orderBy: { name: 'asc' }
                });
            });
            const formattedShifts = shifts.map(shift => ({
                value: shift.id,
                label: shift.name,
                startTime: shift.startTime,
                endTime: shift.endTime,
                display: `${shift.name} (${shift.startTime} - ${shift.endTime})`
            }));
            res.status(200).json({
                success: true,
                data: formattedShifts
            });
        }
        catch (error) {
            console.error('Get shifts for select error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch shifts'
            });
        }
    }
    /**
     * Get users assigned to a specific shift (tenant-aware)
     */
    static async getUsersByShift(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { shiftId } = req.params;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate shift exists
                const shift = await client.shift.findFirst({
                    where: {
                        id: shiftId,
                        tenantId: req.tenantId,
                    }
                });
                if (!shift) {
                    throw new types_1.NotFoundError('Shift not found in this tenant');
                }
                // Get users assigned to this shift
                const users = await client.user.findMany({
                    where: {
                        assignedShiftId: shiftId,
                        tenantId: req.tenantId,
                        isActive: true
                    },
                    select: {
                        id: true,
                        name: true,
                        workEmail: true,
                        position: true,
                        shiftAssignedDate: true,
                        shiftAssignedBy: {
                            select: { id: true, name: true, position: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
                res.status(200).json({
                    success: true,
                    data: {
                        shift,
                        users,
                        totalUsers: users.length
                    }
                });
            });
        }
        catch (error) {
            console.error('Get users by shift error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to fetch users for shift'
            });
        }
    }
}
exports.ShiftsController = ShiftsController;
exports.default = ShiftsController;
//# sourceMappingURL=shiftsController.js.map