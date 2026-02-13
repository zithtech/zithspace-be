"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceController = void 0;
const client_1 = require("@prisma/client"); // Add this import
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const pdfService_1 = require("@/services/pdfService");
const r2Client_1 = require("@/utils/r2Client");
class InvoiceController {
    /** ====================
     *  Helper: Calculate totals with tax inclusive support
     * ==================== */
    static calculateTotals(items, discount = 0, taxInclusive = false) {
        let subtotal = 0;
        let taxTotal = 0;
        console.log("Calculating totals with:", {
            itemsCount: items.length,
            discount,
            taxInclusive
        });
        items.forEach((item, index) => {
            const qty = Number(item.qty || 0);
            const price = Number(item.price || 0);
            const taxRate = Number(item.tax || 0);
            const linePrice = qty * price;
            console.log(`Item ${index}: qty=${qty}, price=${price}, tax=${taxRate}, linePrice=${linePrice}`);
            if (taxInclusive && taxRate > 0) {
                // TAX INCLUSIVE: price already includes tax
                const netAmount = linePrice / (1 + taxRate / 100);
                const lineTax = linePrice - netAmount;
                subtotal += netAmount;
                taxTotal += lineTax;
                console.log(`  Tax Inclusive: net=${netAmount.toFixed(2)}, tax=${lineTax.toFixed(2)}`);
            }
            else {
                // TAX EXCLUSIVE: tax added on top
                const lineTax = linePrice * (taxRate / 100);
                subtotal += linePrice;
                taxTotal += lineTax;
                console.log(`  Tax Exclusive: line=${linePrice.toFixed(2)}, tax=${lineTax.toFixed(2)}`);
            }
        });
        // Apply discount
        const discountAmount = Number(discount || 0);
        const totalBeforeDiscount = subtotal + taxTotal;
        const total = Math.max(0, totalBeforeDiscount - discountAmount);
        const balanceDue = total;
        const result = {
            subtotal: Number(subtotal.toFixed(2)),
            taxTotal: Number(taxTotal.toFixed(2)),
            discount: discountAmount,
            total: Number(total.toFixed(2)),
            balanceDue: Number(balanceDue.toFixed(2)),
        };
        console.log("Final calculated totals:", result);
        console.log("Breakdown: subtotal + taxTotal =", subtotal + taxTotal, "- discount", discountAmount, "= total", total);
        return result;
    }
    /** ====================
     *  Helper: Generate invoice number
     * ==================== */
    static async generateInvoiceNumber(dbClient, tenantId, profileId) {
        console.log('🔢 Generating invoice number - Tenant:', tenantId, 'Profile:', profileId);
        try {
            // 1. Get the profile for formatting
            const profile = await dbClient.settingsProfile.findFirst({
                where: { id: profileId, tenantId },
                include: { invoice: true }
            });
            if (!profile || !profile.invoice) {
                throw new types_1.ValidationError('Invoice settings profile not found');
            }
            const settings = profile.invoice;
            const now = new Date();
            const currentYear = now.getFullYear();
            console.log('📋 Profile format:', profile.name, '-', settings.format);
            // ✅ FIX: Get ALL invoices including soft-deleted ones
            // Do NOT filter by deletedAt - we need to see deleted records too
            const allInvoices = await dbClient.invoice.findMany({
                where: {
                    tenantId
                    // ❌ NO deletedAt filter here - include ALL records
                },
                select: {
                    invoiceNumber: true
                }
            });
            console.log(`📊 Found ${allInvoices.length} total invoices (including deleted)`);
            // Extract all numbers from existing invoices (including deleted)
            let highestNumber = 0;
            allInvoices.forEach((invoice) => {
                // Match numbers at the end of the string
                const match = invoice.invoiceNumber.match(/(\d+)$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > highestNumber) {
                        highestNumber = num;
                    }
                }
            });
            console.log('📈 Highest invoice number ever used (including deleted):', highestNumber);
            // Start from highest + 1 (NEVER reuse numbers)
            let nextNumber = highestNumber + 1;
            // Check if yearly reset is enabled in profile settings
            if (settings.resetYearly) {
                // Check highest number for current year (including deleted)
                let highestThisYear = 0;
                allInvoices.forEach((inv) => {
                    if (inv.invoiceNumber.includes(`-${currentYear}-`) ||
                        inv.invoiceNumber.includes(`/${currentYear}/`)) {
                        const match = inv.invoiceNumber.match(/(\d+)$/);
                        if (match) {
                            const num = parseInt(match[1], 10);
                            if (num > highestThisYear) {
                                highestThisYear = num;
                            }
                        }
                    }
                });
                if (highestThisYear === 0) {
                    // First invoice of the year
                    nextNumber = 1;
                    console.log('🔄 First invoice of the year, starting from 1');
                }
                else {
                    nextNumber = highestThisYear + 1;
                    console.log(`📊 Highest in ${currentYear}: ${highestThisYear}, next: ${nextNumber}`);
                }
            }
            console.log('🔢 Next invoice number (will not reuse deleted numbers):', nextNumber);
            // Format the invoice number
            const paddedNumber = nextNumber.toString().padStart(settings.padding, '0');
            let formattedNumber = settings.format
                .replace('{YYYY}', currentYear.toString())
                .replace('{YY}', (currentYear % 100).toString().padStart(2, '0'))
                .replace('{MM}', (now.getMonth() + 1).toString().padStart(2, '0'))
                .replace('{DD}', now.getDate().toString().padStart(2, '0'))
                .replace('{###}', paddedNumber);
            console.log('✨ Formatted invoice number:', formattedNumber);
            return formattedNumber;
        }
        catch (error) {
            console.error('❌ Error in generateInvoiceNumber:', error);
            throw error;
        }
    }
    /** ====================
     *  Get next invoice number (pre-generate)
     * ==================== */
    static async getNextInvoiceNumber(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { profileId } = req.query;
            // 1. Get profile for formatting (either specified or active)
            const profile = await database_1.prisma.settingsProfile.findFirst({
                where: {
                    id: profileId ? String(profileId) : undefined,
                    tenantId: req.tenantId,
                    isActive: profileId ? undefined : true
                },
                include: { invoice: true }
            });
            if (!profile?.invoice) {
                throw new types_1.ValidationError('Invoice settings profile not found');
            }
            const settings = profile.invoice;
            const currentYear = new Date().getFullYear();
            // 2. Get ALL invoices including soft-deleted for this tenant
            const allInvoices = await database_1.prisma.invoice.findMany({
                where: { tenantId: req.tenantId },
                select: { invoiceNumber: true }
            });
            // 3. Calculate next number based on ALL invoices (including deleted)
            let nextNumber;
            if (settings.resetYearly) {
                // Find highest number in current year (including deleted)
                let highestThisYear = 0;
                allInvoices.forEach((invoice) => {
                    if (invoice.invoiceNumber.includes(`-${currentYear}-`) ||
                        invoice.invoiceNumber.includes(`/${currentYear}/`)) {
                        const match = invoice.invoiceNumber.match(/(\d+)$/);
                        if (match) {
                            const num = parseInt(match[1], 10);
                            if (num > highestThisYear) {
                                highestThisYear = num;
                            }
                        }
                    }
                });
                nextNumber = highestThisYear === 0 ? 1 : highestThisYear + 1;
            }
            else {
                // Find highest number ever (including deleted)
                let highestOverall = 0;
                allInvoices.forEach((invoice) => {
                    const match = invoice.invoiceNumber.match(/(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > highestOverall) {
                            highestOverall = num;
                        }
                    }
                });
                nextNumber = highestOverall + 1;
            }
            // 4. Format the number with profile's format
            const padded = nextNumber.toString().padStart(settings.padding, '0');
            const now = new Date();
            let invoiceNumber = settings.format
                .replace('{YYYY}', currentYear.toString())
                .replace('{YY}', (currentYear % 100).toString().padStart(2, '0'))
                .replace('{MM}', (now.getMonth() + 1).toString().padStart(2, '0'))
                .replace('{DD}', now.getDate().toString().padStart(2, '0'))
                .replace('{###}', padded);
            console.log('📝 Next invoice number for profile', profile.name, ':', invoiceNumber);
            res.status(200).json({
                success: true,
                data: {
                    invoiceNumber,
                    nextNumber,
                    profileName: profile.name,
                    format: settings.format
                }
            });
        }
        catch (error) {
            console.error('Get next invoice number error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get next invoice number'
            });
        }
    }
    /** ====================
     *  Create Invoice
     * ==================== */
    static async createInvoice(req, res) {
        try {
            console.log('🔵 CREATE INVOICE START ====================');
            if (!req.tenantId || !req.user) {
                console.error('❌ Missing tenant context or user');
                res.status(400).json({
                    success: false,
                    error: 'Tenant context and authentication required'
                });
                return;
            }
            console.log('Tenant ID:', req.tenantId);
            console.log('User ID:', req.user.id);
            // Extract all fields from request body
            const { items, discount = 0, customerId, customerSnapshot, settingsProfileId, taxInclusive = false, status = 'DRAFT', currency = 'USD', invoiceDate, dueDate, invoiceType = 'STANDARD', notes = '', terms = '', description = '', // ✅ Added description field
            ...otherData } = req.body;
            // Validate required fields
            if (!items || !items.length) {
                throw new types_1.ValidationError('Invoice must have at least one item');
            }
            if (!customerId) {
                throw new types_1.ValidationError('Customer ID is required');
            }
            if (!invoiceDate || !dueDate) {
                throw new types_1.ValidationError('Invoice date and due date are required');
            }
            // 2️⃣ FETCH SETTINGS PROFILE
            console.log('🔍 FETCHING SETTINGS PROFILE...');
            let profile = await database_1.prisma.settingsProfile.findFirst({
                where: {
                    id: settingsProfileId || undefined,
                    tenantId: req.tenantId,
                    isActive: settingsProfileId ? undefined : true
                },
                include: {
                    invoice: true,
                    general: true,
                    payment: true
                }
            });
            if (!profile) {
                console.error('❌ Settings profile not found');
                throw new types_1.ValidationError('No settings profile found');
            }
            if (!profile.invoice) {
                console.error('❌ Invoice settings not found in profile');
                throw new types_1.ValidationError('No invoice settings found in profile');
            }
            console.log('✅ Settings profile found:', profile.id, profile.name);
            // 3️⃣ VALIDATE CUSTOMER
            console.log('🔍 VALIDATING CUSTOMER...');
            const customer = await database_1.prisma.customer.findUnique({
                where: {
                    id: customerId,
                    tenantId: req.tenantId,
                }
            });
            if (!customer) {
                console.error('❌ Customer not found:', customerId);
                throw new types_1.ValidationError(`Customer with ID ${customerId} not found`);
            }
            console.log('✅ Customer found:', customer.companyName);
            // 4️⃣ BUILD CUSTOMER SNAPSHOT
            console.log('📸 BUILDING CUSTOMER SNAPSHOT...');
            let finalSnapshot = customerSnapshot;
            if (!finalSnapshot) {
                finalSnapshot = {
                    id: customer.id,
                    companyName: customer.companyName,
                    email: customer.email,
                    phone: customer.phone,
                    address: customer.address,
                    city: customer.city,
                    country: customer.country,
                    taxId: customer.taxId
                };
            }
            console.log('✅ Customer snapshot prepared');
            // 5️⃣ CALCULATE TOTALS
            console.log('🧮 CALCULATING TOTALS...');
            const totals = this.calculateTotals(items, Number(discount || 0), taxInclusive);
            console.log('✅ Totals calculated:', totals);
            // ⭐⭐⭐ GENERATE INVOICE NUMBER WITH RACE CONDITION PROTECTION
            console.log('🔢 GENERATING INVOICE NUMBER...');
            let invoiceNumber = await this.generateInvoiceNumber(database_1.prisma, req.tenantId, profile.id);
            console.log('✅ Invoice number generated:', invoiceNumber);
            // ✅ RACE CONDITION PROTECTION: Check if invoice number already exists
            const existingInvoice = await database_1.prisma.invoice.findUnique({
                where: { invoiceNumber }
            });
            if (existingInvoice) {
                console.log('⚠️ Invoice number already exists, generating next available...');
                // Get highest number including soft-deleted invoices
                const allInvoices = await database_1.prisma.invoice.findMany({
                    where: { tenantId: req.tenantId },
                    select: { invoiceNumber: true }
                });
                let highestNumber = 0;
                allInvoices.forEach((inv) => {
                    const match = inv.invoiceNumber.match(/(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > highestNumber)
                            highestNumber = num;
                    }
                });
                const nextNumber = highestNumber + 1;
                const paddedNumber = nextNumber.toString().padStart(profile.invoice.padding, '0');
                const currentYear = new Date().getFullYear();
                invoiceNumber = profile.invoice.format
                    .replace('{YYYY}', currentYear.toString())
                    .replace('{YY}', (currentYear % 100).toString().padStart(2, '0'))
                    .replace('{MM}', (new Date().getMonth() + 1).toString().padStart(2, '0'))
                    .replace('{DD}', new Date().getDate().toString().padStart(2, '0'))
                    .replace('{###}', paddedNumber);
                console.log('✅ Regenerated invoice number:', invoiceNumber);
            }
            // 6️⃣ CREATE INVOICE IN DATABASE (WITH TRANSACTION)
            console.log('💾 CREATING INVOICE IN DATABASE (with transaction)...');
            const newInvoice = await database_1.prisma.$transaction(async (tx) => {
                // Prepare invoice data
                const invoiceData = {
                    tenantId: req.tenantId,
                    invoiceNumber,
                    customerId,
                    invoiceDate: new Date(invoiceDate),
                    dueDate: new Date(dueDate),
                    invoiceType: invoiceType.toUpperCase(),
                    status: status.toUpperCase(),
                    currency: currency.toUpperCase(),
                    // Calculated fields
                    subtotal: new client_1.Prisma.Decimal(totals.subtotal),
                    taxTotal: new client_1.Prisma.Decimal(totals.taxTotal),
                    total: new client_1.Prisma.Decimal(totals.total),
                    discount: new client_1.Prisma.Decimal(totals.discount),
                    paidAmount: new client_1.Prisma.Decimal(0),
                    balanceDue: new client_1.Prisma.Decimal(totals.balanceDue),
                    // Optional fields with defaults
                    taxInclusive: Boolean(taxInclusive),
                    settingsProfileId: profile.id,
                    customerSnapshot: finalSnapshot,
                    notes: notes || '',
                    terms: terms || '',
                    description: description || '', // ✅ Added description field
                    // Audit fields
                    createdBy: req.user.id,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    // Soft delete fields (explicitly set to null)
                    deletedAt: null,
                    deletedBy: null
                };
                console.log('📋 Creating invoice with data:', {
                    ...invoiceData,
                    subtotal: invoiceData.subtotal.toString(),
                    total: invoiceData.total.toString()
                });
                // Create invoice
                const createdInvoice = await tx.invoice.create({
                    data: {
                        ...invoiceData,
                        items: {
                            create: items.map((item, index) => ({
                                item: item.item || item.description || `Item ${index + 1}`,
                                description: item.description || '',
                                qty: Number(item.qty || 1),
                                price: new client_1.Prisma.Decimal(Number(item.price || 0)),
                                tax: new client_1.Prisma.Decimal(Number(item.tax || 0)),
                                tenantId: req.tenantId,
                                createdBy: req.user.id,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                                deletedAt: null,
                                deletedBy: null
                            }))
                        }
                    },
                    include: {
                        items: true,
                        customer: true,
                        settingsProfile: true
                    }
                });
                return createdInvoice;
            }, {
                timeout: 10000,
                maxWait: 5000
            });
            console.log('✅ INVOICE CREATED SUCCESSFULLY:', {
                id: newInvoice.id,
                invoiceNumber: newInvoice.invoiceNumber,
                status: newInvoice.status,
                total: newInvoice.total.toString()
            });
            // 7️⃣ GENERATE PDF (outside transaction)
            console.log('📄 GENERATING PDF...');
            try {
                const publicUrl = await (0, pdfService_1.generateAndUploadInvoicePDF)(newInvoice, profile);
                await database_1.prisma.invoice.update({
                    where: { id: newInvoice.id },
                    data: { pdfUrl: publicUrl }
                });
                console.log('✅ PDF generated and uploaded:', publicUrl);
                newInvoice.pdfUrl = publicUrl;
            }
            catch (pdfError) {
                console.error('⚠️ PDF Generation Error (non-critical):', pdfError);
            }
            console.log('🟢 CREATE INVOICE COMPLETE ====================');
            res.status(201).json({
                success: true,
                data: newInvoice,
                message: 'Invoice created successfully'
            });
        }
        catch (error) {
            console.error('🔴 CREATE INVOICE ERROR ====================');
            console.error('Error Type:', error.constructor.name);
            console.error('Error Message:', error.message);
            console.error('Error Stack:', error.stack);
            if (error.code) {
                console.error('Prisma Error Code:', error.code);
                console.error('Prisma Error Meta:', error.meta);
            }
            console.error('🔴 END ERROR ====================');
            const statusCode = error instanceof types_1.ValidationError ? 400 :
                error.code === 'P2003' ? 400 :
                    error.code === 'P2002' ? 409 :
                        500;
            res.status(statusCode).json({
                success: false,
                error: error.message || 'Failed to create invoice',
                code: error.code,
                meta: error.meta
            });
        }
    }
    /** ====================
     *  Update invoice
     * ==================== */
    static async updateInvoice(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                throw new types_1.ValidationError('Tenant context and authentication required');
            }
            const { id } = req.params;
            const { items = [], discount = 0, customerSnapshot, taxInclusive = false, ...updateData } = req.body;
            if (!items.length) {
                throw new types_1.ValidationError('Invoice must have at least one item');
            }
            // 1️⃣ Calculate totals 
            const totals = this.calculateTotals(items, Number(discount || 0), taxInclusive);
            // 2️⃣ Database Update Transaction
            const updatedInvoice = await database_1.prisma.$transaction(async (tx) => {
                const existing = await tx.invoice.findFirst({
                    where: {
                        id,
                        tenantId: req.tenantId,
                        deletedAt: null // ✅ Add this to exclude soft-deleted invoices
                    },
                });
                if (!existing)
                    throw new types_1.NotFoundError('Invoice not found');
                // Delete removed items (soft delete)
                const incomingItemIds = items.filter((i) => i.id).map((i) => i.id);
                await tx.invoiceItem.updateMany({
                    where: {
                        invoiceId: id,
                        id: { notIn: incomingItemIds },
                        tenantId: req.tenantId,
                        deletedAt: null // Only update non-deleted items
                    },
                    data: {
                        deletedAt: new Date(),
                        deletedBy: req.user.id,
                        updatedAt: new Date(),
                        updatedBy: req.user.id
                    }
                });
                // Prepare item operations
                const itemOperations = items.map((item) => {
                    const itemData = {
                        item: item.item || item.description || 'Untitled Item',
                        description: item.description || '',
                        qty: Number(item.qty || 1),
                        price: new client_1.Prisma.Decimal(Number(item.price || 0)),
                        tax: new client_1.Prisma.Decimal(Number(item.tax || 0)),
                        tenantId: req.tenantId,
                        updatedBy: req.user.id,
                        updatedAt: new Date(),
                        deletedAt: null,
                        deletedBy: null
                    };
                    return item.id
                        ? tx.invoiceItem.update({
                            where: { id: item.id },
                            data: itemData
                        })
                        : tx.invoiceItem.create({
                            data: {
                                ...itemData,
                                invoiceId: id,
                                createdBy: req.user.id,
                                createdAt: new Date()
                            }
                        });
                });
                await Promise.all(itemOperations);
                // Update invoice
                return await tx.invoice.update({
                    where: { id },
                    data: {
                        ...updateData,
                        taxInclusive,
                        discount: new client_1.Prisma.Decimal(totals.discount),
                        subtotal: new client_1.Prisma.Decimal(totals.subtotal),
                        taxTotal: new client_1.Prisma.Decimal(totals.taxTotal),
                        total: new client_1.Prisma.Decimal(totals.total),
                        balanceDue: new client_1.Prisma.Decimal(totals.balanceDue),
                        customerSnapshot,
                        updatedBy: req.user.id,
                        updatedAt: new Date()
                    },
                    include: { items: true, customer: true },
                });
            }, { maxWait: 10000, timeout: 30000 });
            // Regenerate PDF
            try {
                console.log(`Regenerating PDF for updated invoice: ${updatedInvoice.invoiceNumber}`);
                const profile = await database_1.prisma.settingsProfile.findFirst({
                    where: {
                        id: updatedInvoice.settingsProfileId,
                        tenantId: req.tenantId
                    },
                    include: {
                        general: true,
                        payment: true
                    }
                });
                const publicUrl = await (0, pdfService_1.generateAndUploadInvoicePDF)(updatedInvoice, profile);
                await database_1.prisma.invoice.update({
                    where: { id: updatedInvoice.id },
                    data: { pdfUrl: publicUrl }
                });
                updatedInvoice.pdfUrl = publicUrl;
                console.log("PDF successfully updated in R2");
            }
            catch (pdfError) {
                console.error('Non-critical error: Failed to update PDF during invoice update:', pdfError);
            }
            res.status(200).json({
                success: true,
                data: updatedInvoice,
                message: 'Invoice updated successfully',
            });
        }
        catch (error) {
            console.error('=== UPDATE INVOICE ERROR ===', error);
            res.status(error instanceof types_1.NotFoundError ? 404 :
                error instanceof types_1.ValidationError ? 400 : 500).json({
                success: false,
                error: error.message || 'Failed to update invoice'
            });
        }
    }
    static async getInvoiceById(req, res) {
        try {
            if (!req.tenantId)
                throw new types_1.ValidationError('Tenant context required');
            const { id } = req.params;
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    tenantId: req.tenantId,
                    deletedAt: null, // ✅ Add this to exclude soft-deleted invoices
                    OR: [
                        { id: id }, // Try searching by UUID
                        { invoiceNumber: id } // Try searching by Display Number
                    ]
                },
                include: {
                    customer: true,
                    items: true,
                    createdByUser: true,
                    updatedByUser: true
                }
            });
            if (!invoice)
                throw new types_1.NotFoundError('Invoice not found');
            console.log("Retrieved invoice discount:", invoice.discount);
            console.log("Invoice totals:", {
                subtotal: invoice.subtotal,
                taxTotal: invoice.taxTotal,
                total: invoice.total,
                balanceDue: invoice.balanceDue,
                discount: invoice.discount
            });
            res.status(200).json({ success: true, data: invoice });
        }
        catch (error) {
            console.error('Get invoice error:', error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to fetch invoice'
            });
        }
    }
    static async deleteInvoice(req, res) {
        try {
            if (!req.tenantId || !req.user)
                throw new types_1.ValidationError('Tenant context required');
            const { id } = req.params;
            const existing = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    deletedAt: null
                }
            });
            if (!existing)
                throw new types_1.NotFoundError('Invoice not found');
            // 1. DELETE FROM R2 (If a PDF URL exists)
            if (existing.pdfUrl) {
                try {
                    await (0, r2Client_1.deleteFileFromR2)(existing.pdfUrl, req.tenantId);
                }
                catch (r2Error) {
                    console.error('Failed to cleanup R2 file during invoice deletion:', r2Error);
                }
            }
            const now = new Date();
            const userId = req.user.id;
            // 2. SOFT DELETE FROM DATABASE - Fixed typing
            await database_1.prisma.$transaction([
                // Soft delete invoice items
                database_1.prisma.invoiceItem.updateMany({
                    where: {
                        invoiceId: id,
                        tenantId: req.tenantId
                    },
                    data: {
                        deletedAt: now,
                        deletedBy: userId,
                        updatedAt: now,
                        updatedBy: userId
                    }
                }),
                // Soft delete invoice
                database_1.prisma.invoice.update({
                    where: {
                        id,
                        tenantId: req.tenantId
                    },
                    data: {
                        deletedAt: now,
                        deletedBy: userId,
                        status: 'CANCELLED',
                        updatedAt: now,
                        updatedBy: userId
                    }
                })
            ]);
            res.status(200).json({
                success: true,
                message: 'Invoice deleted successfully'
            });
        }
        catch (error) {
            console.error('Delete invoice error:', error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to delete invoice'
            });
        }
    }
    /** ====================
     * Send Invoice Email
     * ==================== */
    static async sendEmail(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                throw new types_1.ValidationError('Tenant context and authentication required');
            }
            const { id } = req.params;
            const { to, subject, message } = req.body;
            // 1. Fetch invoice with customer and profile info
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    deletedAt: null
                },
                include: {
                    customer: true,
                    settingsProfile: true
                }
            });
            if (!invoice)
                throw new types_1.NotFoundError('Invoice not found');
            // 2. Determine recipient and customer details
            const snapshot = invoice.customerSnapshot;
            const recipientEmail = to || snapshot?.email || invoice.customer?.email;
            const customerName = snapshot?.companyName || invoice.customer?.companyName || "Valued Customer";
            if (!recipientEmail) {
                throw new types_1.ValidationError("No recipient email address found for this customer.");
            }
            // 3. Import and call the EmailService
            // Note: ensure your emailService is imported at the top of the file
            const emailService = (await Promise.resolve().then(() => __importStar(require('@/utils/emailService')))).default;
            const emailSuccess = await emailService.sendInvoiceEmail({
                to: recipientEmail,
                subject: subject || `Invoice ${invoice.invoiceNumber} from Zithtech`,
                customerName: customerName,
                invoiceNumber: invoice.invoiceNumber,
                amount: `${invoice.currency} ${Number(invoice.total).toLocaleString()}`,
                dueDate: new Date(invoice.dueDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                customMessage: message, // Text from the Drawer
                pdfUrl: invoice.pdfUrl // From your Prisma schema
            });
            if (!emailSuccess) {
                throw new Error("Failed to send email via SMTP provider");
            }
            // 4. Update Database: Status to SENT and capture timestamp
            const updatedInvoice = await database_1.prisma.invoice.update({
                where: { id },
                data: {
                    status: 'SENT',
                    sentAt: invoice.sentAt || new Date(), // Only update if not already sent
                    updatedBy: req.user.id,
                    updatedAt: new Date()
                }
            });
            res.status(200).json({
                success: true,
                message: `Invoice successfully sent to ${recipientEmail}`,
                data: { sentAt: updatedInvoice.sentAt }
            });
        }
        catch (error) {
            console.error('Send invoice email error:', error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to send invoice email'
            });
        }
    }
    // Add this method to your InvoiceController class
    static async updateStatus(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { id } = req.params;
            const { status, payment } = req.body;
            if (!status)
                throw new types_1.ValidationError("Status is required");
            // 1️⃣ Fetch invoice - exclude soft-deleted
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    deletedAt: null // ✅ Add this to exclude soft-deleted invoices
                },
                select: {
                    id: true,
                    status: true,
                    paidAmount: true,
                    balanceDue: true,
                    invoiceNumber: true,
                    settingsProfileId: true,
                    total: true,
                    firstPaymentDate: true,
                    lastPaymentDate: true,
                    fullyPaidDate: true,
                    sentAt: true,
                    paidAt: true,
                    cancelledAt: true
                }
            });
            if (!invoice)
                throw new types_1.NotFoundError('Invoice not found');
            // 2️⃣ Allowed status transitions
            const allowedTransitions = {
                DRAFT: ["PENDING", "APPROVAL", "SENT", "CANCELLED"],
                PENDING: ["APPROVAL", "SENT", "CANCELLED"],
                APPROVAL: ["SENT", "CANCELLED"],
                SENT: ["PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"],
                OVERDUE: ["PAID", "PARTIALLY_PAID", "CANCELLED"],
                PARTIALLY_PAID: ["PAID", "OVERDUE", "CANCELLED"],
                PAID: [],
                CANCELLED: []
            };
            if (!allowedTransitions[invoice.status]?.includes(status)) {
                throw new types_1.ValidationError(`Cannot change status from ${invoice.status} to ${status}`);
            }
            // 3️⃣ Convert Decimals to numbers for calculation
            const currentPaid = invoice.paidAmount instanceof client_1.Prisma.Decimal
                ? invoice.paidAmount.toNumber()
                : Number(invoice.paidAmount);
            const currentBalance = invoice.balanceDue instanceof client_1.Prisma.Decimal
                ? invoice.balanceDue.toNumber()
                : Number(invoice.balanceDue);
            const invoiceTotal = invoice.total instanceof client_1.Prisma.Decimal
                ? invoice.total.toNumber()
                : Number(invoice.total);
            let newPaid = currentPaid;
            let newBalance = currentBalance;
            // 4️⃣ Handle payment info if marking as PAID or PARTIALLY_PAID
            let paymentEntry = null;
            let amountToPay = 0;
            if (status === "PAID" || status === "PARTIALLY_PAID") {
                if (!payment || !payment.amount || !payment.method) {
                    throw new types_1.ValidationError("Payment info (amount & method) is required when marking as PAID or PARTIALLY_PAID");
                }
                amountToPay = Number(payment.amount);
                if (amountToPay <= 0) {
                    throw new types_1.ValidationError("Payment amount must be greater than 0");
                }
                if (amountToPay > currentBalance) {
                    throw new types_1.ValidationError(`Payment amount cannot exceed remaining balance (${currentBalance})`);
                }
                newPaid += amountToPay;
                newBalance = Math.max(0, currentBalance - amountToPay);
                paymentEntry = {
                    tenantId: req.tenantId,
                    invoiceId: invoice.id,
                    amount: new client_1.Prisma.Decimal(amountToPay),
                    paymentMethod: payment.method,
                    description: payment.description || "",
                    paymentDate: payment.date ? new Date(payment.date) : new Date(),
                    status: client_1.PaymentStatus.COMPLETED,
                    createdBy: req.user.id,
                    balanceBefore: new client_1.Prisma.Decimal(currentBalance),
                    balanceAfter: new client_1.Prisma.Decimal(newBalance),
                    referenceId: payment.referenceId || undefined
                };
            }
            // 5️⃣ Prepare invoice update data with date tracking
            const updateData = {
                status,
                updatedBy: req.user.id,
                updatedAt: new Date(),
                paidAmount: new client_1.Prisma.Decimal(newPaid),
                balanceDue: new client_1.Prisma.Decimal(newBalance)
            };
            // Update payment tracking dates
            if (paymentEntry && amountToPay > 0) {
                const now = new Date();
                if (currentPaid === 0 && !invoice.firstPaymentDate) {
                    updateData.firstPaymentDate = now;
                }
                updateData.lastPaymentDate = now;
                if (newBalance === 0 && !invoice.fullyPaidDate) {
                    updateData.fullyPaidDate = now;
                }
            }
            // Set status event dates
            if (status === "PAID" && invoice.status !== "PAID") {
                updateData.paidAt = new Date();
                if (!paymentEntry && !invoice.fullyPaidDate) {
                    updateData.fullyPaidDate = new Date();
                }
            }
            if (status === "SENT" && invoice.status !== "SENT" && !invoice.sentAt) {
                updateData.sentAt = new Date();
            }
            if (status === "CANCELLED" && invoice.status !== "CANCELLED" && !invoice.cancelledAt) {
                updateData.cancelledAt = new Date();
            }
            // 6️⃣ Run transaction to update invoice and create payment if needed
            const updatedInvoice = await database_1.prisma.$transaction(async (tx) => {
                const updated = await tx.invoice.update({
                    where: { id },
                    data: updateData,
                    include: {
                        customer: true,
                        items: {
                            where: { deletedAt: null } // ✅ Only include non-deleted items
                        },
                        payments: true
                    }
                });
                if (paymentEntry) {
                    await tx.invoicePayment.create({ data: paymentEntry });
                }
                return updated;
            });
            res.status(200).json({
                success: true,
                data: updatedInvoice,
                message: 'Invoice status and payments updated successfully'
            });
        }
        catch (error) {
            console.error('Update status error:', error);
            res.status(error instanceof types_1.ValidationError ? 400 :
                error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to update invoice status'
            });
        }
    }
    static async getInvoices(req, res) {
        try {
            if (!req.tenantId)
                throw new types_1.ValidationError('Tenant context required');
            const { page = 1, limit = 20, status, customerId, search } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            const where = {
                tenantId: req.tenantId,
                deletedAt: null // ✅ Add this to exclude soft-deleted invoices
            };
            if (status)
                where.status = status;
            if (customerId)
                where.customerId = customerId;
            if (search) {
                where.OR = [
                    { invoiceNumber: { contains: search, mode: 'insensitive' } },
                    { customer: { companyName: { contains: search, mode: 'insensitive' } } }
                ];
            }
            const [invoices, total] = await Promise.all([
                database_1.prisma.invoice.findMany({
                    where,
                    include: { customer: true },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                database_1.prisma.invoice.count({ where })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: invoices,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: totalPages
                }
            });
        }
        catch (error) {
            console.error('Get invoices error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch invoices'
            });
        }
    }
    static async downloadInvoice(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { id } = req.params;
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    deletedAt: null // ✅ Add this to exclude soft-deleted invoices
                }
            });
            if (!invoice) {
                res.status(404).json({ success: false, error: 'Invoice not found' });
                return;
            }
            let pdfUrl = invoice.pdfUrl;
            // 🔁 Generate PDF if missing
            if (!pdfUrl) {
                const profile = await database_1.prisma.settingsProfile.findFirst({
                    where: {
                        id: invoice.settingsProfileId,
                        tenantId: req.tenantId
                    },
                    include: {
                        general: true,
                        payment: true
                    }
                });
                if (!profile) {
                    throw new Error('Settings profile not found for PDF generation');
                }
                pdfUrl = await (0, pdfService_1.generateAndUploadInvoicePDF)(invoice, profile);
                await database_1.prisma.invoice.update({
                    where: { id: invoice.id },
                    data: { pdfUrl }
                });
            }
            // 🧠 IMPORTANT: Backend fetches the PDF
            const pdfResponse = await fetch(pdfUrl);
            if (!pdfResponse.ok) {
                throw new Error(`Failed to fetch PDF from R2 (${pdfResponse.status})`);
            }
            const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            // ✅ Correct headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length.toString());
            res.send(pdfBuffer);
        }
        catch (error) {
            console.error('DOWNLOAD INVOICE ERROR:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to download invoice'
            });
        }
    }
    static async getPaymentHistory(req, res) {
        try {
            if (!req.tenantId)
                throw new types_1.ValidationError('Tenant context required');
            const { invoiceId } = req.params;
            // 1️⃣ Fetch invoice with customer details - exclude soft-deleted
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    id: invoiceId,
                    tenantId: req.tenantId,
                    deletedAt: null // ✅ Add this to exclude soft-deleted invoices
                },
                select: {
                    id: true,
                    invoiceNumber: true,
                    invoiceDate: true,
                    dueDate: true,
                    total: true,
                    paidAmount: true,
                    balanceDue: true,
                    status: true,
                    firstPaymentDate: true,
                    lastPaymentDate: true,
                    fullyPaidDate: true,
                    sentAt: true,
                    paidAt: true,
                    cancelledAt: true,
                    customer: {
                        select: {
                            companyName: true,
                            email: true,
                            phone: true
                        }
                    },
                    customerSnapshot: true
                }
            });
            if (!invoice) {
                throw new types_1.NotFoundError('Invoice not found');
            }
            // 2️⃣ Fetch all payments with balance tracking
            const payments = await database_1.prisma.invoicePayment.findMany({
                where: {
                    invoiceId,
                    tenantId: req.tenantId
                },
                include: {
                    createdByUser: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { paymentDate: 'asc' }
            });
            // 3️⃣ Calculate running totals for detailed history
            let runningPaid = 0;
            let runningBalance = Number(invoice.total);
            const paymentHistory = payments.map((payment) => {
                const paymentAmount = Number(payment.amount);
                const paymentDate = payment.paymentDate;
                const balanceBeforeValue = payment.balanceBefore ?
                    Number(payment.balanceBefore) : runningBalance;
                let balanceAfterValue;
                if (payment.balanceAfter) {
                    balanceAfterValue = Number(payment.balanceAfter);
                }
                else {
                    if (payment.status === 'COMPLETED') {
                        balanceAfterValue = runningBalance - paymentAmount;
                    }
                    else if (payment.status === 'REFUNDED') {
                        balanceAfterValue = runningBalance + paymentAmount;
                    }
                    else {
                        balanceAfterValue = runningBalance;
                    }
                }
                if (payment.status === 'COMPLETED') {
                    runningPaid += paymentAmount;
                    runningBalance = balanceAfterValue;
                }
                else if (payment.status === 'REFUNDED') {
                    runningPaid = Math.max(0, runningPaid - paymentAmount);
                    runningBalance = balanceAfterValue;
                }
                const dateObj = new Date(paymentDate);
                const timeString = dateObj.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                return {
                    id: payment.id,
                    date: paymentDate.toISOString().split('T')[0],
                    time: timeString,
                    amount: paymentAmount.toFixed(2),
                    paymentMethod: payment.paymentMethod || 'OTHER',
                    status: payment.status,
                    referenceId: payment.referenceId || '',
                    description: payment.description || '',
                    balanceBefore: balanceBeforeValue.toFixed(2),
                    balanceAfter: balanceAfterValue.toFixed(2),
                    totalPaid: runningPaid.toFixed(2),
                    balanceDue: runningBalance.toFixed(2),
                    processedBy: payment.createdByUser?.name || 'System',
                    paymentDate: paymentDate,
                    createdAt: payment.createdAt,
                    updatedAt: payment.updatedAt
                };
            });
            // 4️⃣ Calculate summary statistics
            const completedPayments = payments.filter(p => p.status === 'COMPLETED');
            const refundedPayments = payments.filter(p => p.status === 'REFUNDED');
            const failedPayments = payments.filter(p => p.status === 'FAILED');
            const pendingPayments = payments.filter(p => p.status === 'PENDING');
            const totalPaid = completedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const totalRefunded = refundedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const netPaid = totalPaid - totalRefunded;
            const currentBalance = Math.max(0, Number(invoice.total) - netPaid);
            const summary = {
                invoiceNumber: invoice.invoiceNumber,
                customerName: invoice.customerSnapshot?.companyName || invoice.customer?.companyName,
                invoiceDate: invoice.invoiceDate,
                dueDate: invoice.dueDate,
                totalAmount: Number(invoice.total).toFixed(2),
                totalPaid: totalPaid.toFixed(2),
                totalRefunded: totalRefunded.toFixed(2),
                netPaid: netPaid.toFixed(2),
                balanceDue: currentBalance.toFixed(2),
                invoiceStatus: invoice.status,
                paymentCount: payments.length,
                completedPayments: completedPayments.length,
                refundedPayments: refundedPayments.length,
                failedPayments: failedPayments.length,
                pendingPayments: pendingPayments.length,
                firstPaymentDate: invoice.firstPaymentDate,
                lastPaymentDate: invoice.lastPaymentDate,
                fullyPaidDate: invoice.fullyPaidDate,
                sentAt: invoice.sentAt,
                paidAt: invoice.paidAt,
                cancelledAt: invoice.cancelledAt
            };
            res.status(200).json({
                success: true,
                data: {
                    summary,
                    payments: paymentHistory,
                    rawPayments: payments.map(p => ({
                        id: p.id,
                        amount: p.amount,
                        description: p.description,
                        paymentDate: p.paymentDate,
                        paymentMethod: p.paymentMethod,
                        status: p.status,
                        referenceId: p.referenceId,
                        balanceBefore: p.balanceBefore,
                        balanceAfter: p.balanceAfter,
                        createdByUser: p.createdByUser,
                        createdAt: p.createdAt,
                        updatedAt: p.updatedAt
                    }))
                },
                invoiceNumber: invoice.invoiceNumber
            });
        }
        catch (error) {
            console.error('Get payment history error:', error);
            res.status(error instanceof types_1.ValidationError ? 400 :
                error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to fetch payment history'
            });
        }
    }
    static async checkPDFStatus(req, res) {
        try {
            const { invoiceNumber } = req.params;
            console.log(`🔍 CHECKING PDF STATUS FOR: ${invoiceNumber}`);
            // 1. Find the invoice
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    invoiceNumber,
                    tenantId: req.tenantId
                },
                select: {
                    id: true,
                    invoiceNumber: true,
                    pdfUrl: true,
                    createdAt: true
                }
            });
            if (!invoice) {
                res.status(404).json({ success: false, error: "Invoice not found" });
                return;
            }
            console.log('📋 Invoice found:', {
                number: invoice.invoiceNumber,
                pdfUrl: invoice.pdfUrl,
                created: invoice.createdAt
            });
            // 2. If no PDF URL, it was never generated
            if (!invoice.pdfUrl) {
                res.json({
                    success: true,
                    status: 'NO_PDF_URL',
                    message: 'No PDF URL stored in database'
                });
                return;
            }
            // 3. Test if the PDF URL actually works
            console.log('🔗 Testing PDF URL:', invoice.pdfUrl);
            let pdfExists = false;
            let statusCode = 0;
            let errorMessage = '';
            try {
                const response = await fetch(invoice.pdfUrl, { method: 'HEAD' });
                statusCode = response.status;
                pdfExists = response.ok;
                console.log('✅ PDF URL test result:', {
                    status: response.status,
                    ok: response.ok
                });
            }
            catch (fetchError) {
                errorMessage = fetchError.message;
                console.error('❌ PDF URL test failed:', fetchError.message);
            }
            // 4. Return results
            res.json({
                success: true,
                data: {
                    invoiceNumber: invoice.invoiceNumber,
                    pdfUrl: invoice.pdfUrl,
                    pdfExists,
                    statusCode,
                    errorMessage,
                    // What the URL should be:
                    expectedUrl: `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/b85c1b5b-77a3-4281-9147-51d6bd3ee94d/invoices/Invoice-${invoiceNumber}.pdf`
                }
            });
        }
        catch (error) {
            console.error('Check PDF status error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    /**
     * Restore a soft-deleted invoice
     */
    static async restoreInvoice(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                throw new types_1.ValidationError('Tenant context and authentication required');
            }
            const { id } = req.params;
            // Find the soft-deleted invoice
            const existing = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                    deletedAt: { not: null } // Only find deleted invoices
                }
            });
            if (!existing) {
                throw new types_1.NotFoundError('Deleted invoice not found');
            }
            // Restore invoice and items
            await database_1.prisma.$transaction([
                // Restore invoice items
                database_1.prisma.invoiceItem.updateMany({
                    where: {
                        invoiceId: id,
                        tenantId: req.tenantId
                    },
                    data: {
                        deletedAt: null,
                        deletedBy: null,
                        updatedAt: new Date(),
                        updatedBy: req.user.id
                    }
                }),
                // Restore invoice
                database_1.prisma.invoice.update({
                    where: {
                        id,
                        tenantId: req.tenantId
                    },
                    data: {
                        deletedAt: null,
                        deletedBy: null,
                        status: 'DRAFT', // Reset status to DRAFT
                        updatedAt: new Date(),
                        updatedBy: req.user.id
                    }
                })
            ]);
            // Fetch the restored invoice with items
            const restoredInvoice = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId
                },
                include: {
                    customer: true,
                    items: {
                        where: { deletedAt: null }
                    },
                    settingsProfile: true
                }
            });
            res.status(200).json({
                success: true,
                data: restoredInvoice,
                message: 'Invoice restored successfully'
            });
        }
        catch (error) {
            console.error('Restore invoice error:', error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to restore invoice'
            });
        }
    }
    /**
     * Permanently delete invoice from database (hard delete)
     * Use with caution - this cannot be undone!
     */
    static async permanentDeleteInvoice(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                throw new types_1.ValidationError('Tenant context and authentication required');
            }
            const { id } = req.params;
            // Check if user has admin role (you need to add role check)
            // if (req.user.role !== 'ADMIN') {
            //   throw new ValidationError('Only admins can permanently delete invoices');
            // }
            const existing = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId
                }
            });
            if (!existing) {
                throw new types_1.NotFoundError('Invoice not found');
            }
            // Permanently delete from database
            await database_1.prisma.$transaction([
                database_1.prisma.invoiceItem.deleteMany({
                    where: { invoiceId: id, tenantId: req.tenantId }
                }),
                database_1.prisma.invoicePayment.deleteMany({
                    where: { invoiceId: id, tenantId: req.tenantId }
                }),
                database_1.prisma.invoice.delete({
                    where: { id, tenantId: req.tenantId }
                })
            ]);
            res.status(200).json({
                success: true,
                message: 'Invoice permanently deleted from database'
            });
        }
        catch (error) {
            console.error('Permanent delete invoice error:', error);
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message || 'Failed to permanently delete invoice'
            });
        }
    }
    /**
     * Get all soft-deleted invoices
     */
    static async getDeletedInvoices(req, res) {
        try {
            if (!req.tenantId)
                throw new types_1.ValidationError('Tenant context required');
            const { page = 1, limit = 20 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            const where = {
                tenantId: req.tenantId,
                deletedAt: { not: null } // Only soft-deleted invoices
            };
            const [invoices, total] = await Promise.all([
                database_1.prisma.invoice.findMany({
                    where,
                    include: {
                        customer: true,
                        deletedByUser: {
                            select: { id: true, name: true }
                        }
                    },
                    orderBy: { deletedAt: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                database_1.prisma.invoice.count({ where })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: invoices,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: totalPages
                }
            });
        }
        catch (error) {
            console.error('Get deleted invoices error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to fetch deleted invoices'
            });
        }
    }
}
exports.InvoiceController = InvoiceController;
//# sourceMappingURL=InvoiceController.js.map