"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientV2Controller = void 0;
// [RAW QUERY] — tenantAwarePrisma fully removed; all DB calls use pool.query() (pg)
const dbpool_1 = __importDefault(require("@/config/dbpool"));
const r2Client_1 = require("@/utils/r2Client");
const socketService_1 = require("@/services/socketService");
const transactionHistory_1 = require("@/utils/transactionHistory");
const crypto_1 = require("crypto");
// =============================================================================
// DATABASE LAYER LEGEND — ClientV2Controller
// =============================================================================
// ALL methods now use [RAW QUERY] via pool.query() — Prisma fully removed.
// Tables:
//   clients_v2, client_contacts_v2, client_documents_v2,
//   employee_client_allocations_v2, client_projects, projects, employees, users
// =============================================================================
// ---------------------------------------------------------------------------
// ROW MAPPERS  (snake_case DB row → camelCase TypeScript object)
// ---------------------------------------------------------------------------
function mapRowToClientV2(row) {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        clientCode: row.client_code,
        companyName: row.company_name,
        legalName: row.legal_name || null,
        clientType: row.client_type,
        parentId: row.parent_id || null,
        companySize: row.company_size || null,
        industry: row.industry || null,
        contractValue: row.contract_value || null,
        yearOfIncorporation: row.year_of_incorporation || null,
        duration: row.duration || null,
        gstVatTaxId: row.gst_vat_tax_id || null,
        registrationNumber: row.registration_number || null,
        country: row.country || null,
        website: row.website || null,
        defaultCurrency: row.default_currency || 'USD',
        billingAddress: row.billing_address || null,
        riskLevel: row.risk_level || null,
        status: row.status,
        pan: row.pan || null,
        vatNumber: row.vat_number || null,
        dunsNumber: row.duns_number || null,
        msmeRegistration: row.msme_registration || null,
        paymentTerms: row.payment_terms || null,
        creditLimit: row.credit_limit || null,
        billingContactEmail: row.billing_contact_email || null,
        accountsPayableName: row.accounts_payable_name || null,
        tdsApplicable: row.tds_applicable,
        reverseCharge: row.reverse_charge_applicable,
        accountManagerId: row.account_manager_id || null,
        salesOwnerId: row.sales_owner_id || null,
        deliveryOwnerId: row.delivery_owner_id || null,
        clientSegment: row.client_segment || null,
        contractStartDate: row.contract_start_date || null,
        contractEndDate: row.contract_end_date || null,
        renewalType: row.renewal_type || null,
        slaLevel: row.sla_level || null,
        bankName: row.bank_name || null,
        bankAccountNumber: row.bank_account_number || null,
        ifscSwift: row.ifsc_swift || null,
        currencyOfPayment: row.currency_of_payment || null,
        preferredPaymentMode: row.preferred_payment_mode || null,
        isActive: row.is_active,
        createdById: row.created_by_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapRowToContact(row) {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name || null,
        designation: row.designation || null,
        department: row.department || null,
        contactType: row.contact_type || null,
        isPrimary: row.is_primary,
        officialEmail: row.official_email,
        secondaryEmail: row.secondary_email || null,
        mobileNumber: row.mobile_number || null,
        alternatePhone: row.alternate_phone || null,
        officeLandline: row.office_landline || null,
        extensionNumber: row.extension_number || null,
        preferredComm: row.preferred_communication_mode || null,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapRowToDocument(row) {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        category: row.category,
        documentType: row.document_type,
        fileName: row.file_name,
        fileUrl: row.file_url,
        version: row.version,
        tags: row.tags || [],
        uploadedById: row.uploaded_by_id || null,
        uploadedByPortalUserId: row.uploaded_by_portal_user_id || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapRowToAllocation(row) {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        employeeId: row.employee_id,
        clientId: row.client_id,
        projectId: row.project_id || null,
        billingType: row.billing_type,
        billAmount: row.bill_amount,
        startDate: row.start_date,
        endDate: row.end_date || null,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        employee: row.emp_id
            ? { id: row.emp_id, first_name: row.emp_first_name, last_name: row.emp_last_name }
            : null,
        project: row.cp_id ? { id: row.cp_id } : null,
    };
}
function mapRowToProjectListing(row) {
    return {
        mappingId: row.mapping_id,
        billingType: row.billing_type,
        budget: row.budget,
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        code: row.code,
        description: row.description,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date || null,
        projectManagerId: row.project_manager_id,
        projectManager: row.pm_id ? { id: row.pm_id, name: row.pm_name, avatarUrl: row.pm_avatar_url } : null,
        defaultPriority: row.default_priority,
        createdById: row.created_by_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        _count: { tickets: row.tickets_count ?? 0, members: row.members_count ?? 0 },
    };
}
function mapRowToProject(row) {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        code: row.code,
        description: row.description,
        status: row.status,
        startDate: row.start_date,
        endDate: row.end_date || null,
        projectManagerId: row.project_manager_id,
        defaultPriority: row.default_priority,
        createdById: row.created_by_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapRowToClientProject(row) {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        clientId: row.client_id,
        projectId: row.project_id,
        billingType: row.billing_type || null,
        budget: row.budget || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
// ---------------------------------------------------------------------------
// camelCase → snake_case column maps (used in dynamic SET clause builders)
// ---------------------------------------------------------------------------
const CLIENT_FIELD_TO_COLUMN = {
    companyName: 'company_name',
    clientType: 'client_type',
    legalName: 'legal_name',
    parentId: 'parent_id',
    companySize: 'company_size',
    industry: 'industry',
    contractValue: 'contract_value',
    yearOfIncorporation: 'year_of_incorporation',
    duration: 'duration',
    gstVatTaxId: 'gst_vat_tax_id',
    registrationNumber: 'registration_number',
    country: 'country',
    website: 'website',
    defaultCurrency: 'default_currency',
    billingAddress: 'billing_address',
    riskLevel: 'risk_level',
    status: 'status',
    pan: 'pan',
    vatNumber: 'vat_number',
    dunsNumber: 'duns_number',
    msmeRegistration: 'msme_registration',
    paymentTerms: 'payment_terms',
    creditLimit: 'credit_limit',
    billingContactEmail: 'billing_contact_email',
    accountsPayableName: 'accounts_payable_name',
    tdsApplicable: 'tds_applicable',
    reverseCharge: 'reverse_charge_applicable',
    accountManagerId: 'account_manager_id',
    salesOwnerId: 'sales_owner_id',
    deliveryOwnerId: 'delivery_owner_id',
    clientSegment: 'client_segment',
    contractStartDate: 'contract_start_date',
    contractEndDate: 'contract_end_date',
    renewalType: 'renewal_type',
    slaLevel: 'sla_level',
    bankName: 'bank_name',
    bankAccountNumber: 'bank_account_number',
    ifscSwift: 'ifsc_swift',
    currencyOfPayment: 'currency_of_payment',
    preferredPaymentMode: 'preferred_payment_mode',
    isActive: 'is_active',
};
const CONTACT_FIELD_TO_COLUMN = {
    firstName: 'first_name',
    lastName: 'last_name',
    displayName: 'display_name',
    designation: 'designation',
    department: 'department',
    contactType: 'contact_type',
    isPrimary: 'is_primary',
    officialEmail: 'official_email',
    secondaryEmail: 'secondary_email',
    mobileNumber: 'mobile_number',
    alternatePhone: 'alternate_phone',
    officeLandline: 'office_landline',
    extensionNumber: 'extension_number',
    preferredComm: 'preferred_communication_mode',
    status: 'status',
};
const ALLOCATION_FIELD_TO_COLUMN = {
    employeeId: 'employee_id',
    clientId: 'client_id',
    projectId: 'project_id',
    billingType: 'billing_type',
    billAmount: 'bill_amount',
    startDate: 'start_date',
    endDate: 'end_date',
    status: 'status',
};
// ---------------------------------------------------------------------------
// Utility: generate next client code using MAX() to avoid count-based collisions
// [RAW QUERY]
// ---------------------------------------------------------------------------
async function generateClientCode(tenantId, idPrefix = 'CL-') {
    const result = await dbpool_1.default.query(`SELECT MAX(CAST(NULLIF(REGEXP_REPLACE(client_code, '^CL-', ''), '') AS INTEGER)) AS max_num
         FROM clients_v2
         WHERE tenant_id = $1 AND client_code LIKE 'CL-%'`, [tenantId]);
    const maxNum = result.rows[0]?.max_num ? parseInt(result.rows[0].max_num, 10) : 0;
    const paddedNum = (maxNum + 1).toString().padStart(6, '0');
    return `${idPrefix}${paddedNum}`;
}
// ---------------------------------------------------------------------------
// Utility: resolve an Employee ID to a User ID
// [RAW QUERY] — previously used Prisma; now uses pool.query()
// ---------------------------------------------------------------------------
async function getUserIdFromEmployeeId(employeeId, tenantId, fallbackUserId) {
    // 1. Try direct link: user.employee_id = employeeId
    try {
        const byEmpId = await dbpool_1.default.query(`SELECT id FROM users WHERE employee_id = $1::uuid AND tenant_id = $2 LIMIT 1`, [employeeId, tenantId]);
        if (byEmpId.rows.length > 0)
            return byEmpId.rows[0].id;
    }
    catch {
        // employeeId is not a valid UUID for employee_id lookup — continue
    }
    // 2. Find employee email, then locate user by that email
    try {
        const empRes = await dbpool_1.default.query(`SELECT work_email, personal_email FROM employees WHERE id = $1::uuid LIMIT 1`, [employeeId]);
        if (empRes.rows.length > 0) {
            const { work_email, personal_email } = empRes.rows[0];
            const byEmail = await dbpool_1.default.query(`SELECT id FROM users
                 WHERE (work_email = $1 OR ($2::text IS NOT NULL AND personal_email = $2))
                   AND tenant_id = $3
                 LIMIT 1`, [work_email, personal_email || null, tenantId]);
            if (byEmail.rows.length > 0)
                return byEmail.rows[0].id;
        }
    }
    catch {
        // not a valid UUID for employees lookup — continue
    }
    // 3. Check if the value is already a valid User ID (text PK)
    const isUser = await dbpool_1.default.query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [employeeId]);
    if (isUser.rows.length > 0)
        return isUser.rows[0].id;
    // 4. Fallback
    if (fallbackUserId)
        return fallbackUserId;
    throw new Error('UserAccountNotFound');
}
// ---------------------------------------------------------------------------
// Validation helpers (unchanged)
// ---------------------------------------------------------------------------
function validateGstVatTaxId(gstVatTaxId, country) {
    if (!gstVatTaxId)
        return null;
    const val = gstVatTaxId.trim();
    if (val === '')
        return null;
    const normCountry = country ? country.trim().toLowerCase() : '';
    const isIndia = normCountry === 'india' || normCountry === 'in';
    const isUS = normCountry === 'us' || normCountry === 'usa' || normCountry === 'united states' || normCountry === 'united states of america';
    const indiaRegex = /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}[1-9A-Za-z]{1}[Zz][0-9A-Za-z]{1}$/;
    const usEinRegex = /^\d{2}-\d{7}$/;
    const usSsnRegex = /^\d{3}-\d{2}-\d{4}$/;
    const usPlainRegex = /^\d{9}$/;
    if (isIndia) {
        if (!indiaRegex.test(val)) {
            return 'Invalid Indian GSTIN format. It must be a 15-character alphanumeric code matching the pattern: 22AAAAA0000A1Z1.';
        }
    }
    else if (isUS) {
        if (!usEinRegex.test(val) && !usSsnRegex.test(val) && !usPlainRegex.test(val)) {
            return 'Invalid US Tax ID format. It must match EIN (XX-XXXXXXX) or SSN (XXX-XX-XXXX) or a 9-digit numeric code.';
        }
    }
    return null;
}
function validatePan(pan, country) {
    if (!pan)
        return null;
    const val = pan.trim();
    if (val === '')
        return null;
    const normCountry = country ? country.trim().toLowerCase() : '';
    const isIndia = normCountry === 'india' || normCountry === 'in';
    const isUS = normCountry === 'us' || normCountry === 'usa' || normCountry === 'united states' || normCountry === 'united states of america';
    const indiaPanRegex = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}$/;
    const usEinRegex = /^\d{2}-\d{7}$/;
    const usSsnRegex = /^\d{3}-\d{2}-\d{4}$/;
    const usPlainRegex = /^\d{9}$/;
    if (isIndia) {
        if (!indiaPanRegex.test(val)) {
            return 'Invalid Indian PAN format. It must be a 10-character alphanumeric code matching the pattern: ABCDE1234F.';
        }
    }
    else if (isUS) {
        if (!usEinRegex.test(val) && !usSsnRegex.test(val) && !usPlainRegex.test(val)) {
            return 'Invalid US Tax ID format for PAN. It must match EIN (XX-XXXXXXX) or SSN (XXX-XX-XXXX) or a 9-digit numeric code.';
        }
    }
    else {
        const matchesIndia = indiaPanRegex.test(val);
        const matchesUS = usEinRegex.test(val) || usSsnRegex.test(val) || usPlainRegex.test(val);
        if (!matchesIndia && !matchesUS) {
            return 'PAN/Tax ID must match either the Indian PAN format (e.g. ABCDE1234F) or US Tax ID format (EIN: XX-XXXXXXX, SSN: XXX-XX-XXXX).';
        }
    }
    return null;
}
function validateYearOfIncorporation(year) {
    if (year === undefined || year === null || year === '')
        return null;
    const yearStr = String(year).trim();
    if (yearStr === '')
        return null;
    const yearNum = Number(yearStr);
    if (isNaN(yearNum) || !/^\d{4}$/.test(yearStr)) {
        return 'Year of Incorporation must be a valid 4-digit number (e.g. 2026).';
    }
    const currentYear = new Date().getFullYear();
    if (yearNum < 1800 || yearNum > currentYear) {
        return `Year of Incorporation must be between 1800 and ${currentYear}.`;
    }
    return null;
}
function validateDuns(duns) {
    if (!duns)
        return null;
    const val = duns.trim();
    if (val === '')
        return null;
    if (!/^\d{9}$/.test(val)) {
        return 'Enter a valid DUNS number (must be exactly 9 digits).';
    }
    return null;
}
function validateIfscSwift(code) {
    if (!code)
        return null;
    const val = code.trim();
    if (val === '')
        return null;
    const ifscRegex = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
    const swiftRegex = /^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/;
    if (!ifscRegex.test(val) && !swiftRegex.test(val)) {
        return 'Enter a valid IFSC or SWIFT code.';
    }
    return null;
}
function validateBankAccountNumber(num) {
    if (!num)
        return null;
    const val = num.trim();
    if (val === '')
        return null;
    if (!/^\d{6,20}$/.test(val)) {
        return 'Enter a valid bank account number (must be between 6 and 20 digits, containing only numbers).';
    }
    return null;
}
function validateWebsite(url) {
    if (!url)
        return null;
    const val = url.trim();
    if (val === '')
        return null;
    const websiteRegex = /^(https?:\/\/)?(www\.)?([a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}(\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=]*)?$/;
    if (!websiteRegex.test(val)) {
        return 'Enter a valid website URL.';
    }
    return null;
}
// ===========================================================================
// CONTROLLER CLASS
// ===========================================================================
class ClientV2Controller {
    // ==============================================
    // CLIENT CORE DETAILS
    // ==============================================
    // [RAW QUERY] — SELECT clients_v2 + employees (accountManager) + subquery COUNT client_projects
    static async getClients(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const { page = 1, limit = 20, search, status, clientType, riskLevel } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            const conditions = ['c.tenant_id = $1', 'c.is_active = true'];
            const params = [req.tenantId];
            let idx = 2;
            if (search) {
                conditions.push(`(c.company_name ILIKE $${idx} OR c.client_code ILIKE $${idx})`);
                params.push(`%${search}%`);
                idx++;
            }
            if (status) {
                conditions.push(`c.status = $${idx}`);
                params.push(status);
                idx++;
            }
            if (clientType) {
                conditions.push(`c.client_type = $${idx}`);
                params.push(clientType);
                idx++;
            }
            if (riskLevel) {
                conditions.push(`c.risk_level = $${idx}`);
                params.push(riskLevel);
                idx++;
            }
            const whereClause = conditions.join(' AND ');
            const countParams = [...params];
            params.push(Number(limit), skip);
            const [clientsRes, countRes] = await Promise.all([
                dbpool_1.default.query(`SELECT c.*,
                            e.id         AS am_id,
                            e.first_name AS am_first_name,
                            e.last_name  AS am_last_name,
                            (SELECT COUNT(*)::int FROM client_projects cp
                             WHERE cp.client_id = c.id AND cp.tenant_id = c.tenant_id) AS project_count
                     FROM clients_v2 c
                     LEFT JOIN employees e ON e.id = c.account_manager_id
                     WHERE ${whereClause}
                     ORDER BY c.created_at DESC
                     LIMIT $${idx} OFFSET $${idx + 1}`, params),
                dbpool_1.default.query(`SELECT COUNT(*)::int AS total FROM clients_v2 c WHERE ${whereClause}`, countParams),
            ]);
            const clients = clientsRes.rows.map((row) => ({
                ...mapRowToClientV2(row),
                accountManager: row.am_id
                    ? { id: row.am_id, first_name: row.am_first_name, last_name: row.am_last_name }
                    : null,
                _count: { ClientProject: row.project_count ?? 0 },
            }));
            res.status(200).json({
                success: true,
                data: clients,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: countRes.rows[0].total,
                    pages: Math.ceil(countRes.rows[0].total / Number(limit)),
                },
            });
        }
        catch (error) {
            console.error('Get ClientV2 error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch clients' });
        }
    }
    // [RAW QUERY] — multi-query: clients_v2 + employees joins, then contacts, documents, allocations
    static async getClientById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { id } = req.params;
            // 1. Main client + manager relations via LEFT JOINs
            const clientRes = await dbpool_1.default.query(`SELECT c.*,
                        am.id  AS am_id,  am.first_name  AS am_first_name,  am.last_name  AS am_last_name,
                        so.id  AS so_id,  so.first_name  AS so_first_name,  so.last_name  AS so_last_name,
                        dlo.id AS do_id, dlo.first_name AS do_first_name, dlo.last_name AS do_last_name
                 FROM clients_v2 c
                 LEFT JOIN employees am  ON am.id  = c.account_manager_id
                 LEFT JOIN employees so  ON so.id  = c.sales_owner_id
                 LEFT JOIN employees dlo ON dlo.id = c.delivery_owner_id
                 WHERE c.id = $1 AND c.tenant_id = $2`, [id, req.tenantId]);
            if (clientRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Client not found' });
                return;
            }
            const row = clientRes.rows[0];
            const client = {
                ...mapRowToClientV2(row),
                accountManager: row.am_id ? { id: row.am_id, first_name: row.am_first_name, last_name: row.am_last_name } : null,
                salesOwner: row.so_id ? { id: row.so_id, first_name: row.so_first_name, last_name: row.so_last_name } : null,
                deliveryOwner: row.do_id ? { id: row.do_id, first_name: row.do_first_name, last_name: row.do_last_name } : null,
            };
            // 2. Contacts
            const contactsRes = await dbpool_1.default.query(`SELECT * FROM client_contacts_v2 WHERE client_id = $1 AND tenant_id = $2`, [id, req.tenantId]);
            client.contacts = contactsRes.rows.map(mapRowToContact);
            // 3. Documents — enrich with presigned URLs + uploader names
            const docsRes = await dbpool_1.default.query(`SELECT * FROM client_documents_v2 WHERE client_id = $1 AND tenant_id = $2`, [id, req.tenantId]);
            let documents = docsRes.rows.map(mapRowToDocument);
            if (documents.length > 0) {
                documents = await Promise.all(documents.map(async (d) => {
                    let signedUrl = d.fileUrl;
                    if (d.fileUrl && (d.fileUrl.includes('r2.cloudflarestorage.com') || d.fileUrl.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && d.fileUrl.includes(process.env.CF_R2_PUBLIC_URL)))) {
                        try {
                            signedUrl = await (0, r2Client_1.generatePresignedUrl)(d.fileUrl, 86400);
                        }
                        catch (err) {
                            console.error(`Failed to generate presigned URL for document ${d.id}:`, err);
                        }
                    }
                    return { ...d, fileUrl: signedUrl };
                }));
                const uploaderIds = Array.from(new Set(documents.map((d) => d.uploadedById).filter((uid) => !!uid)));
                if (uploaderIds.length > 0) {
                    const placeholders = uploaderIds.map((_, i) => `$${i + 1}`).join(',');
                    const uploaderRes = await dbpool_1.default.query(`SELECT id, name FROM users WHERE id IN (${placeholders})`, uploaderIds);
                    const idToName = new Map(uploaderRes.rows.map((r) => [r.id, r.name]));
                    documents = documents.map((d) => ({
                        ...d,
                        uploadedByName: idToName.get(d.uploadedById) || null,
                    }));
                }
            }
            client.documents = documents;
            // 4. Allocations + employee + ClientProject
            const allocsRes = await dbpool_1.default.query(`SELECT a.*,
                        e.id  AS emp_id, e.first_name AS emp_first_name, e.last_name AS emp_last_name,
                        cp.id AS cp_id
                 FROM employee_client_allocations_v2 a
                 LEFT JOIN employees e    ON e.id  = a.employee_id
                 LEFT JOIN client_projects cp ON cp.id = a.project_id
                 WHERE a.client_id = $1`, [id]);
            client.allocations = allocsRes.rows
                .map(mapRowToAllocation)
                .filter((a) => a.employee !== null);
            res.status(200).json({ success: true, data: client });
        }
        catch (error) {
            console.error('getClientById error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch client' });
        }
    }
    // [RAW QUERY] — generateClientCode (MAX) + INSERT INTO clients_v2
    static async createClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const clientData = req.body;
            if (!clientData.companyName || !clientData.clientType) {
                res.status(400).json({ success: false, error: 'companyName and clientType are required' });
                return;
            }
            const validationError = validateGstVatTaxId(clientData.gstVatTaxId, clientData.country);
            if (validationError) {
                res.status(400).json({ success: false, error: validationError });
                return;
            }
            const panValidationError = validatePan(clientData.pan, clientData.country);
            if (panValidationError) {
                res.status(400).json({ success: false, error: panValidationError });
                return;
            }
            const yearValidationError = validateYearOfIncorporation(clientData.yearOfIncorporation);
            if (yearValidationError) {
                res.status(400).json({ success: false, error: yearValidationError });
                return;
            }
            const dunsValidationError = validateDuns(clientData.dunsNumber);
            if (dunsValidationError) {
                res.status(400).json({ success: false, error: dunsValidationError });
                return;
            }
            const ifscSwiftValidationError = validateIfscSwift(clientData.ifscSwift);
            if (ifscSwiftValidationError) {
                res.status(400).json({ success: false, error: ifscSwiftValidationError });
                return;
            }
            const bankAccountValidationError = validateBankAccountNumber(clientData.bankAccountNumber);
            if (bankAccountValidationError) {
                res.status(400).json({ success: false, error: bankAccountValidationError });
                return;
            }
            const websiteValidationError = validateWebsite(clientData.website);
            if (websiteValidationError) {
                res.status(400).json({ success: false, error: websiteValidationError });
                return;
            }
            // Check if client with company name already exists tenant-wise
            const nameCheck = await dbpool_1.default.query(`SELECT 1 FROM clients_v2 WHERE tenant_id = $1 AND LOWER(company_name) = LOWER($2) LIMIT 1`, [req.tenantId, clientData.companyName]);
            if (nameCheck.rows.length > 0) {
                res.status(409).json({ success: false, error: 'A client with this company name already exists' });
                return;
            }
            const MAX_CODE_RETRIES = 5;
            let newClient = null;
            for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
                const clientCode = await generateClientCode(req.tenantId);
                try {
                    // Check if client with client code already exists tenant-wise
                    const codeCheck = await dbpool_1.default.query(`SELECT 1 FROM clients_v2 WHERE tenant_id = $1 AND client_code = $2 LIMIT 1`, [req.tenantId, clientCode]);
                    if (codeCheck.rows.length > 0) {
                        if (attempt < MAX_CODE_RETRIES - 1) {
                            console.warn(`[createClient] client_code collision on attempt ${attempt + 1}, retrying...`);
                            continue;
                        }
                        res.status(409).json({ success: false, error: 'A client with this client code already exists' });
                        return;
                    }
                    // INSERT all 43 fields; is_active defaults to true
                    const r = await dbpool_1.default.query(`INSERT INTO clients_v2 (
                            id, tenant_id, client_code, company_name, legal_name, client_type,
                            parent_id, company_size, industry, contract_value, year_of_incorporation,
                            duration, gst_vat_tax_id, registration_number, country, website,
                            default_currency, billing_address, risk_level, status, pan, vat_number,
                            duns_number, msme_registration, payment_terms, credit_limit,
                            billing_contact_email, accounts_payable_name, tds_applicable,
                            reverse_charge_applicable, account_manager_id, sales_owner_id,
                            delivery_owner_id, client_segment, contract_start_date, contract_end_date,
                            renewal_type, sla_level, bank_name, bank_account_number, ifsc_swift,
                            currency_of_payment, preferred_payment_mode, is_active, created_by_id, updated_at
                        ) VALUES (
                            gen_random_uuid()::text, $1, $2, $3, $4, $5,
                            $6, $7, $8, $9, $10,
                            $11, $12, $13, $14, $15,
                            $16, $17, $18, $19, $20, $21,
                            $22, $23, $24, $25,
                            $26, $27, $28,
                            $29, $30, $31,
                            $32, $33, $34, $35,
                            $36, $37, $38, $39, $40,
                            $41, $42, true, $43, NOW()
                        ) RETURNING *`, [
                        req.tenantId, // $1
                        clientCode, // $2
                        clientData.companyName, // $3
                        clientData.legalName || null, // $4
                        clientData.clientType, // $5
                        clientData.parentId || null, // $6
                        clientData.companySize || null, // $7
                        clientData.industry || null, // $8
                        clientData.contractValue || null, // $9
                        clientData.yearOfIncorporation || null, // $10
                        clientData.duration || null, // $11
                        clientData.gstVatTaxId || null, // $12
                        clientData.registrationNumber || null, // $13
                        clientData.country || null, // $14
                        clientData.website || null, // $15
                        clientData.defaultCurrency || 'USD', // $16
                        clientData.billingAddress || null, // $17
                        clientData.riskLevel || null, // $18
                        clientData.status || 'Prospect', // $19
                        clientData.pan || null, // $20
                        clientData.vatNumber || null, // $21
                        clientData.dunsNumber || null, // $22
                        clientData.msmeRegistration || null, // $23
                        clientData.paymentTerms || null, // $24
                        clientData.creditLimit || null, // $25
                        clientData.billingContactEmail || null, // $26
                        clientData.accountsPayableName || null, // $27
                        clientData.tdsApplicable ?? false, // $28
                        clientData.reverseCharge ?? false, // $29
                        clientData.accountManagerId || null, // $30
                        clientData.salesOwnerId || null, // $31
                        clientData.deliveryOwnerId || null, // $32
                        clientData.clientSegment || null, // $33
                        clientData.contractStartDate ? new Date(clientData.contractStartDate) : null, // $34
                        clientData.contractEndDate ? new Date(clientData.contractEndDate) : null, // $35
                        clientData.renewalType || null, // $36
                        clientData.slaLevel || null, // $37
                        clientData.bankName || null, // $38
                        clientData.bankAccountNumber || null, // $39
                        clientData.ifscSwift || null, // $40
                        clientData.currencyOfPayment || null, // $41
                        clientData.preferredPaymentMode || null, // $42
                        req.user.id, // $43
                    ]);
                    newClient = mapRowToClientV2(r.rows[0]);
                    break; // success — exit retry loop
                }
                catch (err) {
                    const isCodeCollision = err?.code === '23505' && err?.detail?.includes('client_code');
                    if (isCodeCollision && attempt < MAX_CODE_RETRIES - 1) {
                        console.warn(`[createClient] client_code collision on attempt ${attempt + 1}, retrying...`);
                        continue;
                    }
                    throw err; // re-throw for non-collision errors or exhausted retries
                }
            }
            if (!newClient) {
                res.status(500).json({ success: false, error: 'Failed to generate a unique client code after multiple attempts' });
                return;
            }
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_LIST,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Client created: ${newClient.companyName}`,
                entityType: transactionHistory_1.EntityType.CLIENT,
                entityId: newClient.id,
                entityLabel: newClient.companyName,
                afterData: {
                    clientCode: newClient.clientCode,
                    companyName: newClient.companyName,
                    clientType: newClient.clientType,
                    status: newClient.status,
                },
                statusCode: 201,
            });
            res.status(201).json({ success: true, data: newClient, message: 'Client created successfully' });
        }
        catch (error) {
            console.error('Create ClientV2 error:', error);
            if (error.code === '23505') {
                res.status(409).json({ success: false, error: 'A client with this company name or client code already exists' });
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to create client' });
        }
    }
    // [RAW QUERY] — SELECT clients_v2 (existing) + dynamic UPDATE clients_v2
    static async updateClient(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const { id } = req.params;
            const body = req.body;
            const allowedFields = [
                'companyName', 'clientType', 'legalName', 'parentId', 'companySize', 'industry',
                'contractValue', 'yearOfIncorporation', 'duration', 'gstVatTaxId', 'registrationNumber',
                'country', 'website', 'defaultCurrency', 'billingAddress', 'riskLevel', 'status', 'pan',
                'vatNumber', 'dunsNumber', 'msmeRegistration', 'paymentTerms', 'creditLimit',
                'billingContactEmail', 'accountsPayableName', 'tdsApplicable', 'reverseCharge',
                'accountManagerId', 'salesOwnerId', 'deliveryOwnerId', 'clientSegment',
                'contractStartDate', 'contractEndDate', 'renewalType', 'slaLevel', 'bankName',
                'bankAccountNumber', 'ifscSwift', 'currencyOfPayment', 'preferredPaymentMode', 'isActive'
            ];
            const updates = {};
            for (const key of allowedFields) {
                if (key in body) {
                    let value = body[key];
                    if (['contractValue', 'creditLimit'].includes(key)) {
                        value = (value !== null && value !== '' && !isNaN(Number(value))) ? Number(value) : null;
                    }
                    if (['contractStartDate', 'contractEndDate'].includes(key)) {
                        value = (value && value !== '') ? new Date(value) : null;
                    }
                    if (['tdsApplicable', 'reverseCharge', 'isActive'].includes(key)) {
                        value = value === true || value === 'true';
                    }
                    updates[key] = value;
                }
            }
            if (Object.keys(updates).length === 0) {
                res.status(400).json({ success: false, error: 'No valid update fields provided' });
                return;
            }
            // Fetch existing for validation and diff
            const existingRes = await dbpool_1.default.query(`SELECT * FROM clients_v2 WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
            if (existingRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Client not found' });
                return;
            }
            const existingClient = mapRowToClientV2(existingRes.rows[0]);
            // Validations using merged existing + incoming values
            const gstVatTaxId = 'gstVatTaxId' in updates ? updates.gstVatTaxId : existingClient.gstVatTaxId;
            const country = 'country' in updates ? updates.country : existingClient.country;
            const pan = 'pan' in updates ? updates.pan : existingClient.pan;
            const yearOfIncorporation = 'yearOfIncorporation' in updates ? updates.yearOfIncorporation : existingClient.yearOfIncorporation;
            const dunsNumber = 'dunsNumber' in updates ? updates.dunsNumber : existingClient.dunsNumber;
            const ifscSwift = 'ifscSwift' in updates ? updates.ifscSwift : existingClient.ifscSwift;
            const bankAccountNumber = 'bankAccountNumber' in updates ? updates.bankAccountNumber : existingClient.bankAccountNumber;
            const website = 'website' in updates ? updates.website : existingClient.website;
            const validationError = validateGstVatTaxId(gstVatTaxId, country);
            if (validationError) {
                res.status(400).json({ success: false, error: validationError });
                return;
            }
            const panValidationError = validatePan(pan, country);
            if (panValidationError) {
                res.status(400).json({ success: false, error: panValidationError });
                return;
            }
            const yearValidationError = validateYearOfIncorporation(yearOfIncorporation);
            if (yearValidationError) {
                res.status(400).json({ success: false, error: yearValidationError });
                return;
            }
            const dunsValidationError = validateDuns(dunsNumber);
            if (dunsValidationError) {
                res.status(400).json({ success: false, error: dunsValidationError });
                return;
            }
            const ifscSwiftValidationError = validateIfscSwift(ifscSwift);
            if (ifscSwiftValidationError) {
                res.status(400).json({ success: false, error: ifscSwiftValidationError });
                return;
            }
            const bankAccountValidationError = validateBankAccountNumber(bankAccountNumber);
            if (bankAccountValidationError) {
                res.status(400).json({ success: false, error: bankAccountValidationError });
                return;
            }
            const websiteValidationError = validateWebsite(website);
            if (websiteValidationError) {
                res.status(400).json({ success: false, error: websiteValidationError });
                return;
            }
            // Check if another client with the same company name already exists tenant-wise
            if (updates.companyName) {
                const nameCheck = await dbpool_1.default.query(`SELECT 1 FROM clients_v2 WHERE tenant_id = $1 AND LOWER(company_name) = LOWER($2) AND id != $3 LIMIT 1`, [req.tenantId, updates.companyName, id]);
                if (nameCheck.rows.length > 0) {
                    res.status(409).json({ success: false, error: 'A client with this company name already exists' });
                    return;
                }
            }
            // Build dynamic SET clause
            const setClauses = [];
            const values = [];
            let paramIdx = 1;
            for (const [camelKey, value] of Object.entries(updates)) {
                const column = CLIENT_FIELD_TO_COLUMN[camelKey];
                if (column) {
                    setClauses.push(`${column} = $${paramIdx++}`);
                    values.push(value);
                }
            }
            setClauses.push(`updated_at = NOW()`);
            values.push(id, req.tenantId);
            const updatedRes = await dbpool_1.default.query(`UPDATE clients_v2 SET ${setClauses.join(', ')}
                 WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx}
                 RETURNING *`, values);
            const updatedClient = mapRowToClientV2(updatedRes.rows[0]);
            // Audit diff
            const beforeSnap = {};
            const afterSnap = {};
            for (const k of Object.keys(updates)) {
                beforeSnap[k] = existingClient[k];
                afterSnap[k] = updatedClient[k];
            }
            const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
            if (changedFields.length > 0) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.CLIENTS_V2,
                    page: transactionHistory_1.Page.CLIENT_DETAIL,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Client updated (${changedFields.join(', ')})`,
                    entityType: transactionHistory_1.EntityType.CLIENT,
                    entityId: updatedClient.id,
                    entityLabel: updatedClient.companyName,
                    beforeData: before,
                    afterData: after,
                    changedFields,
                    statusCode: 200,
                });
            }
            res.status(200).json({ success: true, data: updatedClient, message: 'Client updated successfully' });
        }
        catch (error) {
            console.error('Update ClientV2 error:', error);
            if (error.code === '23505') {
                res.status(409).json({ success: false, error: 'A client with this company name or client code already exists' });
                return;
            }
            res.status(500).json({ success: false, error: error.message || 'Failed to update client' });
        }
    }
    // ==============================================
    // CONTACTS
    // ==============================================
    // [RAW QUERY] — INSERT INTO client_contacts_v2
    static async addContact(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { clientId } = req.params;
            const data = req.body;
            const r = await dbpool_1.default.query(`INSERT INTO client_contacts_v2 (
                    id, tenant_id, client_id, first_name, last_name, display_name,
                    designation, department, contact_type, is_primary, official_email,
                    secondary_email, mobile_number, alternate_phone, office_landline,
                    extension_number, preferred_communication_mode, status, updated_at
                ) VALUES (
                    gen_random_uuid()::text, $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14,
                    $15, $16, $17, NOW()
                ) RETURNING *`, [
                req.tenantId,
                clientId,
                data.firstName,
                data.lastName,
                data.displayName || null,
                data.designation || null,
                data.department || null,
                data.contactType || null,
                data.isPrimary ?? false,
                data.officialEmail,
                data.secondaryEmail || null,
                data.mobileNumber || null,
                data.alternatePhone || null,
                data.officeLandline || null,
                data.extensionNumber || null,
                data.preferredComm || null,
                data.status || 'Active',
            ]);
            const contact = mapRowToContact(r.rows[0]);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_DETAIL,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Client contact added: ${contact.firstName} ${contact.lastName}`,
                entityType: transactionHistory_1.EntityType.CLIENT_CONTACT,
                entityId: contact.id,
                entityLabel: `${contact.firstName} ${contact.lastName}`,
                parentEntityType: transactionHistory_1.EntityType.CLIENT,
                parentEntityId: clientId,
                afterData: {
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    officialEmail: contact.officialEmail,
                    isPrimary: contact.isPrimary,
                },
                statusCode: 201,
            });
            res.status(201).json({ success: true, data: contact });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to add contact' });
        }
    }
    // [RAW QUERY] — SELECT client_contacts_v2 (existing) + dynamic UPDATE
    static async updateContact(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { contactId } = req.params;
            const data = req.body;
            // Fetch existing for validation and diff
            const existingRes = await dbpool_1.default.query(`SELECT * FROM client_contacts_v2 WHERE id = $1`, [contactId]);
            if (existingRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Contact not found' });
                return;
            }
            const existing = mapRowToContact(existingRes.rows[0]);
            // Build dynamic SET clause
            const setClauses = [];
            const values = [];
            let paramIdx = 1;
            for (const [camelKey, value] of Object.entries(data)) {
                const column = CONTACT_FIELD_TO_COLUMN[camelKey];
                if (column) {
                    setClauses.push(`${column} = $${paramIdx++}`);
                    values.push(value);
                }
            }
            if (setClauses.length === 0) {
                res.status(200).json({ success: true, data: existing });
                return;
            }
            setClauses.push(`updated_at = NOW()`);
            values.push(contactId);
            const updatedRes = await dbpool_1.default.query(`UPDATE client_contacts_v2 SET ${setClauses.join(', ')}
                 WHERE id = $${paramIdx}
                 RETURNING *`, values);
            const contact = mapRowToContact(updatedRes.rows[0]);
            // Audit diff
            const beforeSnap = {};
            const afterSnap = {};
            for (const k of Object.keys(data)) {
                beforeSnap[k] = existing[k];
                afterSnap[k] = contact[k];
            }
            const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
            if (changedFields.length > 0) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.CLIENTS_V2,
                    page: transactionHistory_1.Page.CLIENT_DETAIL,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Client contact updated (${changedFields.join(', ')})`,
                    entityType: transactionHistory_1.EntityType.CLIENT_CONTACT,
                    entityId: contact.id,
                    entityLabel: `${contact.firstName} ${contact.lastName}`,
                    parentEntityType: transactionHistory_1.EntityType.CLIENT,
                    parentEntityId: contact.clientId,
                    beforeData: before,
                    afterData: after,
                    changedFields,
                    statusCode: 200,
                });
            }
            res.status(200).json({ success: true, data: contact });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to update contact' });
        }
    }
    static async deleteContact(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { contactId } = req.params;
            const existingRes = await dbpool_1.default.query(`SELECT * FROM client_contacts_v2 WHERE id = $1 AND tenant_id = $2`, [contactId, req.tenantId]);
            if (existingRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Contact not found' });
                return;
            }
            const existing = mapRowToContact(existingRes.rows[0]);
            await dbpool_1.default.query(`DELETE FROM client_contacts_v2 WHERE id = $1 AND tenant_id = $2`, [contactId, req.tenantId]);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_DETAIL,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Client contact deleted: ${existing.firstName} ${existing.lastName}`,
                entityType: transactionHistory_1.EntityType.CLIENT_CONTACT,
                entityId: contactId,
                entityLabel: `${existing.firstName} ${existing.lastName}`,
                parentEntityType: transactionHistory_1.EntityType.CLIENT,
                parentEntityId: existing.clientId,
                beforeData: {
                    firstName: existing.firstName,
                    lastName: existing.lastName,
                    officialEmail: existing.officialEmail,
                    isPrimary: existing.isPrimary,
                },
                statusCode: 200
            });
            res.status(200).json({ success: true, message: 'Contact deleted successfully' });
        }
        catch (error) {
            console.error('Delete contact error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete contact' });
        }
    }
    // ==============================================
    // DOCUMENTS
    // ==============================================
    // [RAW QUERY] — INSERT INTO client_documents_v2
    static async addDocument(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const { clientId } = req.params;
            const { base64, externalUrl, fileName, category, documentType } = req.body;
            if (!category || !documentType) {
                res.status(400).json({ success: false, error: 'Category and document type are required' });
                return;
            }
            if (!base64 && !externalUrl) {
                res.status(400).json({ success: false, error: 'Either a file upload or an external URL is required' });
                return;
            }
            if (base64 && !fileName) {
                res.status(400).json({ success: false, error: 'fileName is required when uploading a file' });
                return;
            }
            let fileUrl;
            let resolvedFileName;
            if (externalUrl) {
                try {
                    new URL(externalUrl);
                }
                catch {
                    res.status(400).json({ success: false, error: 'externalUrl is not a valid URL' });
                    return;
                }
                fileUrl = externalUrl;
                if (fileName && fileName.trim().length > 0) {
                    resolvedFileName = fileName.trim();
                }
                else {
                    try {
                        const u = new URL(externalUrl);
                        const last = u.pathname.split('/').filter(Boolean).pop();
                        resolvedFileName = last ? decodeURIComponent(last) : u.hostname;
                    }
                    catch {
                        resolvedFileName = externalUrl;
                    }
                }
            }
            else {
                resolvedFileName = fileName;
                fileUrl = await (0, r2Client_1.uploadClientDocumentToR2)(base64, fileName, req.tenantId, clientId, category, documentType);
            }
            const r = await dbpool_1.default.query(`INSERT INTO client_documents_v2 (
                    id, tenant_id, client_id, category, document_type, file_name, file_url,
                    uploaded_by_id, updated_at
                ) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW())
                RETURNING *`, [req.tenantId, clientId, category, documentType, resolvedFileName, fileUrl, req.user.id]);
            const document = mapRowToDocument(r.rows[0]);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_DETAIL,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Client document uploaded: ${document.fileName}`,
                entityType: transactionHistory_1.EntityType.CLIENT_DOCUMENT,
                entityId: document.id,
                entityLabel: document.fileName,
                parentEntityType: transactionHistory_1.EntityType.CLIENT,
                parentEntityId: clientId,
                afterData: { fileName: document.fileName, category: document.category, documentType: document.documentType },
                statusCode: 201,
            });
            socketService_1.socketService.emitToClient(req.tenantId, clientId, 'client_document:created', {
                clientId,
                document: { id: document.id },
            });
            const responseData = { ...document };
            if (document.fileUrl && (document.fileUrl.includes('r2.cloudflarestorage.com') || document.fileUrl.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && document.fileUrl.includes(process.env.CF_R2_PUBLIC_URL)))) {
                try {
                    responseData.fileUrl = await (0, r2Client_1.generatePresignedUrl)(document.fileUrl, 86400);
                }
                catch (err) {
                    console.error(`Failed to generate presigned URL for document ${document.id}:`, err);
                }
            }
            res.status(201).json({ success: true, data: responseData });
        }
        catch (error) {
            console.error('Add document error:', error);
            res.status(500).json({ success: false, error: 'Failed to upload document or save record' });
        }
    }
    // [RAW QUERY] — SELECT + DELETE FROM client_documents_v2
    static async deleteDocument(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { documentId } = req.params;
            const docRes = await dbpool_1.default.query(`SELECT * FROM client_documents_v2 WHERE id = $1 AND tenant_id = $2`, [documentId, req.tenantId]);
            if (docRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Document not found' });
                return;
            }
            const document = mapRowToDocument(docRes.rows[0]);
            if (document.fileUrl) {
                try {
                    await (0, r2Client_1.deleteFileFromR2)(document.fileUrl, req.tenantId);
                }
                catch (r2Error) {
                    console.error('Failed to delete file from R2, continuing with DB deletion:', r2Error);
                }
            }
            await dbpool_1.default.query(`DELETE FROM client_documents_v2 WHERE id = $1`, [documentId]);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_DETAIL,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Client document deleted: ${document.fileName}`,
                entityType: transactionHistory_1.EntityType.CLIENT_DOCUMENT,
                entityId: documentId,
                entityLabel: document.fileName,
                parentEntityType: transactionHistory_1.EntityType.CLIENT,
                parentEntityId: document.clientId,
                beforeData: { fileName: document.fileName, category: document.category, documentType: document.documentType },
                afterData: null,
                statusCode: 200,
            });
            socketService_1.socketService.emitToClient(req.tenantId, document.clientId, 'client_document:deleted', {
                clientId: document.clientId,
                id: documentId,
            });
            res.status(200).json({ success: true, message: 'Document deleted successfully' });
        }
        catch (error) {
            console.error('Delete document error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete document' });
        }
    }
    /**
     * PATCH /api/clients-v2/:clientId/documents/:documentId
     * Updates editable metadata: fileName, category, documentType.
     */
    // [RAW QUERY] — pool.query SELECT (existing doc) + pool.query UPDATE on client_documents_v2
    static async updateDocument(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { clientId, documentId } = req.params;
            const b = req.body || {};
            const fileName = typeof b.fileName === 'string' ? b.fileName.trim() : undefined;
            const category = typeof b.category === 'string' ? b.category.trim() : undefined;
            const documentType = typeof b.documentType === 'string' ? b.documentType.trim() : undefined;
            if (fileName === undefined && category === undefined && documentType === undefined) {
                res.status(400).json({ success: false, error: 'Nothing to update' });
                return;
            }
            if (fileName === '' || category === '' || documentType === '') {
                res.status(400).json({ success: false, error: 'fileName, category and documentType cannot be empty' });
                return;
            }
            const sets = [];
            const params = [];
            if (fileName !== undefined) {
                params.push(fileName);
                sets.push(`file_name = $${params.length}`);
            }
            if (category !== undefined) {
                params.push(category);
                sets.push(`category = $${params.length}`);
            }
            if (documentType !== undefined) {
                params.push(documentType);
                sets.push(`document_type = $${params.length}`);
            }
            sets.push(`updated_at = NOW()`);
            params.push(documentId);
            params.push(req.tenantId);
            params.push(clientId);
            const existingRes = await dbpool_1.default.query(`SELECT category, document_type, file_name FROM client_documents_v2 WHERE id = $1 AND tenant_id = $2 AND client_id = $3`, [documentId, req.tenantId, clientId]);
            const existingDoc = existingRes.rows[0];
            const r = await dbpool_1.default.query(`UPDATE client_documents_v2
                    SET ${sets.join(', ')}
                  WHERE id = $${params.length - 2}
                    AND tenant_id = $${params.length - 1}
                    AND client_id = $${params.length}
                  RETURNING id, category, document_type, file_name, file_url,
                            version, tags, project_id, created_at, updated_at`, params);
            if (r.rowCount === 0) {
                res.status(404).json({ success: false, error: 'Document not found' });
                return;
            }
            const row = r.rows[0];
            if (existingDoc) {
                const beforeSnap = { category: existingDoc.category, documentType: existingDoc.document_type, fileName: existingDoc.file_name };
                const afterSnap = { category: row.category, documentType: row.document_type, fileName: row.file_name };
                const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
                if (changedFields.length > 0) {
                    (0, transactionHistory_1.recordTransaction)({
                        req,
                        section: transactionHistory_1.Section.ADMIN,
                        module: transactionHistory_1.Module.CLIENTS_V2,
                        page: transactionHistory_1.Page.CLIENT_DETAIL,
                        action: transactionHistory_1.Action.UPDATE,
                        actionLabel: `Client document updated (${changedFields.join(', ')})`,
                        entityType: transactionHistory_1.EntityType.CLIENT_DOCUMENT,
                        entityId: row.id,
                        entityLabel: row.file_name,
                        parentEntityType: transactionHistory_1.EntityType.CLIENT,
                        parentEntityId: clientId,
                        beforeData: before,
                        afterData: after,
                        changedFields,
                        statusCode: 200,
                    });
                }
            }
            socketService_1.socketService.emitToClient(req.tenantId, clientId, 'client_document:updated', { clientId, id: row.id });
            let responseFileUrl = row.file_url;
            if (row.file_url && (row.file_url.includes('r2.cloudflarestorage.com') || row.file_url.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && row.file_url.includes(process.env.CF_R2_PUBLIC_URL)))) {
                try {
                    responseFileUrl = await (0, r2Client_1.generatePresignedUrl)(row.file_url, 86400);
                }
                catch (err) {
                    console.error(`Failed to generate presigned URL for document ${row.id}:`, err);
                }
            }
            res.json({
                success: true,
                data: {
                    id: row.id,
                    category: row.category,
                    documentType: row.document_type,
                    fileName: row.file_name,
                    fileUrl: responseFileUrl,
                    version: row.version,
                    tags: row.tags || [],
                    projectId: row.project_id,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                },
            });
        }
        catch (error) {
            console.error('Update document error:', error);
            res.status(500).json({ success: false, error: 'Failed to update document' });
        }
    }
    // [RAW QUERY] — SELECT FROM client_documents_v2 then stream from R2
    static async downloadDocument(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { documentId } = req.params;
            const docRes = await dbpool_1.default.query(`SELECT * FROM client_documents_v2 WHERE id = $1 AND tenant_id = $2`, [documentId, req.tenantId]);
            if (docRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Document not found' });
                return;
            }
            const document = mapRowToDocument(docRes.rows[0]);
            if (!document.fileUrl) {
                res.status(400).json({ success: false, error: 'Document has no file URL' });
                return;
            }
            const isR2Url = document.fileUrl.includes('r2.cloudflarestorage.com') ||
                document.fileUrl.includes('r2.dev') ||
                (process.env.CF_R2_PUBLIC_URL && document.fileUrl.includes(process.env.CF_R2_PUBLIC_URL));
            if (!isR2Url) {
                res.redirect(document.fileUrl);
                return;
            }
            const fileBuffer = await (0, r2Client_1.getFileBufferFromR2)(document.fileUrl);
            const fileExtension = document.fileName.split('.').pop()?.toLowerCase();
            let contentType = 'application/octet-stream';
            if (fileExtension === 'pdf')
                contentType = 'application/pdf';
            else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension || ''))
                contentType = `image/${fileExtension}`;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
            res.send(fileBuffer);
        }
        catch (error) {
            console.error('Download document error:', error);
            res.status(500).json({ success: false, error: 'Failed to download document' });
        }
    }
    /**
     * Delete a client and all its associated data
     */
    // [RAW QUERY] — SELECT clients_v2 + client_documents_v2, then pg transaction DELETE cascade
    static async deleteClient(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { id } = req.params;
            // Fetch client for audit log
            const clientRes = await dbpool_1.default.query(`SELECT * FROM clients_v2 WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
            if (clientRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Client not found' });
                return;
            }
            const client = mapRowToClientV2(clientRes.rows[0]);
            // Fetch documents for R2 cleanup
            const docsRes = await dbpool_1.default.query(`SELECT * FROM client_documents_v2 WHERE client_id = $1`, [id]);
            const documents = docsRes.rows.map(mapRowToDocument);
            // Cleanup R2 files
            for (const doc of documents) {
                if (doc.fileUrl) {
                    try {
                        await (0, r2Client_1.deleteFileFromR2)(doc.fileUrl, req.tenantId);
                    }
                    catch (err) {
                        console.error(`Failed to delete R2 file for doc ${doc.id}:`, err);
                    }
                }
            }
            // Delete in a transaction: contacts → documents → allocations → client
            const pgClient = await dbpool_1.default.connect();
            try {
                await pgClient.query('BEGIN');
                await pgClient.query(`DELETE FROM client_contacts_v2           WHERE client_id = $1`, [id]);
                await pgClient.query(`DELETE FROM client_documents_v2          WHERE client_id = $1`, [id]);
                await pgClient.query(`DELETE FROM employee_client_allocations_v2 WHERE client_id = $1`, [id]);
                await pgClient.query(`DELETE FROM clients_v2 WHERE id = $1 AND tenant_id = $2`, [id, req.tenantId]);
                await pgClient.query('COMMIT');
            }
            catch (txErr) {
                await pgClient.query('ROLLBACK');
                throw txErr;
            }
            finally {
                pgClient.release();
            }
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_DETAIL,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Client deleted: ${client.companyName}`,
                entityType: transactionHistory_1.EntityType.CLIENT,
                entityId: client.id,
                entityLabel: client.companyName,
                beforeData: { companyName: client.companyName, clientCode: client.clientCode, clientType: client.clientType },
                afterData: null,
                statusCode: 200,
            });
            res.status(200).json({ success: true, message: 'Client deleted successfully' });
        }
        catch (error) {
            console.error('Delete client error:', error);
            res.status(500).json({ success: false, error: error.message || 'Failed to delete client' });
        }
    }
    // ==============================================
    // CLIENT PROJECTS
    // ==============================================
    // [RAW QUERY] — SELECT client_projects JOIN projects JOIN users
    static async getProjects(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { clientId } = req.params;
            const r = await dbpool_1.default.query(`SELECT cp.id AS mapping_id, cp.billing_type, cp.budget,
                        p.*,
                        u.id AS pm_id, u.name AS pm_name, u.avatar_url AS pm_avatar_url,
                        (SELECT COUNT(*)::int FROM tickets t WHERE t.project_id = p.id AND t.is_deleted = false) AS tickets_count,
                        (SELECT COUNT(*)::int FROM project_members pm WHERE pm.project_id = p.id) AS members_count
                 FROM client_projects cp
                 JOIN  projects p ON p.id = cp.project_id
                 LEFT JOIN users u ON u.id = p.project_manager_id
                 WHERE cp.client_id = $1 AND cp.tenant_id = $2
                 ORDER BY cp.created_at DESC`, [clientId, req.tenantId]);
            const projects = r.rows.map(mapRowToProjectListing);
            res.status(200).json({ success: true, data: projects });
        }
        catch (error) {
            console.error('getProjects error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch client projects' });
        }
    }
    /**
     * Lightweight project counts for the Client Management dashboard cards.
     * Returns { total, active } scoped to the current tenant.
     */
    // [RAW QUERY] — pool.query COUNT on client_projects + projects
    static async getProjectStats(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const totalRes = await dbpool_1.default.query(`SELECT COUNT(DISTINCT cp.project_id)::int AS count
                 FROM client_projects cp
                 INNER JOIN projects p ON p.id = cp.project_id
                 WHERE cp.tenant_id = $1 AND lower(p.status) != 'deleted'`, [req.tenantId]);
            const activeRes = await dbpool_1.default.query(`SELECT COUNT(DISTINCT cp.project_id)::int AS count
                 FROM client_projects cp
                 INNER JOIN projects p ON p.id = cp.project_id
                 WHERE cp.tenant_id = $1 AND lower(p.status) = 'active'`, [req.tenantId]);
            res.status(200).json({
                success: true,
                data: {
                    total: totalRes.rows[0]?.count ?? 0,
                    active: activeRes.rows[0]?.count ?? 0,
                },
            });
        }
        catch (error) {
            console.error('getProjectStats error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch project stats' });
        }
    }
    /**
     * Live duplicate check for project name/code within the current tenant.
     * Returns { codeExists, nameExists }.
     */
    // [RAW QUERY] — pool.query SELECT on projects (duplicate name/code check)
    static async checkProjectAvailability(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const rawName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
            const rawCode = typeof req.query.code === 'string' ? req.query.code.trim() : '';
            let codeExists = false;
            let nameExists = false;
            if (rawCode.length >= 3) {
                const dbCode = `${req.tenantId}_${rawCode.toUpperCase()}`;
                const r = await dbpool_1.default.query('SELECT 1 FROM projects WHERE tenant_id = $1 AND lower(trim(code)) = lower(trim($2)) LIMIT 1', [req.tenantId, dbCode]);
                codeExists = (r.rowCount ?? 0) > 0;
            }
            if (rawName.length >= 3) {
                const r = await dbpool_1.default.query('SELECT 1 FROM projects WHERE tenant_id = $1 AND lower(trim(name)) = lower(trim($2)) LIMIT 1', [req.tenantId, rawName]);
                nameExists = (r.rowCount ?? 0) > 0;
            }
            res.status(200).json({ success: true, data: { codeExists, nameExists } });
        }
        catch (error) {
            console.error('checkProjectAvailability error:', error);
            res.status(500).json({ success: false, error: 'Failed to check project availability' });
        }
    }
    /**
     * GET /api/clients-v2/:clientId/projects/importable
     * Lists projects not yet linked to this client.
     */
    // [RAW QUERY] — pool.query SELECT on projects + client_projects (importable list)
    static async getImportableProjects(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { clientId } = req.params;
            const search = (req.query.search || '').trim();
            const params = [req.tenantId, clientId];
            let where = `WHERE p.tenant_id = $1
                           AND lower(p.status) <> 'deleted'
                           AND NOT EXISTS (
                             SELECT 1 FROM client_projects cp2
                              WHERE cp2.project_id = p.id
                                AND cp2.tenant_id = $1
                                AND cp2.client_id = $2
                           )`;
            if (search) {
                params.push(`%${search}%`);
                where += ` AND (p.name ILIKE $${params.length} OR p.code ILIKE $${params.length})`;
            }
            const r = await dbpool_1.default.query(`SELECT p.id, p.name, p.code, p.status, p.start_date,
                        p.end_date, p.project_manager_id, p.created_at,
                        u.name AS project_manager_name,
                        (SELECT COUNT(*)::int FROM client_projects cp
                          WHERE cp.project_id = p.id AND cp.tenant_id = $1)
                          AS other_client_count
                   FROM projects p
                   LEFT JOIN users u ON u.id = p.project_manager_id
                   ${where}
                   ORDER BY p.created_at DESC
                   LIMIT 200`, params);
            res.status(200).json({
                success: true,
                data: r.rows.map((row) => ({
                    id: row.id,
                    name: row.name,
                    code: row.code,
                    status: row.status,
                    startDate: row.start_date,
                    endDate: row.end_date,
                    projectManagerId: row.project_manager_id,
                    projectManagerName: row.project_manager_name,
                    createdAt: row.created_at,
                    otherClientCount: row.other_client_count || 0,
                })),
            });
        }
        catch (error) {
            console.error('getImportableProjects error:', error);
            res.status(500).json({ success: false, error: 'Failed to load importable projects' });
        }
    }
    /**
     * POST /api/clients-v2/:clientId/projects/import
     * Bulk-creates client_projects mappings for existing projects.
     */
    // [RAW QUERY] — pool.query SELECT + INSERT INTO client_projects (bulk import)
    static async importProjects(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { clientId } = req.params;
            const { projectIds, billingType, budget } = req.body || {};
            if (!Array.isArray(projectIds) || projectIds.length === 0) {
                res.status(400).json({ success: false, error: 'projectIds is required' });
                return;
            }
            const cl = await dbpool_1.default.query(`SELECT 1 FROM clients_v2 WHERE id = $1 AND tenant_id = $2`, [clientId, req.tenantId]);
            if (cl.rowCount === 0) {
                res.status(404).json({ success: false, error: 'Client not found' });
                return;
            }
            const valid = await dbpool_1.default.query(`SELECT p.id
                   FROM projects p
                  WHERE p.tenant_id = $1
                    AND p.id = ANY($2::text[])
                    AND lower(p.status) <> 'deleted'
                    AND NOT EXISTS (
                      SELECT 1 FROM client_projects cp
                       WHERE cp.project_id = p.id
                         AND cp.tenant_id = $1
                         AND cp.client_id = $3
                    )`, [req.tenantId, projectIds, clientId]);
            const toLink = valid.rows.map((r) => r.id);
            const skipped = projectIds.length - toLink.length;
            for (const pid of toLink) {
                await dbpool_1.default.query(`INSERT INTO client_projects
                       (id, tenant_id, client_id, project_id, billing_type, budget, updated_at)
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
                     ON CONFLICT DO NOTHING`, [req.tenantId, clientId, pid, billingType || null, budget ?? null]);
            }
            if (toLink.length > 0) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.CLIENTS_V2,
                    page: transactionHistory_1.Page.CLIENT_DETAIL,
                    action: transactionHistory_1.Action.BULK_ASSIGN,
                    actionLabel: `Imported ${toLink.length} project(s) to client`,
                    entityType: transactionHistory_1.EntityType.CLIENT,
                    entityId: clientId,
                    correlationId: (0, crypto_1.randomUUID)(),
                    metadata: { projectIds: toLink, billingType, budget },
                    statusCode: 201,
                });
            }
            res.status(201).json({
                success: true,
                data: { linked: toLink.length, skipped, projectIds: toLink },
            });
        }
        catch (error) {
            console.error('importProjects error:', error);
            res.status(500).json({ success: false, error: 'Failed to import projects' });
        }
    }
    // [RAW QUERY] — pg transaction: INSERT projects + INSERT client_projects
    static async addProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { clientId } = req.params;
            const { name, code, budget, billingType, status, projectManagerId, startDate, endDate } = req.body;
            if (!name || !code) {
                res.status(400).json({ success: false, error: 'Project name and code are required' });
                return;
            }
            const actualProjectManagerId = await getUserIdFromEmployeeId(projectManagerId, req.tenantId, req.user.id);
            const pgClient = await dbpool_1.default.connect();
            let project;
            let mapping;
            try {
                await pgClient.query('BEGIN');
                // 1. Create project
                const projectRes = await pgClient.query(`INSERT INTO projects (
                        id, tenant_id, name, code, description, status,
                        start_date, end_date, project_manager_id, default_priority,
                        created_by_id, updated_at
                    ) VALUES (
                        gen_random_uuid()::text, $1, $2, $3, $4, $5,
                        $6, $7, $8, $9,
                        $10, NOW()
                    ) RETURNING *`, [
                    req.tenantId,
                    name,
                    code,
                    `Client project for ${clientId}`,
                    status || 'Draft',
                    new Date(startDate),
                    endDate ? new Date(endDate) : null,
                    actualProjectManagerId,
                    'medium',
                    req.user.id,
                ]);
                project = mapRowToProject(projectRes.rows[0]);
                // 2. Create mapping
                const mappingRes = await pgClient.query(`INSERT INTO client_projects (
                        id, tenant_id, client_id, project_id, billing_type, budget, updated_at
                    ) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
                    RETURNING *`, [req.tenantId, clientId, project.id, billingType || null, budget || null]);
                mapping = mapRowToClientProject(mappingRes.rows[0]);
                await pgClient.query('COMMIT');
            }
            catch (txErr) {
                await pgClient.query('ROLLBACK');
                throw txErr;
            }
            finally {
                pgClient.release();
            }
            res.status(201).json({ success: true, data: { project, mapping } });
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_DETAIL,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Client project created: ${project.name}`,
                entityType: transactionHistory_1.EntityType.PROJECT,
                entityId: project.id,
                entityLabel: project.name,
                parentEntityType: transactionHistory_1.EntityType.CLIENT,
                parentEntityId: clientId,
                afterData: { name: project.name, code: project.code, budget: mapping.budget, billingType: mapping.billingType },
                statusCode: 201,
            });
        }
        catch (error) {
            console.error('addProject error:', error);
            if (error.message === 'UserAccountNotFound') {
                res.status(400).json({ success: false, error: 'The selected employee must have a system user account to be assigned as Project Manager' });
                return;
            }
            if (error.code === '23505') {
                res.status(400).json({ success: false, error: 'Project code must be unique' });
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to create project' });
        }
    }
    /**
     * @route   PUT /api/clients-v2/projects/:projectId
     * @desc    Update an existing project and its client mapping
     */
    // [RAW QUERY] — UPDATE projects + UPDATE client_projects
    static async updateProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { projectId } = req.params;
            const { name, code, budget, billingType, status, projectManagerId, startDate, endDate } = req.body;
            let actualProjectManagerId = projectManagerId;
            if (projectManagerId) {
                actualProjectManagerId = await getUserIdFromEmployeeId(projectManagerId, req.tenantId, req.user.id);
            }
            // Build project update SET clause
            const projectSets = [];
            const projectValues = [];
            let pIdx = 1;
            if (name) {
                projectSets.push(`name = $${pIdx++}`);
                projectValues.push(name);
            }
            if (code) {
                projectSets.push(`code = $${pIdx++}`);
                projectValues.push(code);
            }
            if (status) {
                projectSets.push(`status = $${pIdx++}`);
                projectValues.push(status);
            }
            if (actualProjectManagerId) {
                projectSets.push(`project_manager_id = $${pIdx++}`);
                projectValues.push(actualProjectManagerId);
            }
            if (startDate) {
                projectSets.push(`start_date = $${pIdx++}`);
                projectValues.push(new Date(startDate));
            }
            if (endDate !== undefined) {
                projectSets.push(`end_date = $${pIdx++}`);
                projectValues.push(endDate ? new Date(endDate) : null);
            }
            let project = null;
            if (projectSets.length > 0) {
                projectSets.push(`updated_at = NOW()`);
                projectValues.push(projectId);
                const projectRes = await dbpool_1.default.query(`UPDATE projects SET ${projectSets.join(', ')} WHERE id = $${pIdx} RETURNING *`, projectValues);
                project = mapRowToProject(projectRes.rows[0]);
            }
            else {
                const projectRes = await dbpool_1.default.query(`SELECT * FROM projects WHERE id = $1`, [projectId]);
                project = projectRes.rows.length > 0 ? mapRowToProject(projectRes.rows[0]) : null;
            }
            // Find mapping for clientId (used in audit log + response)
            const existingMappingRes = await dbpool_1.default.query(`SELECT * FROM client_projects WHERE project_id = $1 AND tenant_id = $2 LIMIT 1`, [projectId, req.tenantId]);
            const existingMappingRow = existingMappingRes.rows[0] || null;
            let mapping = existingMappingRow ? mapRowToClientProject(existingMappingRow) : null;
            // Update mapping if billing fields changed
            const mappingSets = [];
            const mappingValues = [];
            let mIdx = 1;
            if (billingType !== undefined) {
                mappingSets.push(`billing_type = $${mIdx++}`);
                mappingValues.push(billingType);
            }
            if (budget !== undefined) {
                mappingSets.push(`budget = $${mIdx++}`);
                mappingValues.push(budget);
            }
            if (mappingSets.length > 0 && existingMappingRow) {
                mappingSets.push(`updated_at = NOW()`);
                mappingValues.push(existingMappingRow.id);
                const mappingRes = await dbpool_1.default.query(`UPDATE client_projects SET ${mappingSets.join(', ')} WHERE id = $${mIdx} RETURNING *`, mappingValues);
                mapping = mapRowToClientProject(mappingRes.rows[0]);
            }
            if (project) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.CLIENTS_V2,
                    page: transactionHistory_1.Page.CLIENT_DETAIL,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Client project updated: ${project.name}`,
                    entityType: transactionHistory_1.EntityType.PROJECT,
                    entityId: project.id,
                    entityLabel: project.name,
                    parentEntityType: transactionHistory_1.EntityType.CLIENT,
                    parentEntityId: mapping?.clientId || null,
                    afterData: { name: project.name, code: project.code, status: project.status },
                    statusCode: 200,
                });
            }
            res.status(200).json({ success: true, data: { project, mapping }, message: 'Project updated successfully' });
        }
        catch (error) {
            console.error('updateProject error:', error);
            if (error.message === 'UserAccountNotFound') {
                res.status(400).json({ success: false, error: 'The selected employee must have a system user account to be assigned as Project Manager' });
                return;
            }
            if (error.code === '23505') {
                res.status(400).json({ success: false, error: 'Project code must be unique' });
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to update project' });
        }
    }
    /**
     * @route   DELETE /api/clients-v2/projects/:projectId
     * @desc    Delete a project and its client mapping
     */
    // [RAW QUERY] — DELETE client_projects + DELETE projects
    static async deleteProject(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { projectId } = req.params;
            // Fetch mapping + project for audit log
            const [mappingRes, projectRes] = await Promise.all([
                dbpool_1.default.query(`SELECT * FROM client_projects WHERE project_id = $1 AND tenant_id = $2 LIMIT 1`, [projectId, req.tenantId]),
                dbpool_1.default.query(`SELECT * FROM projects WHERE id = $1`, [projectId]),
            ]);
            const mapping = mappingRes.rows[0] ? mapRowToClientProject(mappingRes.rows[0]) : null;
            const project = projectRes.rows[0] ? mapRowToProject(projectRes.rows[0]) : null;
            // Delete mapping first, then project (DB cascade handles deeper relations)
            await dbpool_1.default.query(`DELETE FROM client_projects WHERE project_id = $1 AND tenant_id = $2`, [projectId, req.tenantId]);
            await dbpool_1.default.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
            if (project) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.CLIENTS_V2,
                    page: transactionHistory_1.Page.CLIENT_DETAIL,
                    action: transactionHistory_1.Action.DELETE,
                    actionLabel: `Client project deleted: ${project.name}`,
                    entityType: transactionHistory_1.EntityType.PROJECT,
                    entityId: projectId,
                    entityLabel: project.name,
                    parentEntityType: transactionHistory_1.EntityType.CLIENT,
                    parentEntityId: mapping?.clientId || null,
                    beforeData: { name: project.name, code: project.code },
                    afterData: null,
                    statusCode: 200,
                });
            }
            res.status(200).json({ success: true, message: 'Project deleted successfully' });
        }
        catch (error) {
            console.error('deleteProject error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete project' });
        }
    }
    // ==============================================
    // EMPLOYEE ALLOCATIONS
    // ==============================================
    // [RAW QUERY] — INSERT INTO employee_client_allocations_v2
    static async addAllocation(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { clientId } = req.params;
            const data = req.body;
            const r = await dbpool_1.default.query(`INSERT INTO employee_client_allocations_v2 (
                    id, tenant_id, employee_id, client_id, project_id,
                    billing_type, bill_amount, start_date, end_date, status, updated_at
                ) VALUES (
                    gen_random_uuid()::text, $1, $2::uuid, $3, $4,
                    $5, $6, $7, $8, $9, NOW()
                ) RETURNING *`, [
                req.tenantId,
                data.employeeId,
                clientId,
                data.projectId || null,
                data.billingType,
                data.billAmount ?? 0,
                data.startDate ? new Date(data.startDate) : null,
                data.endDate ? new Date(data.endDate) : null,
                data.status || 'Active',
            ]);
            const allocation = mapRowToAllocation(r.rows[0]);
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.CLIENTS_V2,
                page: transactionHistory_1.Page.CLIENT_DETAIL,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: 'Employee allocated to client',
                entityType: transactionHistory_1.EntityType.CLIENT_ALLOCATION,
                entityId: allocation.id,
                entityLabel: `Employee: ${allocation.employeeId}`,
                parentEntityType: transactionHistory_1.EntityType.CLIENT,
                parentEntityId: clientId,
                afterData: {
                    employeeId: allocation.employeeId,
                    projectId: allocation.projectId,
                    billingType: allocation.billingType,
                    billAmount: allocation.billAmount,
                    startDate: allocation.startDate,
                    endDate: allocation.endDate,
                },
                statusCode: 201,
            });
            res.status(201).json({ success: true, data: allocation });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to add allocation' });
        }
    }
    // [RAW QUERY] — SELECT employee_client_allocations_v2 (existing) + dynamic UPDATE
    static async updateAllocation(req, res) {
        try {
            if (!req.tenantId)
                return;
            const { allocationId } = req.params;
            const data = req.body;
            // Fetch existing for validation and diff
            const existingRes = await dbpool_1.default.query(`SELECT * FROM employee_client_allocations_v2 WHERE id = $1`, [allocationId]);
            if (existingRes.rows.length === 0) {
                res.status(404).json({ success: false, error: 'Allocation not found' });
                return;
            }
            const existing = mapRowToAllocation(existingRes.rows[0]);
            // Build dynamic SET clause
            const setClauses = [];
            const values = [];
            let paramIdx = 1;
            for (const [camelKey, value] of Object.entries(data)) {
                const column = ALLOCATION_FIELD_TO_COLUMN[camelKey];
                if (column) {
                    setClauses.push(`${column} = $${paramIdx++}`);
                    // Cast dates
                    if (['start_date', 'end_date'].includes(column)) {
                        values.push(value ? new Date(value) : null);
                    }
                    else {
                        values.push(value);
                    }
                }
            }
            if (setClauses.length === 0) {
                res.status(200).json({ success: true, data: existing });
                return;
            }
            setClauses.push(`updated_at = NOW()`);
            values.push(allocationId);
            const updatedRes = await dbpool_1.default.query(`UPDATE employee_client_allocations_v2 SET ${setClauses.join(', ')}
                 WHERE id = $${paramIdx}
                 RETURNING *`, values);
            const allocation = mapRowToAllocation(updatedRes.rows[0]);
            // Audit diff
            const beforeSnap = {};
            const afterSnap = {};
            for (const k of Object.keys(data)) {
                beforeSnap[k] = existing[k];
                afterSnap[k] = allocation[k];
            }
            const { changedFields, before, after } = (0, transactionHistory_1.diffShallow)(beforeSnap, afterSnap);
            if (changedFields.length > 0) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.CLIENTS_V2,
                    page: transactionHistory_1.Page.CLIENT_DETAIL,
                    action: transactionHistory_1.Action.UPDATE,
                    actionLabel: `Employee client allocation updated (${changedFields.join(', ')})`,
                    entityType: transactionHistory_1.EntityType.CLIENT_ALLOCATION,
                    entityId: allocation.id,
                    entityLabel: `Employee: ${allocation.employeeId}`,
                    parentEntityType: transactionHistory_1.EntityType.CLIENT,
                    parentEntityId: allocation.clientId,
                    beforeData: before,
                    afterData: after,
                    changedFields,
                    statusCode: 200,
                });
            }
            res.status(200).json({ success: true, data: allocation });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to update allocation' });
        }
    }
    // ==============================================
    // UTILITY: EMPLOYEE DROPDOWN
    // ==============================================
    // [RAW QUERY] — SELECT id, first_name, last_name, employee_code FROM employees
    static async getEmployeesForSelect(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
                return;
            }
            const r = await dbpool_1.default.query(`SELECT id, first_name, last_name, employee_code
                 FROM employees
                 WHERE tenant_id = $1
                 ORDER BY first_name ASC`, [req.tenantId]);
            res.status(200).json({ success: true, data: r.rows });
        }
        catch (error) {
            console.error('getEmployeesForSelect error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch employees' });
        }
    }
    // ==============================================
    // CLIENT INVOICES (PORTAL VIEW)
    // ==============================================
    // [RAW QUERY] — pool.query SELECT on customers + invoices
    static async getClientInvoices(req, res) {
        try {
            if (!req.tenantId) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { clientId } = req.params;
            // 1. Get all customer IDs linked to this client
            const linkRows = await dbpool_1.default.query(`SELECT id as customer_id FROM customers WHERE tenant_id = $1 AND client_id = $2`, [req.tenantId, clientId]);
            const customerIds = linkRows.rows.map((r) => r.customer_id);
            if (customerIds.length === 0) {
                res.status(200).json({ success: true, data: [] });
                return;
            }
            // 2. Fetch invoices matching portal visibility statuses
            const validStatuses = ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED'];
            const r = await dbpool_1.default.query(`SELECT
                    i.id,
                    i.invoice_number  AS "invoiceNumber",
                    i.invoice_date    AS "invoiceDate",
                    i.due_date        AS "dueDate",
                    i.currency,
                    i.subtotal,
                    i.tax_total       AS "taxTotal",
                    i.discount_total  AS "discountTotal",
                    i.grand_total     AS "grandTotal",
                    i.balance_due     AS "balanceDue",
                    i.paid_amount     AS "paidAmount",
                    i.status,
                    i.client_status   AS "clientStatus",
                    c.company_name    AS "customerName"
                 FROM invoices i
                 LEFT JOIN customers c ON i.customer_id = c.id
                 WHERE i.tenant_id = $1
                   AND i.customer_id = ANY($2::text[])
                   AND i.deleted_at IS NULL
                   AND i.status::text = ANY($3::text[])
                 ORDER BY i.created_at DESC`, [req.tenantId, customerIds, validStatuses]);
            const data = r.rows.map((row) => ({
                ...row,
                isOverdue: ['SENT', 'PARTIALLY_PAID', 'VIEWED'].includes(row.status) && row.dueDate && new Date(row.dueDate) < new Date(),
            }));
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            console.error('getClientInvoices error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch client invoices' });
        }
    }
}
exports.ClientV2Controller = ClientV2Controller;
exports.default = ClientV2Controller;
//# sourceMappingURL=clientV2Controller.js.map