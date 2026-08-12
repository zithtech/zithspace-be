"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeOnboardingController = void 0;
const onboardingPool_1 = require("@/db/onboardingPool");
const createEmployeeDetailes_1 = require("./createEmployeeDetailes");
const employeeEmployementDetailes_1 = require("./employeeEmployementDetailes");
const bankAndPayrolllController_1 = require("./bankAndPayrolllController");
const employeeHistoryController_1 = require("./employeeHistoryController");
const employeeAssets_1 = require("./employeeAssets");
const employeeDocumentController_1 = require("./employeeDocumentController");
const transactionHistory_1 = require("@/utils/transactionHistory");
const empName = (r) => [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();
const empLabel = (r) => `${r?.employee_code ?? ""}${r?.employee_code && empName(r) ? " · " : ""}${empName(r)}`.trim() || "Employee";
class EmployeeOnboardingController {
    // ✅ CREATE Employee (Full Onboarding)
    static async create(req, res) {
        try {
            const { personal, employment, bank, history, assets, documents } = req.body;
            if (!req.tenantId)
                throw new Error("Unauthorized");
            const result = await (0, onboardingPool_1.withTenant)(req.tenantId, async (client) => {
                let employee = null;
                // 1️⃣ Personal Details (Mandatory)
                if (personal) {
                    employee = await (0, createEmployeeDetailes_1.createPersonalDetails)({
                        ...req,
                        body: { personal },
                    }, undefined, client);
                }
                else {
                    throw new Error("Personal details are required to create employee");
                }
                // 2️⃣ Employment Details (Optional)
                if (employment) {
                    await (0, employeeEmployementDetailes_1.createEmploymentDetails)({ ...req, body: { employment } }, employee.id, client);
                }
                // 3️⃣ Bank & Payroll (Optional)
                if (bank) {
                    await (0, bankAndPayrolllController_1.createBankPayrollDetails)({ ...req, body: { bank } }, employee.id, client);
                }
                // 4️⃣ Employee History (Optional)
                if (history?.length) {
                    await (0, employeeHistoryController_1.createEmployeeHistory)({ ...req, body: { history } }, employee.id, client);
                }
                // 5️⃣ Assets (Optional)
                if (assets?.length) {
                    await (0, employeeAssets_1.createEmployeeAssets)({ ...req, body: { assets } }, employee.id, client);
                }
                // 6️⃣ Documents (Optional)
                if (documents?.length) {
                    await (0, employeeDocumentController_1.createEmployeeDocumentsBulk)({ ...req, body: { documents } }, employee.id, client);
                }
                return employee;
            });
            const sections = ["personal", employment && "employment", bank && "bank", history?.length && "history", assets?.length && "assets", documents?.length && "documents"].filter(Boolean);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ONBOARDING,
                page: transactionHistory_1.Page.ONBOARDING_EMPLOYEES,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Created employee ${empLabel(result)} (sections: ${sections.join(", ")})`,
                entityType: transactionHistory_1.EntityType.EMPLOYEE,
                entityId: result?.id,
                entityLabel: empLabel(result),
                afterData: {
                    employeeCode: result?.employee_code,
                    firstName: result?.first_name,
                    lastName: result?.last_name,
                    workEmail: result?.work_email,
                    sections,
                },
            });
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
    // ✅ GET Upcoming Birthdays (Current Month)
    static async getUpcomingBirthdays(req, res) {
        try {
            const birthdays = await (0, createEmployeeDetailes_1.getUpcomingBirthdays)(req);
            res.status(200).json({
                success: true,
                data: birthdays,
            });
        }
        catch (err) {
            console.error("Get Upcoming Birthdays Error:", err);
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
            const [personal, employment, bank, history, assets, documents] = await Promise.all([
                (0, createEmployeeDetailes_1.getPersonalDetails)(req, employeeId).catch(() => null),
                (0, employeeEmployementDetailes_1.getEmploymentDetails)(req, employeeId).catch(() => null),
                (0, bankAndPayrolllController_1.getBankPayrollDetails)(req, employeeId).catch(() => null),
                (0, employeeHistoryController_1.getEmployeeHistory)(req, employeeId).catch(() => []),
                (0, employeeAssets_1.getEmployeeAssets)(req, employeeId).catch(() => []),
                (0, employeeDocumentController_1.getEmployeeDocuments)(req, employeeId).catch(() => []),
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
                    documents,
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
            if (!employeeId || employeeId === "undefined" || employeeId === "null") {
                return res.status(400).json({
                    success: false,
                    error: "Invalid or missing Employee ID",
                });
            }
            const { personal, employment, bank, history, assets, documents } = req.body;
            if (!req.tenantId)
                throw new Error("Unauthorized");
            const result = await (0, onboardingPool_1.withTenant)(req.tenantId, async (client) => {
                let employee = null;
                // 1️⃣ Update Personal Details
                if (personal) {
                    employee = await (0, createEmployeeDetailes_1.updatePersonalDetails)({ ...req, body: { personal } }, employeeId, client);
                }
                // 2️⃣ Update Employment Details
                if (employment) {
                    await (0, employeeEmployementDetailes_1.updateEmploymentDetails)({ ...req, body: { employment } }, employeeId, client);
                }
                // 3️⃣ Update Bank & Payroll
                if (bank) {
                    await (0, bankAndPayrolllController_1.updateBankPayrollDetails)({ ...req, body: { bank } }, employeeId, client);
                }
                // 4️⃣ Update History (Delete All & Re-create)
                if (history) {
                    await (0, employeeHistoryController_1.deleteAllEmployeeHistory)(req, employeeId, client);
                    if (history.length > 0) {
                        await (0, employeeHistoryController_1.createEmployeeHistory)({ ...req, body: { history } }, employeeId, client);
                    }
                }
                // 5️⃣ Update Assets (Delete All & Re-create)
                if (assets) {
                    await (0, employeeAssets_1.deleteAllEmployeeAssets)(req, employeeId, client);
                    if (assets.length > 0) {
                        await (0, employeeAssets_1.createEmployeeAssets)({ ...req, body: { assets } }, employeeId, client);
                    }
                }
                // 6️⃣ Documents (Append Only)
                if (documents && documents.length > 0) {
                    await (0, employeeDocumentController_1.createEmployeeDocumentsBulk)({ ...req, body: { documents } }, employeeId, client);
                }
                return employee;
            });
            const sections = [personal && "personal", employment && "employment", bank && "bank", history && "history", assets && "assets", documents && "documents"].filter(Boolean);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ONBOARDING,
                page: transactionHistory_1.Page.ONBOARDING_EMPLOYEES,
                action: transactionHistory_1.Action.UPDATE,
                actionLabel: `Updated employee onboarding${result ? ` ${empLabel(result)}` : ""} (sections: ${sections.join(", ")})`,
                entityType: transactionHistory_1.EntityType.EMPLOYEE,
                entityId: employeeId,
                entityLabel: result ? empLabel(result) : `Employee ${employeeId}`,
                afterData: { updatedSections: sections },
                metadata: { sections },
            });
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
            const emp = result?.employee;
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.HR,
                module: transactionHistory_1.Module.ONBOARDING,
                page: transactionHistory_1.Page.ONBOARDING_EMPLOYEES,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Deleted employee ${empLabel(emp)}`,
                entityType: transactionHistory_1.EntityType.EMPLOYEE,
                entityId: employeeId,
                entityLabel: empLabel(emp),
                beforeData: { status: true },
                afterData: { status: false },
                changedFields: ["status"],
            });
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
    // ✅ PROMOTE Employee
    static async promote(req, res) {
        try {
            const { employeeId } = req.params;
            const { positionId, subDepartmentId, promotionDate } = req.body;
            const tenantId = req.tenantId;
            const userId = req.user.id;
            if (!positionId || !promotionDate) {
                return res.status(400).json({ success: false, message: "Position and Promotion Date are required." });
            }
            await (0, onboardingPool_1.withTenant)(tenantId, async (db) => {
                // 1. Get Employee
                const empRes = await db.query(`SELECT id, first_name, last_name, employee_code FROM employees WHERE id = $1 AND tenant_id = $2`, [employeeId, tenantId]);
                if (empRes.rowCount === 0)
                    throw new Error("Employee not found");
                const emp = empRes.rows[0];
                // 2. Get New Position Title
                const posRes = await db.query(`SELECT title FROM positions WHERE id = $1`, [positionId]);
                const newRoleName = posRes.rows[0]?.title || "Unknown Role";
                // 3. Update Current Role History (set end_date)
                await db.query(`UPDATE employee_role_history 
           SET end_date = $1 
           WHERE employee_id = $2 AND end_date IS NULL`, [promotionDate, employeeId]);
                // 4. Insert New Role History
                await db.query(`INSERT INTO employee_role_history (tenant_id, employee_id, role_name, start_date) 
           VALUES ($1, $2, $3, $4)`, [tenantId, employeeId, newRoleName, promotionDate]);
                // 5. Update Employment Details (Position & Sub Department)
                await db.query(`UPDATE employee_work_details 
           SET position_id = $1, updated_by_id = $2, updated_at = now() 
           WHERE employee_id = $3`, [positionId, userId, employeeId]);
                // Record Activity
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    module: transactionHistory_1.Module.ONBOARDING,
                    page: transactionHistory_1.Page.ONBOARDING_EMPLOYEES,
                    section: transactionHistory_1.Section.HR,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Promoted employee ${empLabel(emp)} to ${newRoleName}`,
                    entityType: transactionHistory_1.EntityType.EMPLOYEE,
                    entityId: employeeId,
                    entityLabel: empLabel(emp),
                });
            });
            res.status(200).json({ success: true, message: "Employee promoted successfully!" });
        }
        catch (err) {
            console.error("Promote Employee Error:", err);
            res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
        }
    }
}
exports.EmployeeOnboardingController = EmployeeOnboardingController;
//# sourceMappingURL=employeeOnboardingController.js.map