"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.createBankPayrollDetails = createBankPayrollDetails;
exports.getBankPayrollDetails = getBankPayrollDetails;
exports.getAllBankPayrollDetails = getAllBankPayrollDetails;
exports.updateBankPayrollDetails = updateBankPayrollDetails;
exports.deleteBankPayrollDetails = deleteBankPayrollDetails;
exports.deleteBankDetails = deleteBankDetails;
exports.deletePayrollDetails = deletePayrollDetails;
const crypto_1 = __importDefault(require("crypto"));
const onboardingPool_1 = require("@/db/onboardingPool");
const algorithm = "aes-256-cbc";
const secretKey = process.env.SECRET_KEY; // 32 chars
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("base64") + ":" + encrypted.toString("base64");
}
function decrypt(text) {
    try {
        const parts = text.split(":");
        if (parts.length !== 2) {
            return text;
        }
        const iv = Buffer.from(parts.shift(), "base64");
        const encryptedText = Buffer.from(parts.join(":"), "base64");
        const decipher = crypto_1.default.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
    catch (error) {
        console.error("Decryption failed for text, returning original. Error:", error);
        return text;
    }
}
/**
 * Run `fn` against the supplied tenant-scoped client when the orchestrator is
 * driving a shared transaction, otherwise open a standalone tenant transaction.
 * Mirrors the old `tx: any = prisma` default — a no-client call used to run on
 * the default (non-transactional) Prisma client.
 */
async function withClient(req, client, fn) {
    if (client)
        return fn(client);
    return (0, onboardingPool_1.withTenant)(req.tenantId, fn);
}
// ✅ CREATE Bank & Payroll Details
async function createBankPayrollDetails(req, employeeId, client) {
    try {
        const { bank } = req.body;
        // If no bank details are provided, do nothing.
        if (!bank || Object.keys(bank).length === 0) {
            return;
        }
        const encrtyptedAccountNumber = encrypt(bank.accountNumber);
        const encrtyptedIfscCode = encrypt(bank.ifscCode);
        const encrtyptedUanNumber = encrypt(bank.uanNumber);
        const encrtyptedPfNumber = encrypt(bank.pfNumber);
        const encrtyptedEsiNumber = encrypt(bank.esiNumber);
        return await withClient(req, client, async (db) => {
            await db.query(`INSERT INTO employee_bank_details
           (employee_id, bank_name, branch_name, account_holder_name,
            account_number, account_type, ifsc_code, created_by_id, updated_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`, [
                employeeId,
                bank.bankName ?? null,
                bank.branchName ?? null,
                bank.accountHolderName ?? null,
                encrtyptedAccountNumber,
                bank.accountType ?? null,
                encrtyptedIfscCode,
                employeeId,
            ]);
            await db.query(`INSERT INTO employee_payroll_details
           (employee_id, uan_number, pf_number, esi_number, tax_regime,
            payment_type, created_by_id, updated_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, [
                employeeId,
                encrtyptedUanNumber,
                encrtyptedPfNumber,
                encrtyptedEsiNumber,
                bank.taxRegime ?? null,
                bank.paymentType ?? null,
                employeeId,
            ]);
            return {
                success: true,
                message: "Bank and payroll details created successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in createBankPayrollDetails:", error);
        throw error; // Re-throw to ensure the transaction rolls back
    }
}
// ✅ GET Bank & Payroll Details
async function getBankPayrollDetails(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            const [bankRes, payrollRes] = await Promise.all([
                db.query(`SELECT * FROM employee_bank_details WHERE employee_id = $1 LIMIT 1`, [employeeId]),
                db.query(`SELECT * FROM employee_payroll_details WHERE employee_id = $1 LIMIT 1`, [employeeId]),
            ]);
            const bankDetails = bankRes.rows[0];
            const payrollDetails = payrollRes.rows[0];
            return {
                bankName: bankDetails?.bank_name || null,
                branchName: bankDetails?.branch_name || null,
                accountHolderName: bankDetails?.account_holder_name || null,
                accountNumber: bankDetails?.account_number
                    ? decrypt(bankDetails.account_number)
                    : null,
                accountType: bankDetails?.account_type || null,
                ifscCode: bankDetails?.ifsc_code
                    ? decrypt(bankDetails.ifsc_code)
                    : null,
                uanNumber: payrollDetails?.uan_number
                    ? decrypt(payrollDetails.uan_number)
                    : null,
                pfNumber: payrollDetails?.pf_number
                    ? decrypt(payrollDetails.pf_number)
                    : null,
                esiNumber: payrollDetails?.esi_number
                    ? decrypt(payrollDetails.esi_number)
                    : null,
                taxRegime: payrollDetails?.tax_regime || null,
                paymentType: payrollDetails?.payment_type || null,
            };
        });
    }
    catch (error) {
        console.error("Error in getBankPayrollDetails:", error);
        throw error;
    }
}
// ✅ GET All Employees Bank & Payroll Details
async function getAllBankPayrollDetails(req) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            const employeesRes = await db.query(`SELECT id, employee_code, first_name, last_name
           FROM employees
          WHERE tenant_id = $1 AND status = true
          ORDER BY created_at DESC`, [req.tenantId]);
            const employees = employeesRes.rows;
            if (employees.length === 0)
                return [];
            const employeeIds = employees.map((e) => e.id);
            const [bankRes, payrollRes] = await Promise.all([
                db.query(`SELECT * FROM employee_bank_details WHERE employee_id = ANY($1::uuid[])`, [employeeIds]),
                db.query(`SELECT * FROM employee_payroll_details WHERE employee_id = ANY($1::uuid[])`, [employeeIds]),
            ]);
            const bankByEmp = new Map();
            for (const b of bankRes.rows) {
                if (!bankByEmp.has(b.employee_id))
                    bankByEmp.set(b.employee_id, b);
            }
            const payrollByEmp = new Map();
            for (const p of payrollRes.rows) {
                if (!payrollByEmp.has(p.employee_id))
                    payrollByEmp.set(p.employee_id, p);
            }
            return employees.map((employee) => {
                const bankDetail = bankByEmp.get(employee.id);
                const payrollDetail = payrollByEmp.get(employee.id);
                return {
                    id: employee.id,
                    employeeCode: employee.employee_code,
                    firstName: employee.first_name,
                    lastName: employee.last_name,
                    bankName: bankDetail?.bank_name || null,
                    branchName: bankDetail?.branch_name || null,
                    accountHolderName: bankDetail?.account_holder_name || null,
                    accountNumber: bankDetail?.account_number
                        ? decrypt(bankDetail.account_number)
                        : null,
                    accountType: bankDetail?.account_type || null,
                    ifscCode: bankDetail?.ifsc_code
                        ? decrypt(bankDetail.ifsc_code)
                        : null,
                    uanNumber: payrollDetail?.uan_number
                        ? decrypt(payrollDetail.uan_number)
                        : null,
                    pfNumber: payrollDetail?.pf_number
                        ? decrypt(payrollDetail.pf_number)
                        : null,
                    esiNumber: payrollDetail?.esi_number
                        ? decrypt(payrollDetail.esi_number)
                        : null,
                    taxRegime: payrollDetail?.tax_regime || null,
                    paymentType: payrollDetail?.payment_type || null,
                };
            });
        });
    }
    catch (error) {
        console.error("Error in getAllBankPayrollDetails:", error);
        throw error;
    }
}
// ✅ UPDATE Bank & Payroll Details
async function updateBankPayrollDetails(req, employeeId, client) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        const { bank } = req.body;
        if (!bank || Object.keys(bank).length === 0) {
            throw new Error("Bank and payroll details are missing from request body");
        }
        const encrtyptedAccountNumber = bank.accountNumber
            ? encrypt(bank.accountNumber)
            : bank.accountNumber;
        const encrtyptedIfscCode = bank.ifscCode
            ? encrypt(bank.ifscCode)
            : bank.ifscCode;
        const encrtyptedUanNumber = bank.uanNumber
            ? encrypt(bank.uanNumber)
            : bank.uanNumber;
        const encrtyptedPfNumber = bank.pfNumber
            ? encrypt(bank.pfNumber)
            : bank.pfNumber;
        const encrtyptedEsiNumber = bank.esiNumber
            ? encrypt(bank.esiNumber)
            : bank.esiNumber;
        return await withClient(req, client, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // ✅ Update or Create Bank Details
            const existingBankRes = await db.query(`SELECT id FROM employee_bank_details WHERE employee_id = $1 LIMIT 1`, [employeeId]);
            const existingBankDetails = existingBankRes.rows[0];
            if (existingBankDetails) {
                await db.query(`UPDATE employee_bank_details
              SET employee_id = $1,
                  bank_name = $2,
                  branch_name = $3,
                  account_holder_name = $4,
                  account_number = $5,
                  account_type = $6,
                  ifsc_code = $7,
                  updated_by_id = $8,
                  updated_at = now()
            WHERE id = $9`, [
                    employeeId,
                    bank.bankName ?? null,
                    bank.branchName ?? null,
                    bank.accountHolderName ?? null,
                    encrtyptedAccountNumber ?? null,
                    bank.accountType ?? null,
                    encrtyptedIfscCode ?? null,
                    employeeId,
                    existingBankDetails.id,
                ]);
            }
            else {
                await db.query(`INSERT INTO employee_bank_details
             (employee_id, bank_name, branch_name, account_holder_name,
              account_number, account_type, ifsc_code, created_by_id, updated_by_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`, [
                    employeeId,
                    bank.bankName ?? null,
                    bank.branchName ?? null,
                    bank.accountHolderName ?? null,
                    encrtyptedAccountNumber ?? null,
                    bank.accountType ?? null,
                    encrtyptedIfscCode ?? null,
                    employeeId,
                ]);
            }
            // ✅ Update or Create Payroll Details
            const existingPayrollRes = await db.query(`SELECT id FROM employee_payroll_details WHERE employee_id = $1 LIMIT 1`, [employeeId]);
            const existingPayrollDetails = existingPayrollRes.rows[0];
            if (existingPayrollDetails) {
                await db.query(`UPDATE employee_payroll_details
              SET uan_number = $1,
                  pf_number = $2,
                  esi_number = $3,
                  tax_regime = $4,
                  payment_type = $5,
                  updated_by_id = $6,
                  updated_at = now()
            WHERE id = $7`, [
                    encrtyptedUanNumber ?? null,
                    encrtyptedPfNumber ?? null,
                    encrtyptedEsiNumber ?? null,
                    bank.taxRegime ?? null,
                    bank.paymentType ?? null,
                    employeeId,
                    existingPayrollDetails.id,
                ]);
            }
            else {
                await db.query(`INSERT INTO employee_payroll_details
             (employee_id, uan_number, pf_number, esi_number, tax_regime,
              payment_type, created_by_id, updated_by_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, [
                    employeeId,
                    encrtyptedUanNumber ?? null,
                    encrtyptedPfNumber ?? null,
                    encrtyptedEsiNumber ?? null,
                    bank.taxRegime ?? null,
                    bank.paymentType ?? null,
                    employeeId,
                ]);
            }
            return {
                success: true,
                message: "Bank and payroll details updated successfully",
                data: employeeId,
            };
        });
    }
    catch (error) {
        console.error("Error in updateBankPayrollDetails:", error);
        throw error;
    }
}
// ✅ DELETE Bank & Payroll Details
async function deleteBankPayrollDetails(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // Delete bank details
            await db.query(`DELETE FROM employee_bank_details WHERE employee_id = $1`, [employeeId]);
            // Delete payroll details
            await db.query(`DELETE FROM employee_payroll_details WHERE employee_id = $1`, [employeeId]);
            return {
                success: true,
                message: "Bank and payroll details deleted successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in deleteBankPayrollDetails:", error);
        throw error;
    }
}
// ✅ DELETE Only Bank Details
async function deleteBankDetails(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            await db.query(`DELETE FROM employee_bank_details WHERE employee_id = $1`, [employeeId]);
            return {
                success: true,
                message: "Bank details deleted successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in deleteBankDetails:", error);
        throw error;
    }
}
// ✅ DELETE Only Payroll Details
async function deletePayrollDetails(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            await db.query(`DELETE FROM employee_payroll_details WHERE employee_id = $1`, [employeeId]);
            return {
                success: true,
                message: "Payroll details deleted successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in deletePayrollDetails:", error);
        throw error;
    }
}
//# sourceMappingURL=bankAndPayrolllController.js.map