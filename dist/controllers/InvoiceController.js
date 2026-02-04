"use strict";
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
    static async generateInvoiceNumber(tx, tenantId, profileId) {
        console.log('🔢 Generating invoice number - Tenant:', tenantId, 'Profile:', profileId);
        // 1. Get the current profile for formatting
        const profile = await tx.settingsProfile.findFirst({
            where: { id: profileId, tenantId },
            include: { invoice: true }
        });
        if (!profile || !profile.invoice) {
            throw new types_1.ValidationError('Invoice settings profile not found');
        }
        const currentProfileSetting = profile.invoice;
        const now = new Date();
        const currentYear = now.getFullYear();
        console.log('📋 Current profile settings:', {
            format: currentProfileSetting.format,
            padding: currentProfileSetting.padding,
            resetYearly: currentProfileSetting.resetYearly
        });
        // 2. Find ALL invoice settings for this tenant
        // CORRECTED: Use 'profiles' (plural) not 'profile'
        const allSettings = await tx.invoiceSetting.findMany({
            where: {
                profiles: {
                    some: {
                        tenantId: tenantId
                    }
                }
            }
        });
        console.log('📊 Found invoice settings:', allSettings.length);
        if (allSettings.length === 0) {
            throw new types_1.ValidationError('No invoice settings found for tenant');
        }
        // 3. Find the ONE we'll use as the master counter
        // Let's use the one with the smallest nextNumber (most conservative)
        const masterSetting = allSettings.reduce((prev, current) => {
            // Use the one with the smallest nextNumber to avoid gaps
            return prev.nextNumber < current.nextNumber ? prev : current;
        });
        console.log('👑 Master counter setting:', {
            id: masterSetting.id,
            nextNumber: masterSetting.nextNumber,
            resetYearly: masterSetting.resetYearly,
            lastResetYear: masterSetting.lastResetYear
        });
        let nextNum = masterSetting.nextNumber;
        // 4. Check if yearly reset is needed (based on master setting)
        if (masterSetting.resetYearly && masterSetting.lastResetYear !== currentYear) {
            console.log(`🔄 Yearly reset: ${masterSetting.lastResetYear} -> ${currentYear}`);
            nextNum = 1;
        }
        console.log('🔢 Next number to use:', nextNum);
        // 5. Format using CURRENT profile's format (not master's format!)
        const paddedNumber = nextNum.toString().padStart(currentProfileSetting.padding, '0');
        const formattedNumber = currentProfileSetting.format
            .replace('{YYYY}', currentYear.toString())
            .replace('{###}', paddedNumber);
        console.log('✨ Formatted invoice number:', formattedNumber);
        // 6. Update ALL settings to have the same next number
        // This keeps all profiles in sync
        await tx.invoiceSetting.updateMany({
            where: {
                id: { in: allSettings.map(s => s.id) }
            },
            data: {
                nextNumber: nextNum + 1,
                lastResetYear: currentYear
            }
        });
        console.log('✅ Updated all settings to nextNumber:', nextNum + 1);
        return formattedNumber;
    }
    /** ====================
     *  Get next invoice number (pre-generate)
     * ==================== */
    static async getNextInvoiceNumber(req, res) {
        try {
            const profile = await database_1.prisma.settingsProfile.findFirst({
                where: { tenantId: req.tenantId, isActive: true },
                include: { invoice: true }
            });
            if (!profile?.invoice)
                throw new types_1.ValidationError('Settings not found');
            const { nextNumber, padding, format } = profile.invoice;
            // Just format the string, DO NOT update the database here
            const padded = nextNumber.toString().padStart(padding, '0');
            const invoiceNumber = format
                .replace('{YYYY}', new Date().getFullYear().toString())
                .replace('{###}', padded);
            res.status(200).json({ success: true, data: { invoiceNumber } });
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
            const { items, discount = 0, customerId, customerSnapshot, settingsProfileId, taxInclusive = false, status = 'DRAFT', currency = 'USD', invoiceDate, dueDate, invoiceType = 'STANDARD', notes = '', terms = '', ...otherData } = req.body;
            console.log('📦 REQUEST BODY:', {
                itemsCount: items?.length,
                discount,
                customerId,
                hasCustomerSnapshot: !!customerSnapshot,
                settingsProfileId,
                taxInclusive,
                status,
                currency,
                invoiceDate,
                dueDate,
                invoiceType,
                notesLength: notes?.length,
                termsLength: terms?.length
            });
            // ⭐⭐ VALIDATE REQUIRED FIELDS ⭐⭐
            console.log('🔍 VALIDATING REQUIRED FIELDS...');
            const missingFields = [];
            if (!items?.length)
                missingFields.push('items');
            if (!customerId)
                missingFields.push('customerId');
            if (!currency)
                missingFields.push('currency');
            if (!invoiceDate)
                missingFields.push('invoiceDate');
            if (!dueDate)
                missingFields.push('dueDate');
            if (missingFields.length > 0) {
                console.error('❌ Missing required fields:', missingFields);
                throw new types_1.ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
            }
            // Validate status
            console.log('🔍 VALIDATING STATUS...');
            const validStatuses = ['DRAFT', 'PENDING', 'APPROVAL', 'SENT', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
            const finalStatus = status.toUpperCase();
            if (!validStatuses.includes(finalStatus)) {
                console.error('❌ Invalid status:', status);
                throw new types_1.ValidationError(`Invalid status: ${status}. Valid options: ${validStatuses.join(', ')}`);
            }
            console.log('✅ Status valid:', finalStatus);
            // Validate invoice type
            console.log('🔍 VALIDATING INVOICE TYPE...');
            const validInvoiceTypes = ['STANDARD', 'PROFORMA', 'CREDIT', 'TAX', 'DEBIT', 'RECURRING'];
            const finalInvoiceType = invoiceType.toUpperCase();
            if (!validInvoiceTypes.includes(finalInvoiceType)) {
                console.error('❌ Invalid invoice type:', invoiceType);
                throw new types_1.ValidationError(`Invalid invoice type: ${invoiceType}. Valid options: ${validInvoiceTypes.join(', ')}`);
            }
            console.log('✅ Invoice type valid:', finalInvoiceType);
            // 1️⃣ CALCULATE TOTALS
            console.log('🧮 CALCULATING TOTALS...');
            const totals = this.calculateTotals(items, Number(discount || 0), taxInclusive);
            console.log('✅ Totals calculated:', totals);
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
                    tenantId: req.tenantId
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
            // 5️⃣ GENERATE INVOICE NUMBER
            console.log('🔢 GENERATING INVOICE NUMBER...');
            const invoiceNumber = await this.generateInvoiceNumber(database_1.prisma, req.tenantId, profile.id);
            console.log('✅ Invoice number generated:', invoiceNumber);
            // 6️⃣ CREATE INVOICE IN DATABASE
            console.log('💾 CREATING INVOICE IN DATABASE...');
            // Prepare invoice data with ALL required fields from schema
            const invoiceData = {
                // Required fields from schema
                tenantId: req.tenantId,
                invoiceNumber,
                customerId,
                invoiceDate: new Date(invoiceDate),
                dueDate: new Date(dueDate),
                invoiceType: finalInvoiceType,
                status: finalStatus,
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
                // Audit fields
                createdBy: req.user.id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            console.log('📋 INVOICE DATA TO CREATE:', {
                ...invoiceData,
                subtotal: invoiceData.subtotal.toString(),
                taxTotal: invoiceData.taxTotal.toString(),
                total: invoiceData.total.toString(),
                discount: invoiceData.discount.toString(),
                balanceDue: invoiceData.balanceDue.toString()
            });
            const newInvoice = await database_1.prisma.invoice.create({
                data: {
                    ...invoiceData,
                    items: {
                        create: items.map((item, index) => {
                            const itemData = {
                                item: item.item || item.description || `Item ${index + 1}`,
                                description: item.description || '',
                                qty: Number(item.qty || 1),
                                price: new client_1.Prisma.Decimal(Number(item.price || 0)),
                                tax: new client_1.Prisma.Decimal(Number(item.tax || 0)),
                                tenantId: req.tenantId,
                                createdBy: req.user.id,
                                createdAt: new Date(),
                                updatedAt: new Date()
                            };
                            console.log(`Item ${index}:`, {
                                ...itemData,
                                price: itemData.price.toString(),
                                tax: itemData.tax.toString()
                            });
                            return itemData;
                        })
                    }
                },
                include: {
                    items: true,
                    customer: true,
                    settingsProfile: true
                }
            });
            console.log('✅ INVOICE CREATED SUCCESSFULLY:', {
                id: newInvoice.id,
                invoiceNumber: newInvoice.invoiceNumber,
                status: newInvoice.status,
                total: newInvoice.total.toString()
            });
            // 7️⃣ GENERATE PDF
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
                // Continue even if PDF fails - invoice is already created
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
            console.error('Full Error Object:', error);
            console.error('🔴 END ERROR ====================');
            const statusCode = error instanceof types_1.ValidationError ? 400 :
                error.code === 'P2003' ? 400 : // Foreign key constraint
                    error.code === 'P2002' ? 409 : // Unique constraint
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
                    where: { id, tenantId: req.tenantId },
                });
                if (!existing)
                    throw new types_1.NotFoundError('Invoice not found');
                // Delete removed items
                const incomingItemIds = items.filter((i) => i.id).map((i) => i.id);
                await tx.invoiceItem.deleteMany({
                    where: {
                        invoiceId: id,
                        id: { notIn: incomingItemIds },
                        tenantId: req.tenantId
                    },
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
                        updatedBy: req.user.id
                    };
                    return item.id
                        ? tx.invoiceItem.update({ where: { id: item.id }, data: itemData })
                        : tx.invoiceItem.create({ data: { ...itemData, invoiceId: id, createdBy: req.user.id } });
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
                    },
                    include: { items: true, customer: true }, // Include customer for the PDF template
                });
            }, { maxWait: 10000, timeout: 30000 });
            // ⭐⭐⭐ NEW: SYNC PDF ON UPDATE ⭐⭐⭐
            // try {
            //   console.log(`Regenerating PDF for updated invoice: ${updatedInvoice.invoiceNumber}`);
            //   // 1. Generate new PDF buffer and upload (overwrites existing file in R2)
            //   const publicUrl = await generateAndUploadInvoicePDF(updatedInvoice);
            //   // 2. Update the database field (even if it's the same URL, ensures it exists)
            //   await prisma.invoice.update({
            //     where: { id: updatedInvoice.id },
            //     data: { pdfUrl: publicUrl }
            //   });
            //   // 3. Update the response object
            //   (updatedInvoice as any).pdfUrl = publicUrl;
            //   console.log("PDF successfully updated in R2");
            // } catch (pdfError) {
            //   console.error('Non-critical error: Failed to update PDF during invoice update:', pdfError);
            // }
            try {
                console.log(`Regenerating PDF for updated invoice: ${updatedInvoice.invoiceNumber}`);
                // 1. Fetch the SettingsProfile with all relations needed for the template
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
                if (!profile) {
                    console.warn(`Settings profile ${updatedInvoice.settingsProfileId} not found. Using default layout.`);
                }
                // 2. Pass BOTH the invoice and the profile to the PDF service
                const publicUrl = await (0, pdfService_1.generateAndUploadInvoicePDF)(updatedInvoice, profile);
                // 3. Update the database field
                await database_1.prisma.invoice.update({
                    where: { id: updatedInvoice.id },
                    data: { pdfUrl: publicUrl }
                });
                // 4. Update the response object so the frontend gets the new URL
                updatedInvoice.pdfUrl = publicUrl;
                console.log("PDF successfully updated in R2");
            }
            catch (pdfError) {
                // We keep this non-critical so the DB update still succeeds even if R2 fails
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
                where: { id, tenantId: req.tenantId }
            });
            if (!existing)
                throw new types_1.NotFoundError('Invoice not found');
            // 1. DELETE FROM R2 (If a PDF URL exists)
            if (existing.pdfUrl) {
                try {
                    await (0, r2Client_1.deleteFileFromR2)(existing.pdfUrl, req.tenantId);
                }
                catch (r2Error) {
                    // We log the error but don't stop the DB deletion 
                    // because the database record is the primary source of truth.
                    console.error('Failed to cleanup R2 file during invoice deletion:', r2Error);
                }
            }
            // 2. DELETE FROM DATABASE
            // Use a transaction to ensure both items and invoice are deleted safely
            await database_1.prisma.$transaction([
                database_1.prisma.invoiceItem.deleteMany({
                    where: { invoiceId: id, tenantId: req.tenantId }
                }),
                database_1.prisma.invoice.delete({
                    where: { id, tenantId: req.tenantId }
                })
            ]);
            res.status(200).json({
                success: true,
                message: 'Invoice and associated files deleted successfully'
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
    static async updateStatus(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { id } = req.params;
            const { status, payment } = req.body;
            // payment = { amount: number, method: PaymentMethod, description?: string, date?: string }
            if (!status)
                throw new types_1.ValidationError("Status is required");
            // 1️⃣ Fetch invoice
            const invoice = await database_1.prisma.invoice.findFirst({
                where: { id, tenantId: req.tenantId },
                select: {
                    id: true,
                    status: true,
                    paidAmount: true,
                    balanceDue: true,
                    invoiceNumber: true,
                    settingsProfileId: true
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
            if (!allowedTransitions[invoice.status].includes(status)) {
                throw new types_1.ValidationError(`Cannot change status from ${invoice.status} to ${status}`);
            }
            // 3️⃣ Convert Decimals to numbers for calculation
            const currentPaid = invoice.paidAmount instanceof client_1.Prisma.Decimal
                ? invoice.paidAmount.toNumber()
                : Number(invoice.paidAmount);
            const currentBalance = invoice.balanceDue instanceof client_1.Prisma.Decimal
                ? invoice.balanceDue.toNumber()
                : Number(invoice.balanceDue);
            let newPaid = currentPaid;
            let newBalance = currentBalance;
            // 4️⃣ Handle payment info if marking as PAID or PARTIALLY_PAID
            let paymentEntry = null;
            if (status === "PAID" || status === "PARTIALLY_PAID") {
                if (!payment || !payment.amount || !payment.method) {
                    throw new types_1.ValidationError("Payment info (amount & method) is required when marking as PAID or PARTIALLY_PAID");
                }
                const amountToPay = Number(payment.amount);
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
                    createdBy: req.user.id
                };
            }
            // 5️⃣ Prepare invoice update data - FIXED: Use correct field names
            const updateData = {
                status,
                updatedBy: req.user.id, // ✅ This is correct - it's a string field in your schema
                updatedAt: new Date(), // ✅ Add explicit timestamp update
                paidAmount: new client_1.Prisma.Decimal(newPaid),
                balanceDue: new client_1.Prisma.Decimal(newBalance)
            };
            if (status === "PAID")
                updateData.paidAt = new Date();
            if (status === "SENT")
                updateData.sentAt = new Date();
            if (status === "CANCELLED")
                updateData.cancelledAt = new Date();
            // 6️⃣ Run transaction to update invoice and create payment if needed
            const updatedInvoice = await database_1.prisma.$transaction(async (tx) => {
                const updated = await tx.invoice.update({
                    where: { id },
                    data: updateData,
                    include: {
                        customer: true,
                        items: true,
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
            const where = { tenantId: req.tenantId };
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
    // Add this method to your InvoiceController class
    static async downloadInvoice(req, res) {
        try {
            if (!req.tenantId) {
                throw new types_1.ValidationError('Tenant context required');
            }
            const { id } = req.params;
            const invoice = await database_1.prisma.invoice.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId
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
            // 1️⃣ Check invoice exists
            const invoice = await database_1.prisma.invoice.findFirst({
                where: { id: invoiceId, tenantId: req.tenantId },
                select: { id: true, invoiceNumber: true }
            });
            if (!invoice) {
                throw new types_1.NotFoundError('Invoice not found');
            }
            // 2️⃣ Fetch payments for this invoice
            const payments = await database_1.prisma.invoicePayment.findMany({
                where: { invoiceId, tenantId: req.tenantId },
                include: {
                    createdByUser: { select: { id: true, name: true } },
                    updatedByUser: { select: { id: true, name: true } }
                },
                orderBy: { paymentDate: 'asc' }
            });
            res.status(200).json({
                success: true,
                data: payments,
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
}
exports.InvoiceController = InvoiceController;
//# sourceMappingURL=InvoiceController.js.map