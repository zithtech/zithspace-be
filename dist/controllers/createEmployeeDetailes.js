"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.createPersonalDetails = createPersonalDetails;
exports.getPersonalDetails = getPersonalDetails;
exports.getAllEmployees = getAllEmployees;
exports.getUpcomingBirthdays = getUpcomingBirthdays;
exports.updatePersonalDetails = updatePersonalDetails;
exports.deletePersonalDetails = deletePersonalDetails;
exports.hardDeletePersonalDetails = hardDeletePersonalDetails;
const crypto_1 = __importDefault(require("crypto"));
const r2Client_1 = require("@/utils/r2Client");
const onboardingPool_1 = require("@/db/onboardingPool");
const algorithm = "aes-256-cbc";
const secretKey = process.env.SECRET_KEY; // 32 chars
function encrypt(text) {
    if (!secretKey) {
        console.warn("SECRET_KEY not found. Encryption skipped.");
        return text;
    }
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("base64") + ":" + encrypted.toString("base64");
}
function decrypt(text) {
    if (!secretKey) {
        console.warn("SECRET_KEY not found. Decryption skipped.");
        return text;
    }
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
async function createPersonalDetails(req, _employeeId, client) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        const { personal } = req.body;
        if (!personal) {
            throw new Error("Personal details are missing from the request body");
        }
        return await withClient(req, client, async (db) => {
            const userId = req.user.id;
            const tenantId = req.tenantId;
            // Resolve the employee-code prefix for this tenant.
            const settingRes = await db.query(`SELECT employee_prefix FROM employee_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
            const prefix = settingRes.rows[0]?.employee_prefix || "EMP";
            // Derive the next sequential employee code. We look only at codes that
            // are strictly `PREFIX-NNNNNN` (6-digit zero-padded), taking the highest
            // sequence number. This deliberately ignores any legacy/timestamp codes
            // (e.g. `EMP-1772186723978` produced by an older generator) so a stray
            // legacy row can't poison the sequence and the count restarts at 000001.
            const expectedLength = prefix.length + 7; // prefix + "-" + 6 digits
            const lastRes = await db.query(`SELECT MAX((substring(employee_code from '[0-9]+$'))::int) AS max_seq
           FROM employees
          WHERE tenant_id = $1
            AND employee_code LIKE $2
            AND employee_code ~ '-[0-9]{6}$'
            AND length(employee_code) = $3`, [tenantId, `${prefix}-%`, expectedLength]);
            let nextNumber = 1;
            const maxSeq = lastRes.rows[0]?.max_seq;
            if (maxSeq != null) {
                nextNumber = Number(maxSeq) + 1;
            }
            // Tenant employee codes are PREFIX-NNNNNN — a fixed 6-digit, zero-padded
            // sequence (e.g. EMP-000001). The 6-digit width is mandatory.
            const formattedNumber = String(nextNumber).padStart(6, "0");
            const employeeCode = `${prefix}-${formattedNumber}`;
            const insertEmployee = await db.query(`INSERT INTO employees
           (tenant_id, employee_code, first_name, last_name, gender,
            date_of_birth, blood_group, mobile, work_email, personal_email,
            status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
         RETURNING *`, [
                tenantId,
                employeeCode,
                personal.firstName || null,
                personal.lastName || null,
                personal.gender || null,
                personal.dob ? new Date(personal.dob) : null,
                personal.bloodGroup || null,
                personal.mobile || null,
                personal.workEmail || null,
                personal.personalEmail || null,
                userId,
            ]);
            const employee = insertEmployee.rows[0];
            // ✅ Handle profile image upload to R2
            if (personal.profilePic) {
                let profilePicUrl;
                if (personal.profilePic.startsWith("http")) {
                    profilePicUrl = personal.profilePic;
                }
                else {
                    profilePicUrl = await (0, r2Client_1.uploadEmployeeAssetToR2)({
                        base64: personal.profilePic,
                        fileName: "profile.png",
                        tenantId,
                        employeeId: employee.id,
                        folder: "profile-pictures",
                    });
                }
                const updated = await db.query(`UPDATE employees SET profile_pic = $1, updated_at = now()
            WHERE id = $2 AND tenant_id = $3
          RETURNING *`, [profilePicUrl, employee.id, tenantId]);
                if (updated.rows[0])
                    employee.profile_pic = updated.rows[0].profile_pic;
            }
            // ✅ Create addresses
            let currentAddr = personal.address?.current;
            let permAddr = personal.address?.permanent;
            // Fallback for flat structure if nested address is missing
            if (!currentAddr && !permAddr) {
                currentAddr = {
                    c_flat: personal.c_flat || null,
                    c_area: personal.c_area || null,
                    c_city: personal.c_city || null,
                    c_state: personal.c_state || null,
                    c_country: personal.c_country || null,
                    c_pincode: personal.c_pincode || null,
                };
                permAddr = {
                    p_flat: personal.p_flat || null,
                    p_area: personal.p_area || null,
                    p_city: personal.p_city || null,
                    p_state: personal.p_state || null,
                    p_country: personal.p_country || null,
                    p_pincode: personal.p_pincode || null,
                };
            }
            currentAddr = currentAddr || {};
            permAddr = permAddr || {};
            await db.query(`INSERT INTO employee_addresses
           (id, employee_id, tenant_id, address_type, door_no, area, city, state,
            country, pincode, created_by_id, updated_by_id, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, 'CURRENT', $3, $4, $5, $6, $7, $8, $9, $9, now()),
           (gen_random_uuid(), $1, $2, 'PERMANENT', $10, $11, $12, $13, $14, $15, $9, $9, now())`, [
                employee.id,
                tenantId,
                currentAddr.c_flat || null,
                currentAddr.c_area || null,
                currentAddr.c_city || null,
                currentAddr.c_state || null,
                currentAddr.c_country || null,
                currentAddr.c_pincode || null,
                userId,
                permAddr.p_flat || null,
                permAddr.p_area || null,
                permAddr.p_city || null,
                permAddr.p_state || null,
                permAddr.p_country || null,
                permAddr.p_pincode || null,
            ]);
            // ✅ Create emergency contact
            if (personal.relationship &&
                personal.relationName &&
                personal.relationMobile) {
                await db.query(`INSERT INTO employee_emergency_contacts
             (employee_id, relationship, name, mobile, created_by_id)
           VALUES ($1, $2, $3, $4, $5)`, [
                    employee.id,
                    personal.relationship || null,
                    personal.relationName || null,
                    personal.relationMobile || null,
                    userId,
                ]);
            }
            const encryptedPan = personal.pan ? encrypt(personal.pan) : null;
            const encryptedAadhaar = personal.aadhaar
                ? encrypt(personal.aadhaar)
                : null;
            const encryptedPassport = personal.passport
                ? encrypt(personal.passport)
                : null;
            // ✅ Create identity
            if (encryptedAadhaar || encryptedPan || encryptedPassport) {
                await db.query(`INSERT INTO employee_identities
             (employee_id, aadhaar_number, pan_number, passport_number, created_by_id)
           VALUES ($1, $2, $3, $4, $5)`, [
                    employee.id,
                    encryptedAadhaar || null,
                    encryptedPan || null,
                    encryptedPassport || null,
                    userId,
                ]);
            }
            return employee;
        });
    }
    catch (error) {
        console.error("Error in createPersonalDetails:", error);
        throw new Error(`Failed to create personal details: ${error.message}`);
    }
}
// ✅ GET Personal Details
async function getPersonalDetails(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            const employeeRes = await db.query(`SELECT * FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            const employee = employeeRes.rows[0];
            if (!employee) {
                throw new Error("Employee not found");
            }
            const [addressesRes, emergencyRes, identityRes] = await Promise.all([
                db.query(`SELECT * FROM employee_addresses WHERE employee_id = $1`, [employeeId]),
                db.query(`SELECT * FROM employee_emergency_contacts WHERE employee_id = $1 LIMIT 1`, [employeeId]),
                db.query(`SELECT * FROM employee_identities WHERE employee_id = $1 LIMIT 1`, [employeeId]),
            ]);
            const currentAddress = addressesRes.rows.find((addr) => addr.address_type === "CURRENT");
            const permanentAddress = addressesRes.rows.find((addr) => addr.address_type === "PERMANENT");
            const emergencyContact = emergencyRes.rows[0];
            const identity = identityRes.rows[0];
            return {
                firstName: employee.first_name,
                lastName: employee.last_name,
                gender: employee.gender,
                dob: employee.date_of_birth,
                profile_pic: employee.profile_pic,
                bloodGroup: employee.blood_group,
                mobile: employee.mobile,
                workEmail: employee.work_email,
                personalEmail: employee.personal_email,
                address: {
                    current: currentAddress
                        ? {
                            c_flat: currentAddress.door_no,
                            c_area: currentAddress.area,
                            c_city: currentAddress.city,
                            c_state: currentAddress.state,
                            c_country: currentAddress.country,
                            c_pincode: currentAddress.pincode,
                        }
                        : {},
                    permanent: permanentAddress
                        ? {
                            p_flat: permanentAddress.door_no,
                            p_area: permanentAddress.area,
                            p_city: permanentAddress.city,
                            p_state: permanentAddress.state,
                            p_country: permanentAddress.country,
                            p_pincode: permanentAddress.pincode,
                        }
                        : {},
                },
                relationship: emergencyContact?.relationship || null,
                relationName: emergencyContact?.name || null,
                relationMobile: emergencyContact?.mobile || null,
                aadhaar: identity?.aadhaar_number
                    ? decrypt(identity.aadhaar_number)
                    : null,
                pan: identity?.pan_number ? decrypt(identity.pan_number) : null,
                passport: identity?.passport_number
                    ? decrypt(identity.passport_number)
                    : null,
                employee_code: employee.employee_code,
                status: employee.status,
            };
        });
    }
    catch (error) {
        console.error("Error in getPersonalDetails:", error);
        throw new Error(`Failed to fetch personal details: ${error.message}`);
    }
}
// ✅ GET All Employees (List)
async function getAllEmployees(req) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            const employeesRes = await db.query(`SELECT * FROM employees
          WHERE tenant_id = $1 AND status = true
          ORDER BY created_at DESC`, [req.tenantId]);
            const employees = employeesRes.rows;
            if (employees.length === 0)
                return [];
            const employeeIds = employees.map((e) => e.id);
            const [addressesRes, emergencyRes, identityRes, workRes, projectsRes] = await Promise.all([
                db.query(`SELECT * FROM employee_addresses WHERE employee_id = ANY($1::uuid[])`, [employeeIds]),
                db.query(`SELECT * FROM employee_emergency_contacts WHERE employee_id = ANY($1::uuid[])`, [employeeIds]),
                db.query(`SELECT * FROM employee_identities WHERE employee_id = ANY($1::uuid[])`, [employeeIds]),
                db.query(`SELECT wd.employee_id, wd.position_id, wd.created_at,
                    p.title AS position_title,
                    p.department_id,
                    d.name AS department_name
               FROM employee_work_details wd
               LEFT JOIN positions p ON p.id = wd.position_id
               LEFT JOIN departments d ON d.id = p.department_id
              WHERE wd.employee_id = ANY($1::uuid[])
              ORDER BY wd.created_at ASC`, [employeeIds]),
                db.query(`SELECT employee_id, reporting_manager FROM employee_project_mappings WHERE employee_id = ANY($1::uuid[]) ORDER BY created_at ASC`, [employeeIds]),
            ]);
            // Index related rows by employee_id for O(1) assembly.
            const addrByEmp = new Map();
            for (const a of addressesRes.rows) {
                const list = addrByEmp.get(a.employee_id) || [];
                list.push(a);
                addrByEmp.set(a.employee_id, list);
            }
            const emergencyByEmp = new Map();
            for (const c of emergencyRes.rows) {
                if (!emergencyByEmp.has(c.employee_id))
                    emergencyByEmp.set(c.employee_id, c);
            }
            const identityByEmp = new Map();
            for (const i of identityRes.rows) {
                if (!identityByEmp.has(i.employee_id))
                    identityByEmp.set(i.employee_id, i);
            }
            const workByEmp = new Map();
            for (const w of workRes.rows) {
                // First by created_at ASC mirrors the previous `workDetail[0]`.
                if (!workByEmp.has(w.employee_id))
                    workByEmp.set(w.employee_id, w);
            }
            const managerByEmp = new Map();
            for (const p of projectsRes.rows) {
                if (!managerByEmp.has(p.employee_id))
                    managerByEmp.set(p.employee_id, p.reporting_manager);
            }
            return employees.map((employee) => {
                const addresses = addrByEmp.get(employee.id) || [];
                const currentAddress = addresses.find((addr) => addr.address_type === "CURRENT");
                const permanentAddress = addresses.find((addr) => addr.address_type === "PERMANENT");
                const emergencyContact = emergencyByEmp.get(employee.id);
                const identity = identityByEmp.get(employee.id);
                const latestWorkDetail = workByEmp.get(employee.id);
                return {
                    id: employee.id,
                    firstName: employee.first_name,
                    lastName: employee.last_name,
                    name: `${employee.first_name} ${employee.last_name}`,
                    gender: employee.gender,
                    dob: employee.date_of_birth,
                    profile_pic: employee.profile_pic,
                    bloodGroup: employee.blood_group,
                    mobile: employee.mobile,
                    workEmail: employee.work_email,
                    personalEmail: employee.personal_email,
                    departmentId: latestWorkDetail?.department_id || null,
                    departmentName: latestWorkDetail?.department_name || null,
                    positionTitle: latestWorkDetail?.position_title || null,
                    positionId: latestWorkDetail?.position_id || null,
                    reportsToId: managerByEmp.get(employee.id) || null,
                    address: {
                        current: currentAddress
                            ? {
                                c_flat: currentAddress.door_no,
                                c_area: currentAddress.area,
                                c_city: currentAddress.city,
                                c_state: currentAddress.state,
                                c_country: currentAddress.country,
                                c_pincode: currentAddress.pincode,
                            }
                            : {},
                        permanent: permanentAddress
                            ? {
                                p_flat: permanentAddress.door_no,
                                p_area: permanentAddress.area,
                                p_city: permanentAddress.city,
                                p_state: permanentAddress.state,
                                p_country: permanentAddress.country,
                                p_pincode: permanentAddress.pincode,
                            }
                            : {},
                    },
                    relationship: emergencyContact?.relationship || null,
                    relationName: emergencyContact?.name || null,
                    relationMobile: emergencyContact?.mobile || null,
                    aadhaar: identity?.aadhaar_number
                        ? decrypt(identity.aadhaar_number)
                        : null,
                    pan: identity?.pan_number ? decrypt(identity.pan_number) : null,
                    passport: identity?.passport_number
                        ? decrypt(identity.passport_number)
                        : null,
                    employeeCode: employee.employee_code,
                    employee_code: employee.employee_code,
                    status: employee.status,
                    created_at: employee.created_at,
                };
            });
        });
    }
    catch (error) {
        console.error("Error in getAllEmployees:", error);
        throw new Error(`Failed to fetch employees: ${error.message}`);
    }
}
// ✅ GET Upcoming Birthdays (Current Month)
async function getUpcomingBirthdays(req) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        const employees = await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            const res = await db.query(`SELECT id, first_name, last_name, date_of_birth
           FROM employees
          WHERE tenant_id = $1 AND status = true`, [req.tenantId]);
            return res.rows;
        });
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentDate = today.getDate();
        const upcomingBirthdays = employees
            .filter((emp) => {
            if (!emp.date_of_birth)
                return false;
            const dob = new Date(emp.date_of_birth);
            return dob.getMonth() === currentMonth && dob.getDate() >= currentDate;
        })
            .map((emp) => ({
            id: emp.id,
            firstName: emp.first_name,
            lastName: emp.last_name,
            dateOfBirth: emp.date_of_birth,
        }))
            .sort((a, b) => {
            const dateA = new Date(a.dateOfBirth).getDate();
            const dateB = new Date(b.dateOfBirth).getDate();
            return dateA - dateB;
        });
        return upcomingBirthdays;
    }
    catch (error) {
        console.error("Error in getUpcomingBirthdays:", error);
        throw new Error(`Failed to fetch upcoming birthdays: ${error.message}`);
    }
}
// ✅ UPDATE Personal Details
async function updatePersonalDetails(req, employeeId, client) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        // ✅ Validate employeeId to prevent invalid query
        if (!employeeId || employeeId === "undefined" || employeeId === "null") {
            throw new Error("Invalid Employee ID provided for update (in createEmployeeDetailes)");
        }
        const { personal } = req.body;
        if (!personal) {
            throw new Error("Personal details are missing from the request body");
        }
        return await withClient(req, client, async (db) => {
            const userId = req.user.id;
            const tenantId = req.tenantId;
            // Verify employee exists and belongs to tenant
            const existingRes = await db.query(`SELECT * FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, tenantId]);
            const existingEmployee = existingRes.rows[0];
            if (!existingEmployee) {
                throw new Error("Employee not found");
            }
            // ✅ Build dynamic update for employee basic info
            const sets = [];
            const params = [];
            const push = (col, val) => {
                params.push(val);
                sets.push(`${col} = $${params.length}`);
            };
            params.push(userId);
            sets.push(`updated_by = $${params.length}`);
            if (personal?.firstName)
                push("first_name", personal.firstName);
            if (personal?.lastName)
                push("last_name", personal.lastName);
            if (personal?.gender)
                push("gender", personal.gender);
            if (personal?.bloodGroup)
                push("blood_group", personal.bloodGroup);
            if (personal?.mobile)
                push("mobile", personal.mobile);
            if (personal?.workEmail)
                push("work_email", personal.workEmail);
            if (personal?.personalEmail)
                push("personal_email", personal.personalEmail);
            if (personal?.dob) {
                const parsedDate = new Date(personal.dob);
                if (!isNaN(parsedDate.getTime())) {
                    push("date_of_birth", parsedDate);
                }
            }
            // ✅ Handle profile image upload
            if (personal.profilePic &&
                personal.profilePic !== existingEmployee.profile_pic) {
                let newProfilePicUrl = null;
                if (personal.profilePic.startsWith("data:")) {
                    newProfilePicUrl = await (0, r2Client_1.uploadEmployeeAssetToR2)({
                        base64: personal.profilePic,
                        fileName: "profile.png",
                        tenantId,
                        employeeId,
                        folder: "profile-pictures",
                    });
                }
                else if (personal.profilePic.startsWith("http")) {
                    newProfilePicUrl = personal.profilePic;
                }
                if (newProfilePicUrl) {
                    push("profile_pic", newProfilePicUrl);
                }
            }
            params.push(employeeId);
            params.push(tenantId);
            const updateRes = await db.query(`UPDATE employees
            SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
        RETURNING *`, params);
            const employee = updateRes.rows[0] || existingEmployee;
            // ✅ Update addresses
            let currentAddr = personal.address?.current;
            let permAddr = personal.address?.permanent;
            if (!currentAddr && !permAddr) {
                currentAddr = {
                    c_flat: personal.c_flat,
                    c_area: personal.c_area,
                    c_city: personal.c_city,
                    c_state: personal.c_state,
                    c_country: personal.c_country,
                    c_pincode: personal.c_pincode,
                };
                permAddr = {
                    p_flat: personal.p_flat,
                    p_area: personal.p_area,
                    p_city: personal.p_city,
                    p_state: personal.p_state,
                    p_country: personal.p_country,
                    p_pincode: personal.p_pincode,
                };
            }
            currentAddr = currentAddr || {};
            permAddr = permAddr || {};
            // Delete existing addresses and create new ones
            await db.query(`DELETE FROM employee_addresses WHERE employee_id = $1`, [
                employeeId,
            ]);
            await db.query(`INSERT INTO employee_addresses
           (id, employee_id, tenant_id, address_type, door_no, area, city, state,
            country, pincode, created_by_id, updated_by_id, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, 'CURRENT', $3, $4, $5, $6, $7, $8, $9, $9, now()),
           (gen_random_uuid(), $1, $2, 'PERMANENT', $10, $11, $12, $13, $14, $15, $9, $9, now())`, [
                employeeId,
                tenantId,
                currentAddr.c_flat ?? null,
                currentAddr.c_area ?? null,
                currentAddr.c_city ?? null,
                currentAddr.c_state ?? null,
                currentAddr.c_country ?? null,
                currentAddr.c_pincode ?? null,
                userId,
                permAddr.p_flat ?? null,
                permAddr.p_area ?? null,
                permAddr.p_city ?? null,
                permAddr.p_state ?? null,
                permAddr.p_country ?? null,
                permAddr.p_pincode ?? null,
            ]);
            // ✅ Update emergency contact
            await db.query(`DELETE FROM employee_emergency_contacts WHERE employee_id = $1`, [employeeId]);
            if (personal.relationship &&
                personal.relationName &&
                personal.relationMobile) {
                await db.query(`INSERT INTO employee_emergency_contacts
             (employee_id, relationship, name, mobile, created_by_id)
           VALUES ($1, $2, $3, $4, $5)`, [
                    employeeId,
                    personal.relationship,
                    personal.relationName,
                    personal.relationMobile,
                    userId,
                ]);
            }
            // ✅ Update identity
            const existingIdentityRes = await db.query(`SELECT * FROM employee_identities WHERE employee_id = $1 LIMIT 1`, [employeeId]);
            const existingIdentity = existingIdentityRes.rows[0];
            if (existingIdentity) {
                const idSets = [];
                const idParams = [];
                const idPush = (col, val) => {
                    idParams.push(val);
                    idSets.push(`${col} = $${idParams.length}`);
                };
                idParams.push(userId);
                idSets.push(`updated_by_id = $${idParams.length}`);
                if (personal.aadhaar !== undefined)
                    idPush("aadhaar_number", personal.aadhaar ? encrypt(personal.aadhaar) : null);
                if (personal.pan !== undefined)
                    idPush("pan_number", personal.pan ? encrypt(personal.pan) : null);
                if (personal.passport !== undefined)
                    idPush("passport_number", personal.passport ? encrypt(personal.passport) : null);
                // Only update if there are fields to update (besides updated_by_id)
                if (idSets.length > 1) {
                    idParams.push(existingIdentity.id);
                    await db.query(`UPDATE employee_identities
                SET ${idSets.join(", ")}, updated_at = now()
              WHERE id = $${idParams.length}`, idParams);
                }
            }
            else if (personal.aadhaar || personal.pan) {
                await db.query(`INSERT INTO employee_identities
             (employee_id, aadhaar_number, pan_number, passport_number, created_by_id)
           VALUES ($1, $2, $3, $4, $5)`, [
                    employeeId,
                    personal.aadhaar ? encrypt(personal.aadhaar) : null,
                    personal.pan ? encrypt(personal.pan) : null,
                    personal.passport ? encrypt(personal.passport) : null,
                    userId,
                ]);
            }
            return employee;
        });
    }
    catch (error) {
        console.error("Error in updatePersonalDetails:", error);
        throw new Error(`Failed to update personal details: ${error.message}`);
    }
}
// ✅ DELETE Personal Details (Soft delete by setting status to false)
async function deletePersonalDetails(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            const existingRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!existingRes.rows[0]) {
                throw new Error("Employee not found");
            }
            const updated = await db.query(`UPDATE employees
            SET status = false, updated_by = $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3
        RETURNING *`, [req.user.id, employeeId, req.tenantId]);
            return {
                success: true,
                message: "Employee deleted successfully",
                employee: updated.rows[0],
            };
        });
    }
    catch (error) {
        console.error("Error in deletePersonalDetails:", error);
        throw new Error(`Failed to delete employee: ${error.message}`);
    }
}
// ✅ HARD DELETE Personal Details (Permanently remove from database)
async function hardDeletePersonalDetails(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            const existingRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!existingRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // Delete related records first (due to foreign key constraints)
            await db.query(`DELETE FROM employee_addresses WHERE employee_id = $1`, [employeeId]);
            await db.query(`DELETE FROM employee_emergency_contacts WHERE employee_id = $1`, [employeeId]);
            await db.query(`DELETE FROM employee_identities WHERE employee_id = $1`, [employeeId]);
            // Finally delete the employee
            await db.query(`DELETE FROM employees WHERE id = $1 AND tenant_id = $2`, [employeeId, req.tenantId]);
            return { success: true, message: "Employee permanently deleted" };
        });
    }
    catch (error) {
        console.error("Error in hardDeletePersonalDetails:", error);
        throw new Error(`Failed to permanently delete employee: ${error.message}`);
    }
}
//# sourceMappingURL=createEmployeeDetailes.js.map