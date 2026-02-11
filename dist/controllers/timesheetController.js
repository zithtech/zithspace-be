"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimesheetController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
// import { getSundayToSaturdayWeek } from "@/utils/week.util";
class TimesheetController {
    /**
     * Create a new timesheet
     */
    static async createTimesheet(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const data = req.body;
            // Check if timesheet for same week exists
            const existing = await database_1.prisma.timesheet.findFirst({
                where: {
                    tenantId: req.tenantId,
                    userId: req.user.id,
                    weekStart: new Date(data.weekStart),
                    //  weekStart,
                },
            });
            if (existing)
                throw new types_1.ValidationError("Timesheet for this week already exists");
            // Calculate total hours
            const totalHours = data.rows.reduce((sum, row) => sum + row.hours, 0);
            const timesheet = await database_1.prisma.timesheet.create({
                data: {
                    tenantId: req.tenantId,
                    userId: req.user.id,
                    weekStart: new Date(data.weekStart),
                    weekEnd: new Date(data.weekEnd),
                    //  weekStart, // ✅ Sun
                    //  weekEnd,
                    totalHours,
                    status: "DRAFT",
                    createdById: req.user.id,
                    rows: {
                        create: data.rows.map((row) => ({
                            tenantId: req.tenantId,
                            day: new Date(row.day),
                            updatedById: req.user.id,
                            projectName: row.projectName,
                            taskName: row.taskName,
                            description: row.description,
                            hours: row.hours,
                            billable: row.billable || false,
                            createdById: req.user.id,
                        })),
                    },
                },
                include: { rows: true },
            });
            res.status(201).json({ success: true, data: timesheet });
        }
        catch (error) {
            console.error("Create timesheet error:", error);
            res.status(error instanceof types_1.ValidationError ? 400 : 500).json({
                success: false,
                error: error.message || "Failed to create timesheet",
            });
        }
    }
    /**
     * Get all timesheets for current tenant with pagination
     */
    static async getTimesheets(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            // const { page = 1, limit = 20, status, userId } = req.query;
            const { page = 1, limit = 20, status, userId, fromDate, toDate, } = req.query;
            const where = { tenantId: req.tenantId };
            if (status)
                where.status = status;
            if (userId)
                where.userId = userId;
            // if (fromDate && toDate) {
            //   where.weekStart = {
            //     gte: new Date(fromDate as string),
            //     lte: new Date(toDate as string),
            //   };
            // }
            if (fromDate && toDate) {
                where.AND = [
                    { weekStart: { lte: new Date(toDate) } },
                    { weekEnd: { gte: new Date(fromDate) } },
                ];
            }
            const skip = (Number(page) - 1) * Number(limit);
            const [timesheets, total] = await Promise.all([
                database_1.prisma.timesheet.findMany({
                    where,
                    include: {
                        rows: true,
                        user: { select: { id: true, name: true } },
                        approvedBy: { select: { id: true, name: true } },
                    },
                    orderBy: { weekStart: "desc" },
                    skip,
                    take: Number(limit),
                }),
                database_1.prisma.timesheet.count({ where }),
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: timesheets,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: totalPages,
                    hasNext: Number(page) < totalPages,
                    hasPrev: Number(page) > 1,
                },
            });
        }
        catch (error) {
            console.error("Get timesheets error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch timesheets",
            });
        }
    }
    /**
     * Get timesheet by ID
     */
    static async getTimesheetById(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const timesheet = await database_1.prisma.timesheet.findFirst({
                where: { id, tenantId: req.tenantId },
                include: {
                    rows: true,
                    user: { select: { id: true, name: true } },
                    approvedBy: { select: { id: true, name: true } },
                },
            });
            if (!timesheet)
                throw new types_1.NotFoundError("Timesheet not found");
            res.status(200).json({ success: true, data: timesheet });
        }
        catch (error) {
            console.error("Get timesheet by ID error:", error);
            res
                .status(error instanceof types_1.NotFoundError ? 404 : 500)
                .json({ success: false, error: error.message });
        }
    }
    /**
     * Approve or reject a timesheet
     */
    static async approveTimesheet(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            console.log("REQ BODY 👉", req.body);
            const { status, rejectReason } = req.body;
            if (!["APPROVED", "REJECTED"].includes(status)) {
                throw new types_1.ValidationError("Status must be APPROVED or REJECTED");
            }
            const timesheet = await database_1.prisma.timesheet.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!timesheet)
                throw new types_1.NotFoundError("Timesheet not found");
            const updated = await database_1.prisma.timesheet.update({
                where: { id },
                data: {
                    status,
                    rejectReason: status === "REJECTED" ? rejectReason : null,
                    approvedById: req.user.id,
                    updatedById: req.user.id,
                    updatedAt: new Date(),
                },
                include: { rows: true, approvedBy: true },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: `Timesheet ${status.toLowerCase()}`,
            });
        }
        catch (error) {
            console.error("Approve timesheet error:", error);
            res
                .status(error instanceof types_1.ValidationError
                ? 400
                : error instanceof types_1.NotFoundError
                    ? 404
                    : 500)
                .json({ success: false, error: error.message });
        }
    }
    /**
     * Update timesheet rows or basic info
     */
    static async updateTimesheet(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const data = req.body;
            console.log("data", data);
            const timesheet = await database_1.prisma.timesheet.findFirst({
                where: { id, tenantId: req.tenantId },
                include: { rows: true },
            });
            console.log("ROWS FROM DB 👉", timesheet.rows);
            if (!timesheet)
                throw new types_1.NotFoundError("Timesheet not found");
            if (data.rows && data.rows.length) {
                for (const rowData of data.rows) {
                    if (!rowData.id)
                        continue;
                    await database_1.prisma.timesheetRow.update({
                        where: { id: rowData.id },
                        data: {
                            day: rowData.day,
                            description: rowData.description,
                            hours: rowData.hours,
                            billable: rowData.billable,
                            // updatedById: req.user.id,
                            updatedAt: new Date(),
                            // projectId: rowData.projectId ?? null,
                            // taskId: rowData.taskId ?? null,
                            taskName: rowData.taskName,
                            projectName: rowData.projectName,
                            updatedBy: {
                                connect: { id: req.user.id }, // dynamically using logged-in user ID
                            },
                        },
                    });
                }
            }
            // ✅ Recalculate total hours
            const updatedRows = await database_1.prisma.timesheetRow.findMany({
                where: { timesheetId: id },
            });
            const totalHours = updatedRows.reduce((sum, r) => sum + Number(r.hours || 0), 0);
            console.log("TOTAL HOURS 👉", totalHours);
            // Update basic info
            const updated = await database_1.prisma.timesheet.update({
                where: { id },
                data: {
                    weekStart: data.weekStart ? new Date(data.weekStart) : undefined,
                    weekEnd: data.weekEnd ? new Date(data.weekEnd) : undefined,
                    // weekStart: weekRange?.weekStart,
                    // weekEnd: weekRange?.weekEnd,
                    status: data.status,
                    rejectReason: data.rejectReason,
                    updatedById: req.user.id,
                    updatedAt: new Date(),
                    totalHours: totalHours,
                },
                include: { rows: true },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Timesheet updated successfully",
            });
        }
        catch (error) {
            console.error("Update timesheet error:", error);
            res
                .status(error instanceof types_1.ValidationError
                ? 400
                : error instanceof types_1.NotFoundError
                    ? 404
                    : 500)
                .json({ success: false, error: error.message });
        }
    }
    /**
     * Delete timesheet (soft delete or permanent)
     */
    static async deleteTimesheet(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const timesheet = await database_1.prisma.timesheet.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!timesheet)
                throw new types_1.NotFoundError("Timesheet not found");
            await database_1.prisma.timesheetRow.deleteMany({ where: { timesheetId: id } });
            await database_1.prisma.timesheet.delete({ where: { id } });
            res.status(200).json({
                success: true,
                message: "Timesheet deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete timesheet error:", error);
            res
                .status(error instanceof types_1.NotFoundError ? 404 : 500)
                .json({ success: false, error: error.message });
        }
    }
    static async getTimesheetMeta(req, res) {
        try {
            if (!req.user || !req.tenantId) {
                throw new types_1.ValidationError("Unauthorized");
            }
            // 1️⃣ User projects
            const projects = await database_1.prisma.project.findMany({
                where: {
                    tenantId: req.tenantId,
                    members: {
                        some: {
                            userId: req.user.id,
                        },
                    },
                },
                select: {
                    id: true,
                    name: true,
                },
            });
            // 2️⃣ User assigned tasks
            const rawTasks = await database_1.prisma.ticket.findMany({
                where: {
                    tenantId: req.tenantId,
                    assigneeId: req.user.id,
                },
                select: {
                    id: true,
                    title: true,
                    projectId: true,
                },
            });
            // 🔥 Map title → name (Frontend requirement)
            const tasks = rawTasks.map((t) => ({
                id: t.id,
                name: t.title,
                projectId: t.projectId,
            }));
            res.status(200).json({
                success: true,
                data: {
                    projects,
                    tasks,
                },
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    static async submitTimesheet(req, res) {
        const { id } = req.params;
        try {
            // 1️⃣ Find the timesheet with related data
            const timesheet = await database_1.prisma.timesheet.findUnique({
                where: { id },
                include: {
                    user: true,
                    rows: true,
                },
            });
            if (!timesheet) {
                return res.status(404).json({ message: "Timesheet not found" });
            }
            if (!timesheet.rows || timesheet.rows.length === 0) {
                return res.status(400).json({
                    message: "Cannot submit empty timesheet",
                });
            }
            // 4️⃣ Validate: Check total hours
            const totalHours = timesheet.rows.reduce((sum, row) => sum + row.hours, 0);
            if (totalHours <= 0) {
                return res.status(400).json({
                    message: "Timesheet must have positive hours",
                });
            }
            // 5️⃣ Update status to SUBMITTED
            const updated = await database_1.prisma.timesheet.update({
                where: { id },
                data: {
                    status: "SUBMITTED",
                    //submittedAt: new Date() // Add submission timestamp
                },
                include: {
                    user: true,
                    rows: true,
                },
            });
            // 6️⃣ Optional: Send notification
            // await sendTimesheetSubmittedNotification(updated);
            return res.json(updated);
        }
        catch (err) {
            console.error("Submit timesheet error:", err);
            return res.status(500).json({
                message: "Failed to submit timesheet",
                error: process.env.NODE_ENV === "development" ? err.message : undefined,
            });
        }
    }
}
exports.TimesheetController = TimesheetController;
exports.default = TimesheetController;
//# sourceMappingURL=timesheetController.js.map