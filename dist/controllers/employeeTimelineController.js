"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeTimelineController = void 0;
const database_1 = require("@/config/database");
class EmployeeTimelineController {
    /* ================= CREATE EMPLOYEE TIMELINE ================= */
    static async createTimeline(req, res) {
        try {
            if (!req.user?.id) {
                res.status(401).json({
                    success: false,
                    error: "Unauthorized",
                });
                return;
            }
            const { employeeId, joiningDate, trainingCompletionDate } = req.body;
            if (!employeeId || !joiningDate || !trainingCompletionDate) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            // 🔎 check employee exists
            const employee = await database_1.prisma.employee.findUnique({
                where: { id: employeeId },
            });
            if (!employee) {
                res.status(404).json({
                    success: false,
                    error: "Employee not found",
                });
                return;
            }
            // 🔁 one timeline per employee check (optional but recommended)
            const existingTimeline = await database_1.prisma.employeeTimeline.findFirst({
                where: { employeeId },
            });
            if (existingTimeline) {
                res.status(400).json({
                    success: false,
                    error: "Employee timeline already exists",
                });
                return;
            }
            const timeline = await database_1.prisma.employeeTimeline.create({
                data: {
                    employeeId,
                    joiningDate: new Date(joiningDate),
                    trainingCompletionDate: new Date(trainingCompletionDate),
                    createdById: req.user.id,
                },
            });
            res.status(201).json({
                success: true,
                data: timeline,
                message: "Employee timeline created successfully",
            });
        }
        catch (error) {
            console.error("Error creating employee timeline:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create employee timeline",
            });
        }
    }
    /* ================= GET TIMELINE BY EMPLOYEE ================= */
    static async getTimelineByEmployee(req, res) {
        try {
            const { employeeId } = req.params;
            const timeline = await database_1.prisma.employeeTimeline.findFirst({
                where: { employeeId },
            });
            if (!timeline) {
                res.status(404).json({
                    success: false,
                    error: "Employee timeline not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: timeline,
            });
        }
        catch (error) {
            console.error("Error fetching employee timeline:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employee timeline",
            });
        }
    }
    /* ================= GET TIMELINE BY ID ================= */
    static async getTimelineById(req, res) {
        try {
            const { id } = req.params;
            const timeline = await database_1.prisma.employeeTimeline.findUnique({
                where: { id },
            });
            if (!timeline) {
                res.status(404).json({
                    success: false,
                    error: "Employee timeline not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: timeline,
            });
        }
        catch (error) {
            console.error("Error fetching employee timeline:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employee timeline",
            });
        }
    }
    /* ================= UPDATE EMPLOYEE TIMELINE ================= */
    static async updateTimeline(req, res) {
        try {
            if (!req.user?.id) {
                res.status(401).json({
                    success: false,
                    error: "Unauthorized",
                });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.employeeTimeline.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Employee timeline not found",
                });
                return;
            }
            const updated = await database_1.prisma.employeeTimeline.update({
                where: { id },
                data: {
                    joiningDate: req.body.joiningDate
                        ? new Date(req.body.joiningDate)
                        : undefined,
                    trainingCompletionDate: req.body.trainingCompletionDate
                        ? new Date(req.body.trainingCompletionDate)
                        : undefined,
                    updatedById: req.user.id,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Employee timeline updated successfully",
            });
        }
        catch (error) {
            console.error("Error updating employee timeline:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update employee timeline",
            });
        }
    }
    /* ================= DELETE EMPLOYEE TIMELINE ================= */
    static async deleteTimeline(req, res) {
        try {
            const { id } = req.params;
            const existing = await database_1.prisma.employeeTimeline.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Employee timeline not found",
                });
                return;
            }
            await database_1.prisma.employeeTimeline.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Employee timeline deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting employee timeline:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete employee timeline",
            });
        }
    }
}
exports.EmployeeTimelineController = EmployeeTimelineController;
//# sourceMappingURL=employeeTimelineController.js.map