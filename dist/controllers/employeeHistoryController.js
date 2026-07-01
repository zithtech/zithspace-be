"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmployeeHistory = createEmployeeHistory;
exports.getEmployeeHistory = getEmployeeHistory;
exports.getSingleExperience = getSingleExperience;
exports.updateEmployeeHistory = updateEmployeeHistory;
exports.deleteEmployeeExperience = deleteEmployeeExperience;
exports.deleteAllEmployeeHistory = deleteAllEmployeeHistory;
exports.deleteEmployeeDocument = deleteEmployeeDocument;
exports.deleteEmployeeContact = deleteEmployeeContact;
const r2Client_1 = require("@/utils/r2Client");
const onboardingPool_1 = require("@/db/onboardingPool");
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
// ✅ CREATE Employee History
async function createEmployeeHistory(req, employeeId, client) {
    try {
        const { history } = req.body;
        // Ensure history is an array before iterating
        if (!Array.isArray(history)) {
            return; // Or throw an error if history is mandatory but malformed
        }
        return await withClient(req, client, async (db) => {
            for (const h of history) {
                const expRes = await db.query(`INSERT INTO employee_experience
             (employee_id, company_name, designation, employment_type, industry,
              location, company_address, joining_date, last_working_date,
              created_by_id, updated_by_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`, [
                    employeeId,
                    h.companyName || null,
                    h.designation || null,
                    h.employmentType || null,
                    h.industry || null,
                    h.location || null,
                    h.address || null,
                    h.doj ? new Date(h.doj) : null,
                    h.lwd ? new Date(h.lwd) : null,
                    employeeId || null,
                    employeeId || null,
                ]);
                const experienceId = expRes.rows[0]?.id ?? null;
                // Upload a base64 file (or accept an existing url), then record the doc
                // against THIS experience row. `fileData` = { base64?, url?, fileName? }.
                const recordDoc = async (docType, fileData) => {
                    if (!fileData)
                        return;
                    let url = null;
                    if (fileData.base64) {
                        url = await (0, r2Client_1.uploadEmployeeDocumentToR2)(fileData.base64, fileData.fileName || `${docType}`, req.tenantId, employeeId, docType);
                    }
                    else if (fileData.url) {
                        url = fileData.url;
                    }
                    if (!url)
                        return;
                    await db.query(`INSERT INTO employee_documents
               (employee_id, experience_id, document_type, document_url, created_by_id, updated_by_id)
             VALUES ($1, $2, $3, $4, $5, $5)`, [employeeId, experienceId, docType, url, employeeId]);
                };
                // Legacy fixed single-doc fields
                for (const docType of ["experienceLetter", "offerLetter", "serviceLetter", "relievingLetter"]) {
                    await recordDoc(docType, h[docType]);
                }
                // Legacy fixed array-doc fields (Form 16, Payslips)
                for (const docType of ["form16", "payslips"]) {
                    const files = h[docType];
                    if (Array.isArray(files)) {
                        for (const f of files)
                            await recordDoc(docType, f);
                    }
                }
                // Dynamic, tenant-configured / custom documents from the public form:
                //   documents: [{ documentType, files: [{ base64|url, fileName }] }]
                if (Array.isArray(h.documents)) {
                    for (const doc of h.documents) {
                        const docType = String(doc?.documentType || doc?.type || doc?.name || "Document");
                        const files = Array.isArray(doc?.files) ? doc.files : doc?.file ? [doc.file] : [];
                        for (const f of files)
                            await recordDoc(docType, f);
                    }
                }
                if (Array.isArray(h.contacts)) {
                    for (const c of h.contacts) {
                        await db.query(`INSERT INTO employee_contacts
                 (employee_id, contact_person_type, name, mobile, email,
                  created_by_id, updated_by_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                            employeeId,
                            c.contactRole || null,
                            c.contactName || null,
                            c.contactNumber,
                            c.contactEmail || null, // SAFE FIX
                            employeeId || null,
                            employeeId || null,
                        ]);
                    }
                }
            }
            return {
                success: true,
                message: "Employee history created successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in createEmployeeHistory:", error);
        throw error; // Re-throw to ensure transaction rollback
    }
}
// ✅ GET Employee History
async function getEmployeeHistory(req, employeeId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            const experiencesRes = await db.query(`SELECT * FROM employee_experience
          WHERE employee_id = $1
          ORDER BY joining_date DESC`, [employeeId]);
            const experiences = experiencesRes.rows;
            const history = await Promise.all(experiences.map(async (exp) => {
                var _a;
                // Fetch documents linked to THIS experience. Legacy rows with a NULL
                // experience_id (created before per-history linking) are still shown.
                const documentsRes = await db.query(`SELECT * FROM employee_documents
              WHERE employee_id = $1 AND (experience_id = $2 OR experience_id IS NULL)`, [employeeId, exp.id]);
                const documents = documentsRes.rows;
                // Fetch contacts related to this employee
                const contactsRes = await db.query(`SELECT * FROM employee_contacts WHERE employee_id = $1`, [employeeId]);
                const contacts = contactsRes.rows;
                // Group single documents
                const experienceLetter = documents.find((d) => d.document_type === "experienceLetter");
                const offerLetter = documents.find((d) => d.document_type === "offerLetter");
                const serviceLetter = documents.find((d) => d.document_type === "serviceLetter");
                const relievingLetter = documents.find((d) => d.document_type === "relievingLetter");
                // Generate presigned URLs for single documents
                const signUrl = async (doc) => doc ? {
                    url: await (0, r2Client_1.generatePresignedUrl)(doc.document_url, 86400),
                    downloadUrl: await (0, r2Client_1.generatePresignedUrl)(doc.document_url, 86400, true),
                    id: doc.id
                } : null;
                const signedExperienceLetter = await signUrl(experienceLetter);
                const signedOfferLetter = await signUrl(offerLetter);
                const signedServiceLetter = await signUrl(serviceLetter);
                const signedRelievingLetter = await signUrl(relievingLetter);
                // Group array documents with presigned URLs
                const form16 = await Promise.all(documents
                    .filter((d) => d.document_type === "form16")
                    .map(async (d) => ({
                    url: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400),
                    downloadUrl: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400, true),
                    id: d.id
                })));
                const payslips = await Promise.all(documents
                    .filter((d) => d.document_type === "payslips")
                    .map(async (d) => ({
                    url: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400),
                    downloadUrl: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400, true),
                    id: d.id
                })));
                // Generic, type-grouped list for non-legacy documents
                const grouped = {};
                const legacyTypes = ["experienceLetter", "offerLetter", "serviceLetter", "relievingLetter", "form16", "payslips"];
                for (const d of documents) {
                    if (legacyTypes.includes(d.document_type))
                        continue;
                    const signed = await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400);
                    const downloadSigned = await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400, true);
                    (grouped[_a = d.document_type] || (grouped[_a] = [])).push({ url: signed, downloadUrl: downloadSigned, id: d.id });
                }
                const documentsList = Object.entries(grouped).map(([documentType, files]) => ({
                    documentType,
                    files,
                }));
                return {
                    id: exp.id,
                    companyName: exp.company_name,
                    designation: exp.designation,
                    employmentType: exp.employment_type,
                    industry: exp.industry,
                    location: exp.location,
                    address: exp.company_address,
                    doj: exp.joining_date,
                    lwd: exp.last_working_date,
                    experienceLetter: signedExperienceLetter,
                    offerLetter: signedOfferLetter,
                    serviceLetter: signedServiceLetter,
                    relievingLetter: signedRelievingLetter,
                    form16,
                    payslips,
                    documents: documentsList,
                    contacts: contacts.map((c) => ({
                        id: c.id,
                        contactRole: c.contact_person_type,
                        contactName: c.name,
                        contactNumber: c.mobile,
                        contactEmail: c.email,
                    })),
                };
            }));
            return history;
        });
    }
    catch (error) {
        console.error("Error in getEmployeeHistory:", error);
        throw error;
    }
}
// ✅ GET Single Experience Record
async function getSingleExperience(req, employeeId, experienceId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            const experienceRes = await db.query(`SELECT * FROM employee_experience
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`, [experienceId, employeeId]);
            const experience = experienceRes.rows[0];
            if (!experience) {
                throw new Error("Experience record not found");
            }
            // Fetch related documents
            const documentsRes = await db.query(`SELECT * FROM employee_documents WHERE employee_id = $1`, [employeeId]);
            const documents = documentsRes.rows;
            // Fetch related contacts
            const contactsRes = await db.query(`SELECT * FROM employee_contacts WHERE employee_id = $1`, [employeeId]);
            const contacts = contactsRes.rows;
            const experienceLetter = documents.find((d) => d.document_type === "experienceLetter");
            const offerLetter = documents.find((d) => d.document_type === "offerLetter");
            const serviceLetter = documents.find((d) => d.document_type === "serviceLetter");
            const relievingLetter = documents.find((d) => d.document_type === "relievingLetter");
            // Generate presigned URLs for single documents
            const signUrl = async (doc) => doc ? {
                url: await (0, r2Client_1.generatePresignedUrl)(doc.document_url, 86400),
                downloadUrl: await (0, r2Client_1.generatePresignedUrl)(doc.document_url, 86400, true),
                id: doc.id
            } : null;
            const signedExperienceLetter = await signUrl(experienceLetter);
            const signedOfferLetter = await signUrl(offerLetter);
            const signedServiceLetter = await signUrl(serviceLetter);
            const signedRelievingLetter = await signUrl(relievingLetter);
            const form16 = await Promise.all(documents
                .filter((d) => d.document_type === "form16")
                .map(async (d) => ({
                url: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400),
                downloadUrl: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400, true),
                id: d.id
            })));
            const payslips = await Promise.all(documents
                .filter((d) => d.document_type === "payslips")
                .map(async (d) => ({
                url: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400),
                downloadUrl: await (0, r2Client_1.generatePresignedUrl)(d.document_url, 86400, true),
                id: d.id
            })));
            return {
                id: experience.id,
                companyName: experience.company_name,
                designation: experience.designation,
                employmentType: experience.employment_type,
                industry: experience.industry,
                location: experience.location,
                address: experience.company_address,
                doj: experience.joining_date,
                lwd: experience.last_working_date,
                experienceLetter: signedExperienceLetter,
                offerLetter: signedOfferLetter,
                serviceLetter: signedServiceLetter,
                relievingLetter: signedRelievingLetter,
                form16,
                payslips,
                contacts: contacts.map((c) => ({
                    id: c.id,
                    contactRole: c.contact_person_type,
                    contactName: c.name,
                    contactNumber: c.mobile,
                    contactEmail: c.email,
                })),
            };
        });
    }
    catch (error) {
        console.error("Error in getSingleExperience:", error);
        throw error;
    }
}
// ✅ UPDATE Employee History
async function updateEmployeeHistory(req, employeeId, experienceId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        const { history } = req.body;
        if (!history) {
            throw new Error("History data is missing from the request body");
        }
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // Verify experience exists
            const existingRes = await db.query(`SELECT id FROM employee_experience
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`, [experienceId, employeeId]);
            if (!existingRes.rows[0]) {
                throw new Error("Experience record not found");
            }
            // Update experience record
            await db.query(`UPDATE employee_experience
            SET company_name = $1,
                designation = $2,
                employment_type = $3,
                industry = $4,
                location = $5,
                company_address = $6,
                joining_date = $7,
                last_working_date = $8,
                updated_by_id = $9,
                updated_at = now()
          WHERE id = $10`, [
                history.companyName,
                history.designation,
                history.employmentType,
                history.industry,
                history.location,
                history.address,
                history.doj ? new Date(history.doj) : null,
                history.lwd ? new Date(history.lwd) : null,
                employeeId,
                experienceId,
            ]);
            // Handle Single Documents - Update if provided
            const singleDocFields = [
                "experienceLetter",
                "offerLetter",
                "serviceLetter",
                "relievingLetter",
            ];
            for (const docType of singleDocFields) {
                const fileData = history[docType];
                if (fileData && fileData.base64) {
                    // Delete existing document of this type
                    await db.query(`DELETE FROM employee_documents
              WHERE employee_id = $1 AND document_type = $2`, [employeeId, docType]);
                    // Upload and create new document
                    const url = await (0, r2Client_1.uploadEmployeeDocumentToR2)(fileData.base64, fileData.fileName, req.tenantId, employeeId, docType);
                    await db.query(`INSERT INTO employee_documents
               (employee_id, document_type, document_url, created_by_id, updated_by_id)
             VALUES ($1, $2, $3, $4, $5)`, [employeeId, docType, url, employeeId, employeeId]);
                }
            }
            // Handle Array Documents (Form 16, Payslips) - Add new ones
            const listDocFields = ["form16", "payslips"];
            for (const docType of listDocFields) {
                const files = history[docType];
                if (Array.isArray(files)) {
                    for (const fileData of files) {
                        if (fileData && fileData.base64) {
                            const url = await (0, r2Client_1.uploadEmployeeDocumentToR2)(fileData.base64, fileData.fileName, req.tenantId, employeeId, docType);
                            await db.query(`INSERT INTO employee_documents
                   (employee_id, document_type, document_url, created_by_id, updated_by_id)
                 VALUES ($1, $2, $3, $4, $5)`, [employeeId, docType, url, employeeId, employeeId]);
                        }
                    }
                }
            }
            // Update contacts - Delete old and create new
            if (history.contacts && Array.isArray(history.contacts)) {
                await db.query(`DELETE FROM employee_contacts WHERE employee_id = $1`, [employeeId]);
                for (const c of history.contacts) {
                    await db.query(`INSERT INTO employee_contacts
               (employee_id, contact_person_type, name, mobile, email,
                created_by_id, updated_by_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                        employeeId,
                        c.contactRole,
                        c.contactName,
                        c.contactNumber,
                        c.contactEmail,
                        employeeId,
                        employeeId,
                    ]);
                }
            }
            return {
                success: true,
                message: "Employee history updated successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in updateEmployeeHistory:", error);
        throw error;
    }
}
// ✅ DELETE Single Experience Record
async function deleteEmployeeExperience(req, employeeId, experienceId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // Verify experience exists
            const existingRes = await db.query(`SELECT id FROM employee_experience
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`, [experienceId, employeeId]);
            if (!existingRes.rows[0]) {
                throw new Error("Experience record not found");
            }
            // Delete the experience record
            await db.query(`DELETE FROM employee_experience WHERE id = $1`, [
                experienceId,
            ]);
            return {
                success: true,
                message: "Experience record deleted successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in deleteEmployeeExperience:", error);
        throw error;
    }
}
// ✅ DELETE All Employee History
async function deleteAllEmployeeHistory(req, employeeId, client) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await withClient(req, client, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // Delete all experiences
            await db.query(`DELETE FROM employee_experience WHERE employee_id = $1`, [
                employeeId,
            ]);
            // Delete all documents
            await db.query(`DELETE FROM employee_documents WHERE employee_id = $1`, [
                employeeId,
            ]);
            // Delete all contacts
            await db.query(`DELETE FROM employee_contacts WHERE employee_id = $1`, [
                employeeId,
            ]);
            return {
                success: true,
                message: "All employee history deleted successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in deleteAllEmployeeHistory:", error);
        throw error;
    }
}
// ✅ DELETE Single Document
async function deleteEmployeeDocument(req, employeeId, documentId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // Verify document exists
            const documentRes = await db.query(`SELECT id FROM employee_documents
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`, [documentId, employeeId]);
            if (!documentRes.rows[0]) {
                throw new Error("Document not found");
            }
            // Delete the document
            await db.query(`DELETE FROM employee_documents WHERE id = $1`, [
                documentId,
            ]);
            // Note: You may want to also delete the file from R2 storage here
            // using a deleteFromR2 utility function if you have one
            return {
                success: true,
                message: "Document deleted successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in deleteEmployeeDocument:", error);
        throw error;
    }
}
// ✅ DELETE Single Contact
async function deleteEmployeeContact(req, employeeId, contactId) {
    try {
        if (!req.user?.id || !req.tenantId)
            throw new Error("Unauthorized");
        return await (0, onboardingPool_1.withTenant)(req.tenantId, async (db) => {
            // Verify employee exists and belongs to tenant
            const employeeRes = await db.query(`SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [employeeId, req.tenantId]);
            if (!employeeRes.rows[0]) {
                throw new Error("Employee not found");
            }
            // Verify contact exists
            const contactRes = await db.query(`SELECT id FROM employee_contacts
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`, [contactId, employeeId]);
            if (!contactRes.rows[0]) {
                throw new Error("Contact not found");
            }
            // Delete the contact
            await db.query(`DELETE FROM employee_contacts WHERE id = $1`, [contactId]);
            return {
                success: true,
                message: "Contact deleted successfully",
            };
        });
    }
    catch (error) {
        console.error("Error in deleteEmployeeContact:", error);
        throw error;
    }
}
//# sourceMappingURL=employeeHistoryController.js.map