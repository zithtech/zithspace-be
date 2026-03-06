"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeWorkDetailController = void 0;
const database_1 = require("@/config/database");
class EmployeeWorkDetailController {
    /* ================= CREATE WORK DETAIL ================= */
    static async createWorkDetail(req, res) {
        try {
            if (!req.user?.id) {
                res
                    .status(401)
                    .json({ success: false, error: "Unauthorized" });
                return;
            }
            const { employeeId, department, team, employeeType, workLocation, workShift, positionId } = req.body;
            if (!employeeId ||
                !department ||
                !team ||
                !employeeType ||
                !workLocation ||
                !workShift) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            // check employee exists
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
            const workDetail = await database_1.prisma.employeeWorkDetail.create({
                data: {
                    employee: { connect: { id: employeeId } },
                    department,
                    team,
                    employeeType,
                    workLocation,
                    workShift,
                    createdById: req.user.id,
                    position: { connect: { id: positionId }
                    }
                },
            });
            res.status(201).json({
                success: true,
                data: workDetail,
                message: "Employee work detail created successfully",
            });
        }
        catch (error) {
            console.error("Error creating work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create employee work detail",
            });
        }
    }
    /* ================= GET WORK DETAIL BY EMPLOYEE ================= */
    static async getWorkDetailByEmployee(req, res) {
        try {
            const { employeeId } = req.params;
            const workDetail = await database_1.prisma.employeeWorkDetail.findFirst({
                where: { employeeId },
            });
            if (!workDetail) {
                res.status(404).json({
                    success: false,
                    error: "Work detail not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: workDetail,
            });
        }
        catch (error) {
            console.error("Error fetching work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employee work detail",
            });
        }
    }
    /* ================= GET WORK DETAIL BY ID ================= */
    static async getWorkDetailById(req, res) {
        try {
            const { id } = req.params;
            const workDetail = await database_1.prisma.employeeWorkDetail.findUnique({
                where: { id },
            });
            if (!workDetail) {
                res.status(404).json({
                    success: false,
                    error: "Work detail not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: workDetail,
            });
        }
        catch (error) {
            console.error("Error fetching work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employee work detail",
            });
        }
    }
    /* ================= UPDATE WORK DETAIL ================= */
    static async updateWorkDetail(req, res) {
        try {
            if (!req.user?.id) {
                res
                    .status(401)
                    .json({ success: false, error: "Unauthorized" });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.employeeWorkDetail.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Work detail not found",
                });
                return;
            }
            const updated = await database_1.prisma.employeeWorkDetail.update({
                where: { id },
                data: {
                    department: req.body.department,
                    team: req.body.team,
                    employeeType: req.body.employeeType,
                    workLocation: req.body.workLocation,
                    workShift: req.body.workShift,
                    updatedById: req.user.id,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Employee work detail updated successfully",
            });
        }
        catch (error) {
            console.error("Error updating work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update employee work detail",
            });
        }
    }
    /* ================= DELETE WORK DETAIL ================= */
    static async deleteWorkDetail(req, res) {
        try {
            const { id } = req.params;
            const existing = await database_1.prisma.employeeWorkDetail.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Work detail not found",
                });
                return;
            }
            await database_1.prisma.employeeWorkDetail.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Employee work detail deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete employee work detail",
            });
        }
    }
}
exports.EmployeeWorkDetailController = EmployeeWorkDetailController;
//# sourceMappingURL=employeeWorkDetailesController.js.map