"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixedHolidayController = void 0;
const database_1 = require("@/config/database");
class FixedHolidayController {
    static async createFixedHoliday(req, res) {
        try {
            if (!req.tenantId) {
                res
                    .status(400)
                    .json({
                    success: false,
                    error: "Tenant context missing",
                });
                return;
            }
            const { holidayName, country, state, fromDate, toDate, type, rule } = req.body;
            if (!holidayName || !country || !fromDate || !toDate || !type || !rule) {
                res
                    .status(400)
                    .json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            const fixedHoliday = await database_1.prisma.fixedHoliday.create({
                data: {
                    tenantId: req.tenantId,
                    holidayName,
                    country,
                    state, // Prisma handles String[] automatically
                    fromDate: new Date(fromDate),
                    toDate: new Date(toDate),
                    type,
                    rule,
                },
            });
            res
                .status(201)
                .json({
                success: true,
                data: fixedHoliday,
                message: "Holiday created successfully",
            });
        }
        catch (error) {
            console.error("Error creating fixed holiday:", error);
            res
                .status(500)
                .json({
                success: false,
                error: "Failed to create fixed holiday",
            });
        }
    }
    static async getFixedHolidays(req, res) {
        try {
            if (!req.tenantId) {
                res
                    .status(400)
                    .json({
                    success: false,
                    error: "Tenant context missing",
                });
                return;
            }
            const holidays = await database_1.prisma.fixedHoliday.findMany({
                where: { tenantId: req.tenantId },
                orderBy: { fromDate: "asc" },
            });
            res.status(200).json({ success: true, data: holidays });
        }
        catch (error) {
            console.error("Error fetching fixed holidays:", error);
            res
                .status(500)
                .json({
                success: false,
                error: "Failed to fetch fixed holidays",
            });
        }
    }
    static async getFixedHolidayById(req, res) {
        try {
            if (!req.tenantId) {
                res
                    .status(400)
                    .json({
                    success: false,
                    error: "Tenant context missing",
                });
                return;
            }
            const { id } = req.params;
            const holiday = await database_1.prisma.fixedHoliday.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!holiday) {
                res
                    .status(404)
                    .json({
                    success: false,
                    error: "Fixed holiday not found",
                });
                return;
            }
            res.status(200).json({ success: true, data: holiday });
        }
        catch (error) {
            console.error("Error fetching fixed holiday:", error);
            res
                .status(500)
                .json({
                success: false,
                error: "Failed to fetch fixed holiday",
            });
        }
    }
    static async updateFixedHoliday(req, res) {
        try {
            if (!req.tenantId) {
                res
                    .status(400)
                    .json({
                    success: false,
                    error: "Tenant context missing",
                });
                return;
            }
            const { id } = req.params;
            const { holidayName, country, state, fromDate, toDate, type, rule } = req.body;
            // Verify existence and ownership
            const existing = await database_1.prisma.fixedHoliday.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res
                    .status(404)
                    .json({
                    success: false,
                    error: "Fixed holiday not found",
                });
                return;
            }
            const updatedHoliday = await database_1.prisma.fixedHoliday.update({
                where: { id },
                data: {
                    holidayName,
                    country,
                    state,
                    fromDate: fromDate ? new Date(fromDate) : undefined,
                    toDate: toDate ? new Date(toDate) : undefined,
                    type,
                    rule,
                },
            });
            res
                .status(200)
                .json({
                success: true,
                data: updatedHoliday,
                message: "Holiday updated successfully",
            });
        }
        catch (error) {
            console.error("Error updating fixed holiday:", error);
            res
                .status(500)
                .json({
                success: false,
                error: "Failed to update fixed holiday",
            });
        }
    }
    static async deleteFixedHoliday(req, res) {
        try {
            if (!req.tenantId) {
                res
                    .status(400)
                    .json({
                    success: false,
                    error: "Tenant context missing",
                });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.fixedHoliday.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res
                    .status(404)
                    .json({
                    success: false,
                    error: "Fixed holiday not found",
                });
                return;
            }
            await database_1.prisma.fixedHoliday.delete({
                where: { id },
            });
            res
                .status(200)
                .json({
                success: true,
                message: "Fixed holiday deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting fixed holiday:", error);
            res
                .status(500)
                .json({
                success: false,
                error: "Failed to delete fixed holiday",
            });
        }
    }
}
exports.FixedHolidayController = FixedHolidayController;
//# sourceMappingURL=fixedHoliday.controller.js.map