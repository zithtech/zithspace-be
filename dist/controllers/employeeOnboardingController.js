"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeOnboardingController = void 0;
const database_1 = require("@/config/database");
const createEmployeeDetailes_1 = require("./createEmployeeDetailes");
const employeeEmployementDetailes_1 = require("./employeeEmployementDetailes");
const bankAndPayrolllController_1 = require("./bankAndPayrolllController");
const employeeHistoryController_1 = require("./employeeHistoryController");
const employeeAssets_1 = require("./employeeAssets");
class EmployeeOnboardingController {
    // ✅ CREATE Employee (Full Onboarding)
    static async create(req, res) {
        try {
            const { personal, employment, bank, history, assets } = req.body;
            const result = await database_1.prisma.$transaction(async (tx) => {
                let employee = null;
                // 1️⃣ Personal Details (Mandatory)
                if (personal) {
                    employee = await (0, createEmployeeDetailes_1.createPersonalDetails)({
                        ...req,
                        body: { personal },
                    }, undefined, tx);
                }
                else {
                    throw new Error("Personal details are required to create employee");
                }
                // 2️⃣ Employment Details (Optional)
                if (employment) {
                    await (0, employeeEmployementDetailes_1.createEmploymentDetails)({ ...req, body: { employment } }, employee.id, tx);
                }
                // 3️⃣ Bank & Payroll (Optional)
                if (bank) {
                    await (0, bankAndPayrolllController_1.createBankPayrollDetails)({ ...req, body: { bank } }, employee.id, tx);
                }
                // 4️⃣ Employee History (Optional)
                if (history?.length) {
                    await (0, employeeHistoryController_1.createEmployeeHistory)({ ...req, body: { history } }, employee.id, tx);
                }
                // 5️⃣ Assets (Optional)
                if (assets?.length) {
                    await (0, employeeAssets_1.createEmployeeAssets)({ ...req, body: { assets } }, employee.id, tx);
                }
                return employee;
            }, { timeout: 30000 });
            res.status(201).json({
                success: true,
                data: result,
                message: "Employee data saved successfully",
            });
        }
        catch (err) {
            console.error("Onboarding Error:", err);
            res.status(500).json({
                success: false,
                error: err.message || "Internal Server Error",
            });
        }
    }
    // ✅ GET All Employees (List View)
    static async getAll(req, res) {
        try {
            const employees = await (0, createEmployeeDetailes_1.getAllEmployees)(req);
            res.status(200).json({
                success: true,
                data: employees,
            });
        }
        catch (err) {
            console.error("Get All Employees Error:", err);
            res.status(500).json({
                success: false,
                error: err.message || "Internal Server Error",
            });
        }
    }
    // ✅ GET Employee By ID (Full Details)
    static async getById(req, res) {
        try {
            const { employeeId } = req.params;
            // Fetch all details in parallel
            const [personal, employment, bank, history, assets] = await Promise.all([
                (0, createEmployeeDetailes_1.getPersonalDetails)(req, employeeId).catch(() => null),
                (0, employeeEmployementDetailes_1.getEmploymentDetails)(req, employeeId).catch(() => null),
                (0, bankAndPayrolllController_1.getBankPayrollDetails)(req, employeeId).catch(() => null),
                (0, employeeHistoryController_1.getEmployeeHistory)(req, employeeId).catch(() => []),
                (0, employeeAssets_1.getEmployeeAssets)(req, employeeId).catch(() => []),
            ]);
            if (!personal) {
                return res.status(404).json({
                    success: false,
                    error: "Employee not found",
                });
            }
            res.status(200).json({
                success: true,
                data: {
                    personal,
                    employment,
                    bank,
                    history,
                    assets,
                },
            });
        }
        catch (err) {
            console.error("Get Employee By ID Error:", err);
            res.status(500).json({
                success: false,
                error: err.message || "Internal Server Error",
            });
        }
    }
    // ✅ UPDATE Employee (Full Update)
    static async update(req, res) {
        try {
            const { employeeId } = req.params;
            const { personal, employment, bank, history, assets } = req.body;
            const result = await database_1.prisma.$transaction(async (tx) => {
                let employee = null;
                // 1️⃣ Update Personal Details
                if (personal) {
                    employee = await (0, createEmployeeDetailes_1.updatePersonalDetails)({ ...req, body: { personal } }, employeeId, tx);
                }
                // 2️⃣ Update Employment Details
                if (employment) {
                    await (0, employeeEmployementDetailes_1.updateEmploymentDetails)({ ...req, body: { employment } }, employeeId, tx);
                }
                // 3️⃣ Update Bank & Payroll
                if (bank) {
                    await (0, bankAndPayrolllController_1.updateBankPayrollDetails)({ ...req, body: { bank } }, employeeId, tx);
                }
                // 4️⃣ Update History (Delete All & Re-create)
                if (history) {
                    await (0, employeeHistoryController_1.deleteAllEmployeeHistory)(req, employeeId, tx);
                    if (history.length > 0) {
                        await (0, employeeHistoryController_1.createEmployeeHistory)({ ...req, body: { history } }, employeeId, tx);
                    }
                }
                // 5️⃣ Update Assets (Delete All & Re-create)
                if (assets) {
                    await (0, employeeAssets_1.deleteAllEmployeeAssets)(req, employeeId, tx);
                    if (assets.length > 0) {
                        await (0, employeeAssets_1.createEmployeeAssets)({ ...req, body: { assets } }, employeeId, tx);
                    }
                }
                return employee;
            }, { timeout: 30000 });
            res.status(200).json({
                success: true,
                data: result || { id: employeeId },
                message: "Employee updated successfully",
            });
        }
        catch (err) {
            console.error("Update Employee Error:", err);
            res.status(500).json({
                success: false,
                error: err.message || "Internal Server Error",
            });
        }
    }
    // ✅ DELETE Employee (Soft Delete)
    static async delete(req, res) {
        try {
            const { employeeId } = req.params;
            const result = await (0, createEmployeeDetailes_1.deletePersonalDetails)(req, employeeId);
            res.status(200).json({
                success: true,
                message: "Employee deleted successfully",
                data: result,
            });
        }
        catch (err) {
            console.error("Delete Employee Error:", err);
            res.status(500).json({
                success: false,
                error: err.message || "Internal Server Error",
            });
        }
    }
}
exports.EmployeeOnboardingController = EmployeeOnboardingController;
//# sourceMappingURL=employeeOnboardingController.js.map