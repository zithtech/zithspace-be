"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeController = void 0;
const database_1 = require("@/config/database");
class EmployeeController {
    /* ---------------- CREATE EMPLOYEE ---------------- */
    static async createEmployee(req, res) {
        try {
            const { employee_code, first_name, last_name, gender, date_of_birth, blood_group, mobile, work_email, personal_email, status, } = req.body;
            const userId = req.user?.id;
            if (!employee_code ||
                !first_name ||
                !last_name ||
                !gender ||
                !date_of_birth ||
                !mobile ||
                !work_email ||
                !userId) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            const employee = await database_1.prisma.employee.create({
                data: {
                    employee_code,
                    first_name,
                    last_name,
                    gender,
                    date_of_birth: new Date(date_of_birth),
                    blood_group,
                    mobile,
                    work_email,
                    personal_email,
                    status: status ?? true,
                    // created_by: userId,
                },
            });
            res.status(201).json({
                success: true,
                data: employee,
                message: "Employee created successfully",
            });
        }
        catch (error) {
            console.error("Error creating employee:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create employee",
            });
        }
    }
    /* ---------------- GET ALL EMPLOYEES ---------------- */
    static async getEmployees(req, res) {
        try {
            const employees = await database_1.prisma.employee.findMany({
                orderBy: { created_at: "desc" },
            });
            res.status(200).json({
                success: true,
                data: employees,
            });
        }
        catch (error) {
            console.error("Error fetching employees:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employees",
            });
        }
    }
    /* ---------------- GET EMPLOYEE BY ID ---------------- */
    static async getEmployeeById(req, res) {
        try {
            const { id } = req.params;
            const employee = await database_1.prisma.employee.findUnique({
                where: { id },
            });
            if (!employee) {
                res.status(404).json({
                    success: false,
                    error: "Employee not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: employee,
            });
        }
        catch (error) {
            console.error("Error fetching employee:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employee",
            });
        }
    }
    /* ---------------- UPDATE EMPLOYEE ---------------- */
    static async updateEmployee(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;
            const existingEmployee = await database_1.prisma.employee.findUnique({
                where: { id },
            });
            if (!existingEmployee) {
                res.status(404).json({
                    success: false,
                    error: "Employee not found",
                });
                return;
            }
            const { employee_code, first_name, last_name, gender, date_of_birth, blood_group, mobile, work_email, personal_email, status, } = req.body;
            const updatedEmployee = await database_1.prisma.employee.update({
                where: { id },
                data: {
                    employee_code,
                    first_name,
                    last_name,
                    gender,
                    date_of_birth: date_of_birth ? new Date(date_of_birth) : undefined,
                    blood_group,
                    mobile,
                    work_email,
                    personal_email,
                    status,
                    //updated_by: userId,
                },
            });
            res.status(200).json({
                success: true,
                data: updatedEmployee,
                message: "Employee updated successfully",
            });
        }
        catch (error) {
            console.error("Error updating employee:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update employee",
            });
        }
    }
    /* ---------------- DELETE EMPLOYEE ---------------- */
    static async deleteEmployee(req, res) {
        try {
            const { id } = req.params;
            const existingEmployee = await database_1.prisma.employee.findUnique({
                where: { id },
            });
            if (!existingEmployee) {
                res.status(404).json({
                    success: false,
                    error: "Employee not found",
                });
                return;
            }
            await database_1.prisma.employee.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Employee deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting employee:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete employee",
            });
        }
    }
}
exports.EmployeeController = EmployeeController;
//# sourceMappingURL=employeeController.js.map