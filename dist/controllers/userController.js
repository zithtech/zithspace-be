"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class UserController {
    /**
     * Get all members/users with filtering and pagination (tenant-aware)
     */
    static async getMembers(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, role, position, isActive = 'true', search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
            // Build filter query
            const where = {
                tenantId: req.tenantId,
            };
            if (role)
                where.role = role;
            if (position)
                where.position = position;
            if (isActive !== 'all')
                where.isActive = isActive === 'true';
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { workEmail: { contains: search, mode: 'insensitive' } },
                    { personalEmail: { contains: search, mode: 'insensitive' } }
                ];
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [members, total] = await Promise.all([
                await database_1.prisma.user.findMany({
                    where,
                    select: {
                        id: true,
                        name: true,
                        workEmail: true,
                        personalEmail: true,
                        phone: true,
                        role: true,
                        position: true,
                        isActive: true,
                        lastLoginAt: true,
                        createdAt: true,
                        updatedAt: true,
                        reportsTo: {
                            select: { id: true, name: true, position: true }
                        }
                    },
                    orderBy,
                    skip,
                    take: Number(limit),
                }),
                await database_1.prisma.user.count({ where })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: members,
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
            console.error('Get members error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch members'
            });
        }
    }
    /**
     * Get member/user by ID (tenant-aware)
     */
    static async getMemberById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const member = await database_1.prisma.user.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    personalEmail: true,
                    phone: true,
                    role: true,
                    position: true,
                    reportsToId: true,
                    dateOfBirth: true,
                    workDays: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true,
                    updatedAt: true,
                    reportsTo: {
                        select: { id: true, name: true, position: true }
                    }
                }
            });
            if (!member) {
                res.status(404).json({
                    success: false,
                    error: 'Member not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: member
            });
        }
        catch (error) {
            console.error('Get member by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch member'
            });
        }
    }
    /**
     * Create new member/user (tenant-aware)
     */
    static async createMember(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const userData = req.body;
            // Validate required fields
            if (!userData.name || !userData.workEmail || !userData.password || !userData.position) {
                res.status(400).json({
                    success: false,
                    error: 'Name, work email, password, and position are required'
                });
                return;
            }
            // Check if user already exists within tenant
            const existingUser = await database_1.prisma.user.findFirst({
                where: {
                    tenantId: req.tenantId,
                    OR: [
                        { workEmail: userData.workEmail.toLowerCase() },
                        { personalEmail: userData.personalEmail?.toLowerCase() },
                        { phone: userData.phone }
                    ],
                }
            });
            if (existingUser) {
                throw new types_1.ValidationError('User with this email or phone already exists in this tenant');
            }
            // Validate reports to user if provided
            if (userData.reportsToId) {
                const reportsToUser = await database_1.prisma.user.findFirst({
                    where: {
                        id: userData.reportsToId,
                        tenantId: req.tenantId,
                        isActive: true,
                    }
                });
                if (!reportsToUser) {
                    throw new types_1.ValidationError('Reports to user not found in this tenant');
                }
            }
            // Hash password
            const passwordHash = await bcryptjs_1.default.hash(userData.password, 12);
            // Validate assigned shift if provided
            if (userData.assignedShiftId) {
                const shift = await database_1.prisma.shift.findFirst({
                    where: {
                        id: userData.assignedShiftId,
                        tenantId: req.tenantId,
                        isActive: true,
                    }
                });
                if (!shift) {
                    throw new types_1.ValidationError('Assigned shift not found or inactive in this tenant');
                }
            }
            // Create user
            const newUser = await database_1.prisma.user.create({
                data: {
                    tenantId: req.tenantId,
                    name: userData.name,
                    workEmail: userData.workEmail.toLowerCase(),
                    personalEmail: userData.personalEmail?.toLowerCase(),
                    phone: userData.phone,
                    passwordHash,
                    role: userData.role || 'user',
                    position: userData.position,
                    reportsToId: userData.reportsToId,
                    dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
                    workDays: userData.workDays || [1, 2, 3, 4, 5], // Default to weekdays
                    assignedShiftId: userData.assignedShiftId, // FIXED: Process shift assignment
                    isActive: userData.isActive !== undefined ? userData.isActive : true, // FIXED: Process isActive
                },
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    personalEmail: true,
                    phone: true,
                    role: true,
                    position: true,
                    isActive: true,
                    createdAt: true,
                    reportsTo: {
                        select: { id: true, name: true, position: true }
                    }
                }
            });
            res.status(201).json({
                success: true,
                data: newUser,
                message: 'Member created successfully'
            });
        }
        catch (error) {
            console.error('Create member error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create member'
            });
        }
    }
    /**
     * Update member/user (tenant-aware)
     */
    static async updateMember(req, res) {
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
            delete updates.passwordHash;
            delete updates.tenantId;
            delete updates.createdAt;
            // Check if user exists and belongs to tenant
            const existingUser = await database_1.prisma.user.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                }
            });
            if (!existingUser) {
                throw new types_1.NotFoundError('User not found in this tenant');
            }
            // Check for email conflicts within tenant if email is being updated
            if (updates.workEmail && updates.workEmail.toLowerCase() !== existingUser.workEmail) {
                const duplicateUser = await database_1.prisma.user.findFirst({
                    where: {
                        workEmail: updates.workEmail.toLowerCase(),
                        tenantId: req.tenantId,
                        id: { not: id }
                    }
                });
                if (duplicateUser) {
                    throw new types_1.ValidationError('Work email already exists in this tenant');
                }
            }
            // Validate reports to user if provided
            if (updates.reportsToId) {
                const reportsToUser = await database_1.prisma.user.findFirst({
                    where: {
                        id: updates.reportsToId,
                        tenantId: req.tenantId,
                        isActive: true,
                    }
                });
                if (!reportsToUser) {
                    throw new types_1.ValidationError('Reports to user not found in this tenant');
                }
            }
            // Validate assigned shift if provided
            if (updates.assignedShiftId) {
                const shift = await database_1.prisma.shift.findFirst({
                    where: {
                        id: updates.assignedShiftId,
                        tenantId: req.tenantId,
                        isActive: true,
                    }
                });
                if (!shift) {
                    throw new types_1.ValidationError('Assigned shift not found or inactive in this tenant');
                }
            }
            // Convert dates if provided
            if (updates.dateOfBirth)
                updates.dateOfBirth = new Date(updates.dateOfBirth);
            if (updates.workEmail)
                updates.workEmail = updates.workEmail.toLowerCase();
            if (updates.personalEmail)
                updates.personalEmail = updates.personalEmail.toLowerCase();
            // Update shift assignment tracking if shift is being changed
            const updateData = { ...updates, updatedAt: new Date() };
            if (updates.assignedShiftId && updates.assignedShiftId !== existingUser.assignedShiftId) {
                updateData.shiftAssignedById = req.user.id;
                updateData.shiftAssignedDate = new Date();
            }
            const updatedUser = await database_1.prisma.user.update({
                where: { id },
                data: updateData,
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    personalEmail: true,
                    phone: true,
                    role: true,
                    position: true,
                    workDays: true,
                    isActive: true,
                    updatedAt: true,
                    assignedShift: {
                        select: {
                            id: true,
                            name: true,
                            startTime: true,
                            endTime: true,
                        }
                    },
                    reportsTo: {
                        select: { id: true, name: true, position: true }
                    }
                }
            });
            res.status(200).json({
                success: true,
                data: updatedUser,
                message: 'Member updated successfully'
            });
        }
        catch (error) {
            console.error('Update member error:', error);
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
                error: 'Failed to update member'
            });
        }
    }
    /**
     * Delete member (soft delete - tenant-aware)
     */
    static async deleteMember(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const existingUser = await database_1.prisma.user.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                }
            });
            if (!existingUser) {
                throw new types_1.NotFoundError('User not found in this tenant');
            }
            // Soft delete
            const updatedUser = await database_1.prisma.user.update({
                where: { id },
                data: {
                    isActive: false,
                    updatedAt: new Date()
                },
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    isActive: true,
                    updatedAt: true
                }
            });
            res.status(200).json({
                success: true,
                data: updatedUser,
                message: 'Member deactivated successfully'
            });
        }
        catch (error) {
            console.error('Delete member error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to deactivate member'
            });
        }
    }
    /**
     * Activate member (tenant-aware)
     */
    static async activateMember(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const existingUser = await database_1.prisma.user.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                }
            });
            if (!existingUser) {
                throw new types_1.NotFoundError('User not found in this tenant');
            }
            const updatedUser = await database_1.prisma.user.update({
                where: { id },
                data: {
                    isActive: true,
                    updatedAt: new Date()
                },
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    isActive: true,
                    updatedAt: true
                }
            });
            res.status(200).json({
                success: true,
                data: updatedUser,
                message: 'Member activated successfully'
            });
        }
        catch (error) {
            console.error('Activate member error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to activate member'
            });
        }
    }
    /**
     * Get user profile (current user - tenant-aware)
     */
    static async getUserProfile(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const userId = req.user.id;
            const user = await database_1.prisma.user.findFirst({
                where: {
                    id: userId,
                    tenantId: req.tenantId,
                },
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    personalEmail: true,
                    phone: true,
                    role: true,
                    position: true,
                    dateOfBirth: true,
                    workDays: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true,
                    updatedAt: true,
                    reportsTo: {
                        select: { id: true, name: true, position: true }
                    }
                }
            });
            if (!user) {
                res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: user
            });
        }
        catch (error) {
            console.error('Get user profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch user profile'
            });
        }
    }
    /**
     * Update user profile (current user - tenant-aware)
     */
    static async updateUserProfile(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const userId = req.user.id;
            const updateData = req.body;
            // Remove sensitive fields that shouldn't be updated via this endpoint
            delete updateData.passwordHash;
            delete updateData.role;
            delete updateData.isActive;
            delete updateData.tenantId;
            delete updateData.createdAt;
            // Convert dates if provided
            if (updateData.dateOfBirth)
                updateData.dateOfBirth = new Date(updateData.dateOfBirth);
            if (updateData.personalEmail)
                updateData.personalEmail = updateData.personalEmail.toLowerCase();
            const updatedUser = await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    ...updateData,
                    updatedAt: new Date()
                },
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    personalEmail: true,
                    phone: true,
                    position: true,
                    dateOfBirth: true,
                    workDays: true,
                    updatedAt: true,
                    reportsTo: {
                        select: { id: true, name: true, position: true }
                    }
                }
            });
            res.status(200).json({
                success: true,
                data: updatedUser,
                message: 'Profile updated successfully'
            });
        }
        catch (error) {
            console.error('Update user profile error:', error);
            if (error.code === 'P2002') {
                res.status(409).json({
                    success: false,
                    error: 'Email or phone already exists'
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update profile'
            });
        }
    }
    /**
     * Change password (current user - tenant-aware)
     */
    static async changePassword(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const userId = req.user.id;
            const { currentPassword, newPassword, confirmPassword } = req.body;
            // Validate input
            if (!currentPassword || !newPassword || !confirmPassword) {
                res.status(400).json({
                    success: false,
                    error: 'All password fields are required'
                });
                return;
            }
            if (newPassword !== confirmPassword) {
                res.status(400).json({
                    success: false,
                    error: 'New password and confirm password do not match'
                });
                return;
            }
            if (newPassword.length < 6) {
                res.status(400).json({
                    success: false,
                    error: 'New password must be at least 6 characters long'
                });
                return;
            }
            // Get user with password
            const user = await database_1.prisma.user.findFirst({
                where: {
                    id: userId,
                    tenantId: req.tenantId,
                }
            });
            if (!user) {
                throw new types_1.NotFoundError('User not found');
            }
            // Verify current password
            const isCurrentPasswordValid = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
            if (!isCurrentPasswordValid) {
                throw new types_1.ValidationError('Current password is incorrect');
            }
            // Hash new password
            const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 12);
            // Update password
            await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    passwordHash: newPasswordHash,
                    updatedAt: new Date()
                }
            });
            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });
        }
        catch (error) {
            console.error('Change password error:', error);
            if (error instanceof types_1.ValidationError || error instanceof types_1.NotFoundError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to change password'
            });
        }
    }
    /**
     * Reset user password (admin only - tenant-aware)
     */
    static async resetUserPassword(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            // Check if current user is admin
            if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
                res.status(403).json({
                    success: false,
                    error: 'Access denied. admin privileges required.'
                });
                return;
            }
            const { userId } = req.params;
            const { newPassword } = req.body;
            if (!newPassword || newPassword.length < 6) {
                res.status(400).json({
                    success: false,
                    error: 'New password must be at least 6 characters long'
                });
                return;
            }
            const user = await database_1.prisma.user.findFirst({
                where: {
                    id: userId,
                    tenantId: req.tenantId,
                }
            });
            if (!user) {
                throw new types_1.NotFoundError('User not found in this tenant');
            }
            // Hash new password
            const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 12);
            // Update password
            await database_1.prisma.user.update({
                where: { id: userId },
                data: {
                    passwordHash: newPasswordHash,
                    updatedAt: new Date()
                }
            });
            res.status(200).json({
                success: true,
                message: 'User password reset successfully'
            });
        }
        catch (error) {
            console.error('Reset user password error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to reset user password'
            });
        }
    }
    /**
     * Get members for dropdown/select (tenant-aware)
     */
    static async getMembersForSelect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { role, position } = req.query;
            const where = {
                tenantId: req.tenantId,
                isActive: true,
            };
            if (role)
                where.role = role;
            if (position)
                where.position = position;
            const members = await database_1.prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    position: true,
                    role: true,
                },
                orderBy: { name: 'asc' }
            });
            const formattedMembers = members.map(member => ({
                value: member.id,
                label: member.name,
                email: member.workEmail,
                position: member.position,
                role: member.role,
            }));
            res.status(200).json({
                success: true,
                data: formattedMembers
            });
        }
        catch (error) {
            console.error('Get members for select error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch members'
            });
        }
    }
    /**
     * Assign shift to member (tenant-aware) - MISSING FUNCTIONALITY RESTORED
     */
    static async assignShift(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const { shiftId } = req.body;
            if (!shiftId) {
                res.status(400).json({
                    success: false,
                    error: 'Shift ID is required'
                });
                return;
            }
            // Verify member exists and belongs to tenant
            const member = await database_1.prisma.user.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                }
            });
            if (!member) {
                throw new types_1.NotFoundError('Member not found in this tenant');
            }
            // Verify shift exists and belongs to tenant
            const shift = await database_1.prisma.shift.findFirst({
                where: {
                    id: shiftId,
                    tenantId: req.tenantId,
                    isActive: true,
                }
            });
            if (!shift) {
                throw new types_1.ValidationError('Shift not found or inactive in this tenant');
            }
            // Update member with shift assignment
            const updatedMember = await database_1.prisma.user.update({
                where: { id },
                data: {
                    assignedShiftId: shiftId,
                    shiftAssignedById: req.user.id,
                    shiftAssignedDate: new Date(),
                    updatedAt: new Date(),
                },
                select: {
                    id: true,
                    name: true,
                    workEmail: true,
                    personalEmail: true,
                    phone: true,
                    role: true,
                    position: true,
                    isActive: true,
                    updatedAt: true,
                    assignedShift: {
                        select: {
                            id: true,
                            name: true,
                            startTime: true,
                            endTime: true,
                        }
                    },
                    shiftAssignedBy: {
                        select: {
                            id: true,
                            name: true,
                            position: true,
                        }
                    },
                    reportsTo: {
                        select: { id: true, name: true, position: true }
                    }
                }
            });
            res.status(200).json({
                success: true,
                data: updatedMember,
                message: 'Shift assigned successfully'
            });
        }
        catch (error) {
            console.error('Assign shift error:', error);
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
                error: 'Failed to assign shift'
            });
        }
    }
}
exports.UserController = UserController;
exports.default = UserController;
//# sourceMappingURL=userController.js.map