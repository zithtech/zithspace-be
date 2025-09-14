"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class AttendanceController {
    /**
     * Get all attendance records with filtering and pagination (tenant-aware)
     */
    static async getAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { page = 1, limit = 20, userId, date, status, startDate, endDate, sortBy = 'date', sortOrder = 'desc' } = req.query;
            // Build filter query
            const where = {
                tenantId: req.tenantId,
            };
            if (userId)
                where.userId = userId;
            if (status)
                where.status = status;
            if (date) {
                const targetDate = new Date(date);
                const startOfDay = new Date(targetDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(targetDate);
                endOfDay.setHours(23, 59, 59, 999);
                where.date = {
                    gte: startOfDay,
                    lte: endOfDay,
                };
            }
            else if (startDate && endDate) {
                where.date = {
                    gte: new Date(startDate),
                    lte: new Date(endDate),
                };
            }
            // Build sort object
            const orderBy = {};
            orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
            // Execute query with pagination
            const skip = (Number(page) - 1) * Number(limit);
            const [attendance, total] = await Promise.all([
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.attendance.findMany({
                        where,
                        include: {
                            user: {
                                select: { id: true, name: true, workEmail: true, position: true }
                            }
                        },
                        orderBy: [
                            orderBy,
                            { createdAt: 'desc' }
                        ],
                        skip,
                        take: Number(limit),
                    });
                }),
                database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                    return await client.attendance.count({ where });
                })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: attendance,
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
            console.error('Get attendance error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch attendance records'
            });
        }
    }
    /**
     * Get attendance record by ID (tenant-aware)
     */
    static async getAttendanceById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const attendance = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.attendance.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    },
                    include: {
                        user: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        }
                    }
                });
            });
            if (!attendance) {
                res.status(404).json({
                    success: false,
                    error: 'Attendance record not found'
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: attendance
            });
        }
        catch (error) {
            console.error('Get attendance by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch attendance record'
            });
        }
    }
    /**
     * Clock in (tenant-aware)
     */
    static async clockIn(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { userId: targetUserId } = req.body;
            const userId = targetUserId || req.user.id;
            const today = new Date();
            const startOfToday = new Date(today);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999);
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if already clocked in today
                const existingAttendance = await client.attendance.findFirst({
                    where: {
                        userId,
                        tenantId: req.tenantId,
                        date: { gte: startOfToday, lte: endOfToday },
                    }
                });
                if (existingAttendance && existingAttendance.checkIn) {
                    throw new types_1.ValidationError('Already clocked in today');
                }
                // Validate user exists and belongs to tenant
                const user = await client.user.findFirst({
                    where: {
                        id: userId,
                        tenantId: req.tenantId,
                        isActive: true,
                    }
                });
                if (!user) {
                    throw new types_1.NotFoundError('User not found in this tenant');
                }
                const clockInTime = new Date();
                let attendance;
                if (existingAttendance) {
                    // Update existing record
                    attendance = await client.attendance.update({
                        where: { id: existingAttendance.id },
                        data: {
                            checkIn: clockInTime,
                            status: 'PRESENT',
                        },
                        include: {
                            user: {
                                select: { id: true, name: true, workEmail: true, position: true }
                            }
                        }
                    });
                }
                else {
                    // Create new attendance record
                    attendance = await client.attendance.create({
                        data: {
                            tenantId: req.tenantId,
                            userId,
                            date: startOfToday,
                            checkIn: clockInTime,
                            status: 'PRESENT',
                        },
                        include: {
                            user: {
                                select: { id: true, name: true, workEmail: true, position: true }
                            }
                        }
                    });
                }
                res.status(200).json({
                    success: true,
                    data: attendance,
                    message: 'Clocked in successfully'
                });
            });
        }
        catch (error) {
            console.error('Clock in error:', error);
            if (error instanceof types_1.ValidationError || error instanceof types_1.NotFoundError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to clock in'
            });
        }
    }
    /**
     * Clock out (tenant-aware)
     */
    static async clockOut(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { userId: targetUserId } = req.body;
            const userId = targetUserId || req.user.id;
            const today = new Date();
            const startOfToday = new Date(today);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999);
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Find today's attendance record
                const attendance = await client.attendance.findFirst({
                    where: {
                        userId,
                        tenantId: req.tenantId,
                        date: { gte: startOfToday, lte: endOfToday },
                    }
                });
                if (!attendance || !attendance.checkIn) {
                    throw new types_1.ValidationError('No clock in record found for today');
                }
                if (attendance.checkOut) {
                    throw new types_1.ValidationError('Already clocked out today');
                }
                const clockOutTime = new Date();
                const updatedAttendance = await client.attendance.update({
                    where: { id: attendance.id },
                    data: {
                        checkOut: clockOutTime,
                    },
                    include: {
                        user: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        }
                    }
                });
                res.status(200).json({
                    success: true,
                    data: updatedAttendance,
                    message: 'Clocked out successfully'
                });
            });
        }
        catch (error) {
            console.error('Clock out error:', error);
            if (error instanceof types_1.ValidationError || error instanceof types_1.NotFoundError) {
                res.status(error instanceof types_1.NotFoundError ? 404 : 400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to clock out'
            });
        }
    }
    /**
     * Get today's attendance for current user (tenant-aware)
     */
    static async getTodayAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const userId = req.user.id;
            const today = new Date();
            const startOfToday = new Date(today);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999);
            const attendance = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.attendance.findFirst({
                    where: {
                        userId,
                        tenantId: req.tenantId,
                        date: { gte: startOfToday, lte: endOfToday },
                    },
                    include: {
                        user: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        }
                    }
                });
            });
            res.status(200).json({
                success: true,
                data: attendance
            });
        }
        catch (error) {
            console.error('Get today attendance error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch today\'s attendance'
            });
        }
    }
    /**
     * Get attendance dashboard summary (tenant-aware)
     */
    static async getDashboardSummary(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const today = new Date();
            const startOfToday = new Date(today);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999);
            const summary = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Get today's attendance summary
                const todaySummary = await client.attendance.groupBy({
                    by: ['status'],
                    where: {
                        tenantId: req.tenantId,
                        date: { gte: startOfToday, lte: endOfToday },
                    },
                    _count: true,
                });
                // Get present members today
                const presentMembers = await client.attendance.findMany({
                    where: {
                        tenantId: req.tenantId,
                        date: { gte: startOfToday, lte: endOfToday },
                        status: { in: ['PRESENT', 'LATE'] },
                    },
                    include: {
                        user: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        }
                    },
                    orderBy: { checkIn: 'asc' }
                });
                // Format summary
                const statusSummary = {
                    present: 0,
                    absent: 0,
                    late: 0,
                    halfDay: 0,
                    wfh: 0,
                };
                todaySummary.forEach((item) => {
                    switch (item.status) {
                        case 'PRESENT':
                            statusSummary.present = item._count;
                            break;
                        case 'ABSENT':
                            statusSummary.absent = item._count;
                            break;
                        case 'LATE':
                            statusSummary.late = item._count;
                            break;
                        case 'HALF_DAY':
                            statusSummary.halfDay = item._count;
                            break;
                        case 'WFH':
                            statusSummary.wfh = item._count;
                            break;
                    }
                });
                return {
                    summary: statusSummary,
                    presentMembers,
                    date: today,
                };
            });
            res.status(200).json({
                success: true,
                data: summary
            });
        }
        catch (error) {
            console.error('Get dashboard summary error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch dashboard summary'
            });
        }
    }
    /**
     * Get present members (tenant-aware)
     */
    static async getPresentMembers(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const today = new Date();
            const startOfToday = new Date(today);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999);
            const presentMembers = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.attendance.findMany({
                    where: {
                        tenantId: req.tenantId,
                        date: { gte: startOfToday, lte: endOfToday },
                        status: { in: ['PRESENT', 'LATE', 'WFH'] },
                        checkIn: { not: null },
                    },
                    include: {
                        user: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        }
                    },
                    orderBy: { checkIn: 'asc' }
                });
            });
            res.status(200).json({
                success: true,
                data: presentMembers
            });
        }
        catch (error) {
            console.error('Get present members error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch present members'
            });
        }
    }
    /**
     * Get my attendance summary (tenant-aware)
     */
    static async getMyAttendanceSummary(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const userId = req.user.id;
            const { month, year } = req.query;
            const targetDate = new Date(Number(year) || new Date().getFullYear(), Number(month) - 1 || new Date().getMonth());
            const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            const data = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                const attendanceRecords = await client.attendance.findMany({
                    where: {
                        userId,
                        tenantId: req.tenantId,
                        date: { gte: startOfMonth, lte: endOfMonth },
                    },
                    orderBy: { date: 'asc' }
                });
                // Calculate summary
                const summary = {
                    totalDays: attendanceRecords.length,
                    present: 0,
                    absent: 0,
                    late: 0,
                    halfDay: 0,
                    wfh: 0,
                };
                attendanceRecords.forEach((record) => {
                    switch (record.status) {
                        case 'PRESENT':
                            summary.present++;
                            break;
                        case 'ABSENT':
                            summary.absent++;
                            break;
                        case 'LATE':
                            summary.late++;
                            break;
                        case 'HALF_DAY':
                            summary.halfDay++;
                            break;
                        case 'WFH':
                            summary.wfh++;
                            break;
                    }
                });
                return {
                    summary,
                    records: attendanceRecords,
                    month: targetDate.getMonth() + 1,
                    year: targetDate.getFullYear(),
                };
            });
            res.status(200).json({
                success: true,
                data
            });
        }
        catch (error) {
            console.error('Get my attendance summary error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch attendance summary'
            });
        }
    }
    /**
     * Update attendance record (tenant-aware)
     */
    static async updateAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const { id } = req.params;
            const updateData = req.body;
            // Remove fields that shouldn't be updated directly
            delete updateData.tenantId;
            delete updateData.userId;
            delete updateData.createdAt;
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Check if attendance record exists and belongs to tenant
                const existingRecord = await client.attendance.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                    }
                });
                if (!existingRecord) {
                    throw new types_1.NotFoundError('Attendance record not found in this tenant');
                }
                // Convert date strings if provided
                if (updateData.checkIn)
                    updateData.checkIn = new Date(updateData.checkIn);
                if (updateData.checkOut)
                    updateData.checkOut = new Date(updateData.checkOut);
                if (updateData.date)
                    updateData.date = new Date(updateData.date);
                const attendance = await client.attendance.update({
                    where: { id },
                    data: {
                        ...updateData,
                        updatedAt: new Date()
                    },
                    include: {
                        user: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        }
                    }
                });
                res.status(200).json({
                    success: true,
                    data: attendance,
                    message: 'Attendance record updated successfully'
                });
            });
        }
        catch (error) {
            console.error('Update attendance error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to update attendance record'
            });
        }
    }
    /**
     * Create manual attendance entry (tenant-aware)
     */
    static async createAttendance(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required',
                });
                return;
            }
            const attendanceData = req.body;
            // Validate required fields
            if (!attendanceData.userId || !attendanceData.date) {
                res.status(400).json({
                    success: false,
                    error: 'User ID and date are required'
                });
                return;
            }
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                // Validate user exists and belongs to tenant
                const user = await client.user.findFirst({
                    where: {
                        id: attendanceData.userId,
                        tenantId: req.tenantId,
                        isActive: true,
                    }
                });
                if (!user) {
                    throw new types_1.ValidationError('User not found in this tenant');
                }
                // Check if attendance already exists for this date
                const targetDate = new Date(attendanceData.date);
                const startOfDay = new Date(targetDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(targetDate);
                endOfDay.setHours(23, 59, 59, 999);
                const existingAttendance = await client.attendance.findFirst({
                    where: {
                        userId: attendanceData.userId,
                        tenantId: req.tenantId,
                        date: { gte: startOfDay, lte: endOfDay },
                    }
                });
                if (existingAttendance) {
                    throw new types_1.ValidationError('Attendance record already exists for this date');
                }
                // Create attendance record
                const attendance = await client.attendance.create({
                    data: {
                        tenantId: req.tenantId,
                        userId: attendanceData.userId,
                        date: startOfDay,
                        checkIn: attendanceData.checkIn ? new Date(attendanceData.checkIn) : null,
                        checkOut: attendanceData.checkOut ? new Date(attendanceData.checkOut) : null,
                        status: attendanceData.status || 'PRESENT',
                        notes: attendanceData.notes,
                    },
                    include: {
                        user: {
                            select: { id: true, name: true, workEmail: true, position: true }
                        }
                    }
                });
                res.status(201).json({
                    success: true,
                    data: attendance,
                    message: 'Attendance record created successfully'
                });
            });
        }
        catch (error) {
            console.error('Create attendance error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: 'Failed to create attendance record'
            });
        }
    }
}
exports.AttendanceController = AttendanceController;
exports.default = AttendanceController;
//# sourceMappingURL=attendanceController.js.map