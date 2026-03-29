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
const database_1 = require("@/config/database");
const crypto_1 = __importDefault(require("crypto"));
const r2Client_1 = require("@/utils/r2Client");
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
async function createPersonalDetails(req, employeeId, tx = database_1.prisma) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        const { personal } = req.body;
        if (!personal) {
            throw new Error("Personal details are missing from the request body");
        }
        const setting = await tx.employeeSetting.findFirst({
            where: { tenantId: req.tenantId },
        });
        const prefix = setting?.employeePrefix || "EMP";
        const lastEmployee = await tx.employee.findFirst({
            where: { tenantId: req.tenantId },
            orderBy: { created_at: "desc" }, // or id if auto increment
        });
        let nextNumber = 1;
        if (lastEmployee?.employee_code) {
            const lastCode = lastEmployee.employee_code;
            const match = lastCode.match(/(\d+)$/);
            if (match) {
                nextNumber = parseInt(match[1], 10) + 1;
            }
        }
        const formattedNumber = String(nextNumber).padStart(4, "0");
        const employeeCode = `${prefix}-${formattedNumber}`;
        const employee = await tx.employee.create({
            data: {
                tenantId: req.tenantId,
                employee_code: employeeCode,
                first_name: personal.firstName || null,
                last_name: personal.lastName || null,
                gender: personal.gender || null,
                date_of_birth: new Date(personal.dob) || null,
                blood_group: personal.bloodGroup || null,
                mobile: personal.mobile || null,
                work_email: personal.workEmail || null,
                personal_email: personal.personalEmail || null,
                status: true,
                created_by: req.user.id,
            },
        });
        // ✅ Handle profile image upload to R2
        if (personal.profilePic) {
            let profilePicUrl;
            if (personal.profilePic.startsWith("http")) {
                profilePicUrl = personal.profilePic;
            }
            else {
                profilePicUrl = await (0, r2Client_1.uploadEmployeeAssetToR2)({
                    base64: personal.profilePic,
                    fileName: "profile.png", // A default name for profile pictures
                    tenantId: req.tenantId,
                    employeeId: employee.id,
                    folder: "profile-pictures",
                });
            }
            // Now update the employee with the URL
            await tx.employee.update({
                where: { id: employee.id },
                data: { profile_pic: profilePicUrl },
            });
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
        await tx.employeeAddress.createMany({
            data: [
                {
                    employeeId: employee.id,
                    tenantId: req.tenantId,
                    addressType: "CURRENT",
                    doorNo: currentAddr.c_flat || null,
                    area: currentAddr.c_area || null,
                    city: currentAddr.c_city || null,
                    state: currentAddr.c_state || null,
                    country: currentAddr.c_country || null,
                    pincode: currentAddr.c_pincode || null,
                    createdById: req.user.id,
                    updatedById: req.user.id,
                },
                {
                    employeeId: employee.id,
                    tenantId: req.tenantId,
                    addressType: "PERMANENT",
                    doorNo: permAddr.p_flat || null,
                    area: permAddr.p_area || null,
                    city: permAddr.p_city || null,
                    state: permAddr.p_state || null,
                    country: permAddr.p_country || null,
                    pincode: permAddr.p_pincode || null,
                    createdById: req.user.id,
                    updatedById: req.user.id,
                },
            ],
        });
        // ✅ Create emergency contact
        if (personal.relationship &&
            personal.relationName &&
            personal.relationMobile) {
            await tx.employeeEmergencyContact.create({
                data: {
                    employeeId: employee.id,
                    relationship: personal.relationship || null,
                    name: personal.relationName || null,
                    mobile: personal.relationMobile || null,
                    createdById: req.user.id,
                },
            });
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
            await tx.employeeIdentity.create({
                data: {
                    employeeId: employee.id,
                    aadhaarNumber: encryptedAadhaar || null,
                    panNumber: encryptedPan || null,
                    passportNumber: encryptedPassport || null,
                    createdById: req.user.id,
                },
            });
        }
        return employee;
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
        const employee = await database_1.prisma.employee.findFirst({
            where: {
                id: employeeId,
                tenantId: req.tenantId,
            },
            include: {
                addresses: true,
                emergencyContacts: true,
                employeeIdentity: true,
            },
        });
        if (!employee) {
            throw new Error("Employee not found");
        }
        // Transform data to match the input format
        const currentAddress = employee.addresses.find((addr) => addr.addressType === "CURRENT");
        const permanentAddress = employee.addresses.find((addr) => addr.addressType === "PERMANENT");
        const emergencyContact = employee.emergencyContacts[0];
        const identity = Array.isArray(employee.employeeIdentity)
            ? employee.employeeIdentity[0]
            : employee.employeeIdentity;
        const personalDetails = {
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
                        c_flat: currentAddress.doorNo,
                        c_area: currentAddress.area,
                        c_city: currentAddress.city,
                        c_state: currentAddress.state,
                        c_country: currentAddress.country,
                        c_pincode: currentAddress.pincode,
                    }
                    : {},
                permanent: permanentAddress
                    ? {
                        p_flat: permanentAddress.doorNo,
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
            aadhaar: identity?.aadhaarNumber ? decrypt(identity.aadhaarNumber) : null,
            pan: identity?.panNumber ? decrypt(identity.panNumber) : null,
            passport: identity?.passportNumber
                ? decrypt(identity.passportNumber)
                : null,
            employee_code: employee.employee_code,
            status: employee.status,
        };
        return personalDetails;
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
        const employees = await database_1.prisma.employee.findMany({
            where: {
                tenantId: req.tenantId,
                status: true,
            },
            include: {
                addresses: true,
                emergencyContacts: true,
                employeeIdentity: true,
            },
            orderBy: {
                created_at: "desc",
            },
        });
        return employees.map((employee) => {
            const currentAddress = employee.addresses.find((addr) => addr.addressType === "CURRENT");
            const permanentAddress = employee.addresses.find((addr) => addr.addressType === "PERMANENT");
            const emergencyContact = employee.emergencyContacts[0];
            const identity = Array.isArray(employee.employeeIdentity)
                ? employee.employeeIdentity[0]
                : employee.employeeIdentity;
            return {
                id: employee.id,
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
                            c_flat: currentAddress.doorNo,
                            c_area: currentAddress.area,
                            c_city: currentAddress.city,
                            c_state: currentAddress.state,
                            c_country: currentAddress.country,
                            c_pincode: currentAddress.pincode,
                        }
                        : {},
                    permanent: permanentAddress
                        ? {
                            p_flat: permanentAddress.doorNo,
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
                aadhaar: identity?.aadhaarNumber
                    ? decrypt(identity.aadhaarNumber)
                    : null,
                pan: identity?.panNumber ? decrypt(identity.panNumber) : null,
                passport: identity?.passportNumber
                    ? decrypt(identity.passportNumber)
                    : null,
                employee_code: employee.employee_code,
                status: employee.status,
                created_at: employee.created_at,
            };
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
        const employees = await database_1.prisma.employee.findMany({
            where: {
                tenantId: req.tenantId,
                status: true,
            },
            select: {
                id: true,
                first_name: true,
                last_name: true,
                date_of_birth: true,
            },
        });
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentDate = today.getDate();
        const upcomingBirthdays = employees
            .filter((emp) => {
            if (!emp.date_of_birth)
                return false;
            const dob = new Date(emp.date_of_birth);
            // Check if birthday is in the current month and is today or upcoming
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
async function updatePersonalDetails(req, employeeId, tx = database_1.prisma) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        // ✅ Validate employeeId to prevent Prisma error
        if (!employeeId || employeeId === "undefined" || employeeId === "null") {
            throw new Error("Invalid Employee ID provided for update (in createEmployeeDetailes)");
        }
        const { personal } = req.body;
        if (!personal) {
            throw new Error("Personal details are missing from the request body");
        }
        // Verify employee exists and belongs to tenant
        const existingEmployee = await tx.employee.findFirst({
            where: {
                id: employeeId,
                tenantId: req.tenantId,
            },
        });
        if (!existingEmployee) {
            throw new Error("Employee not found");
        }
        // ✅ Update employee basic info
        const updateData = {
            updated_by: req.user.id,
        };
        if (personal?.firstName)
            updateData.first_name = personal.firstName;
        if (personal?.lastName)
            updateData.last_name = personal.lastName;
        if (personal?.gender)
            updateData.gender = personal.gender;
        if (personal?.bloodGroup)
            updateData.blood_group = personal.bloodGroup;
        if (personal?.mobile)
            updateData.mobile = personal.mobile;
        if (personal?.workEmail)
            updateData.work_email = personal.workEmail;
        if (personal?.personalEmail)
            updateData.personal_email = personal.personalEmail;
        if (personal?.dob) {
            const parsedDate = new Date(personal.dob);
            if (!isNaN(parsedDate.getTime())) {
                updateData.date_of_birth = parsedDate;
            }
        }
        // ✅ Handle profile image upload
        if (personal.profilePic &&
            personal.profilePic !== existingEmployee.profile_pic) {
            let newProfilePicUrl = null;
            // If it's a new base64 string, upload it
            if (personal.profilePic.startsWith("data:")) {
                newProfilePicUrl = await (0, r2Client_1.uploadEmployeeAssetToR2)({
                    base64: personal.profilePic,
                    fileName: "profile.png",
                    tenantId: req.tenantId,
                    employeeId: employeeId,
                    folder: "profile-pictures",
                });
            }
            else if (personal.profilePic.startsWith("http")) {
                // If it's a new URL, use it
                newProfilePicUrl = personal.profilePic;
            }
            if (newProfilePicUrl) {
                updateData.profile_pic = newProfilePicUrl;
            }
        }
        const employee = await tx.employee.update({
            where: { id: employeeId },
            data: updateData,
        });
        // ✅ Update addresses
        let currentAddr = personal.address?.current;
        let permAddr = personal.address?.permanent;
        // Fallback for flat structure if nested address is missing
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
        await tx.employeeAddress.deleteMany({
            where: { employeeId: employeeId },
        });
        await tx.employeeAddress.createMany({
            data: [
                {
                    employeeId: employee.id,
                    tenantId: req.tenantId,
                    addressType: "CURRENT",
                    doorNo: currentAddr.c_flat,
                    area: currentAddr.c_area,
                    city: currentAddr.c_city,
                    state: currentAddr.c_state,
                    country: currentAddr.c_country,
                    pincode: currentAddr.c_pincode,
                    createdById: req.user.id,
                    updatedById: req.user.id,
                },
                {
                    employeeId: employee.id,
                    tenantId: req.tenantId,
                    addressType: "PERMANENT",
                    doorNo: permAddr.p_flat,
                    area: permAddr.p_area,
                    city: permAddr.p_city,
                    state: permAddr.p_state,
                    country: permAddr.p_country,
                    pincode: permAddr.p_pincode,
                    createdById: req.user.id,
                    updatedById: req.user.id,
                },
            ],
        });
        // ✅ Update emergency contact
        await tx.employeeEmergencyContact.deleteMany({
            where: { employeeId: employeeId },
        });
        if (personal.relationship &&
            personal.relationName &&
            personal.relationMobile) {
            await tx.employeeEmergencyContact.create({
                data: {
                    employeeId: employee.id,
                    relationship: personal.relationship,
                    name: personal.relationName,
                    mobile: personal.relationMobile,
                    createdById: req.user.id,
                },
            });
        }
        // ✅ Update identity
        const existingIdentity = await tx.employeeIdentity.findFirst({
            where: { employeeId: employeeId },
        });
        if (existingIdentity) {
            const identityUpdateData = {
                updatedById: req.user.id,
            };
            if (personal.aadhaar !== undefined)
                identityUpdateData.aadhaarNumber = personal.aadhaar ? encrypt(personal.aadhaar) : null;
            if (personal.pan !== undefined)
                identityUpdateData.panNumber = personal.pan ? encrypt(personal.pan) : null;
            if (personal.passport !== undefined)
                identityUpdateData.passportNumber = personal.passport ? encrypt(personal.passport) : null;
            // Only update if there are fields to update (besides updatedById)
            if (Object.keys(identityUpdateData).length > 1) {
                await tx.employeeIdentity.update({
                    where: { id: existingIdentity.id },
                    data: identityUpdateData,
                });
            }
        }
        else if (personal.aadhaar || personal.pan) {
            await tx.employeeIdentity.create({
                data: {
                    employeeId: employee.id,
                    aadhaarNumber: personal.aadhaar ? encrypt(personal.aadhaar) : null,
                    panNumber: personal.pan ? encrypt(personal.pan) : null,
                    passportNumber: personal.passport ? encrypt(personal.passport) : null,
                    createdById: req.user.id,
                },
            });
        }
        return employee;
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
        // Verify employee exists and belongs to tenant
        const existingEmployee = await database_1.prisma.employee.findFirst({
            where: {
                id: employeeId,
                tenantId: req.tenantId,
            },
        });
        if (!existingEmployee) {
            throw new Error("Employee not found");
        }
        // Soft delete by setting status to false
        const employee = await database_1.prisma.employee.update({
            where: { id: employeeId },
            data: {
                status: false,
                updated_by: req.user.id,
            },
        });
        return {
            success: true,
            message: "Employee deleted successfully",
            employee,
        };
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
        // Verify employee exists and belongs to tenant
        const existingEmployee = await database_1.prisma.employee.findFirst({
            where: {
                id: employeeId,
                tenantId: req.tenantId,
            },
        });
        if (!existingEmployee) {
            throw new Error("Employee not found");
        }
        // Delete related records first (due to foreign key constraints)
        await database_1.prisma.employeeAddress.deleteMany({
            where: { employeeId: employeeId },
        });
        await database_1.prisma.employeeEmergencyContact.deleteMany({
            where: { employeeId: employeeId },
        });
        await database_1.prisma.employeeIdentity.deleteMany({
            where: { employeeId: employeeId },
        });
        // Finally delete the employee
        await database_1.prisma.employee.delete({
            where: { id: employeeId },
        });
        return { success: true, message: "Employee permanently deleted" };
    }
    catch (error) {
        console.error("Error in hardDeletePersonalDetails:", error);
        throw new Error(`Failed to permanently delete employee: ${error.message}`);
    }
}
//# sourceMappingURL=createEmployeeDetailes.js.map