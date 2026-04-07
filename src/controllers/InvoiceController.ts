
import { Response } from 'express';
import { Prisma,PaymentStatus } from '@prisma/client'; // Add this import
import { prisma } from "@/config/database";
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError 
} from '@/types';
import { generateAndUploadInvoicePDF } from '@/services/pdfService';
import { deleteFileFromR2 } from '@/utils/r2Client';
import { EmailLoggerService } from '@/services/emailLoggerService';

export class InvoiceController {

  /** ====================
   *  Helper: Calculate totals with tax inclusive support
   * ==================== */
  private static calculateTotals(items: any[], discount: number = 0, taxInclusive: boolean = false) {
    let subtotal = 0;
    let taxTotal = 0;
    let lineDiscountTotal = 0;

    const getVal = (obj: any, keys: string[]) => {
      if (!obj) return 0;
      for (const k of keys) {
        const val = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
        if (val !== undefined && val !== null && val !== '') return Number(val);
      }
      return 0;
    };

    items.forEach((item, index) => {
      const qty = Number(item.quantity || item.qty || 0);
      const price = Number(item.rate || item.price || 0);
      
      const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
      const taxRate = Number(item.taxRate || item.tax || taxRateValue || 0);
      
      const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
      const d = Number(discountValue || 0);
      lineDiscountTotal += d;

      const linePrice = qty * price;
      // 💡 Apply line-level discount BEFORE tax if we want consistent subtotal + tax = total
      const discountedBase = Math.max(0, linePrice - d);

      if (taxInclusive && taxRate > 0) {
        const netAmount = discountedBase / (1 + taxRate / 100);
        const lineTax = discountedBase - netAmount;
        subtotal += netAmount;
        taxTotal += lineTax;
      } else {
        const lineTax = discountedBase * (taxRate / 100);
        subtotal += discountedBase;
        taxTotal += lineTax;
      }
    });

    const globalDiscountAmount = Number(discount || 0);
    const totalBeforeGlobalDiscount = subtotal + taxTotal;
    const grandTotal = Math.max(0, totalBeforeGlobalDiscount - globalDiscountAmount);

    const result = {
      subtotal: Number(subtotal.toFixed(2)),
      taxTotal: Number(taxTotal.toFixed(2)),
      discountTotal: Number((globalDiscountAmount + lineDiscountTotal).toFixed(2)),
      totalBeforeDiscount: Number(totalBeforeGlobalDiscount.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      balanceDue: Number(grandTotal.toFixed(2)),
    };

    console.log("Final calculated totals:", result);
    console.log("Breakdown: subtotal + taxTotal =", subtotal + taxTotal, "- globaldiscount", globalDiscountAmount, "= total", grandTotal);

    return result;
  }

  /** ====================
   *  Helper: Generate invoice number
   * ==================== */


private static async generateInvoiceNumber(
  dbClient: any,
  tenantId: string, 
  profileId: string
): Promise<string> {
  console.log('🔢 Generating invoice number - Tenant:', tenantId, 'Profile:', profileId);
  
  try {
    // 1. Get the profile for formatting
    const profile = await dbClient.settingsProfile.findFirst({
      where: { id: profileId, tenantId },
      include: { invoice: true }
    });

    if (!profile || !profile.invoice) {
      throw new ValidationError('Invoice settings profile not found');
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
    allInvoices.forEach((invoice: any) => {
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
      allInvoices.forEach((inv: any) => {
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
      } else {
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

  } catch (error) {
    console.error('❌ Error in generateInvoiceNumber:', error);
    throw error;
  }
}

  /** ====================
   *  Get next invoice number (pre-generate)
   * ==================== */




static async getNextInvoiceNumber(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) {
      throw new ValidationError('Tenant context required');
    }

    const { profileId } = req.query;

    // 1. Get profile for formatting (either specified or active)
    const profile = await prisma.settingsProfile.findFirst({
      where: { 
        id: profileId ? String(profileId) : undefined,
        tenantId: req.tenantId,
        isActive: profileId ? undefined : true 
      },
      include: { invoice: true }
    });

    if (!profile?.invoice) {
      throw new ValidationError('Invoice settings profile not found');
    }

    const settings = profile.invoice;
    const currentYear = new Date().getFullYear();
    
    // 2. Get ALL invoices including soft-deleted for this tenant
    const allInvoices = await prisma.invoice.findMany({
      where: { tenantId: req.tenantId },
      select: { invoiceNumber: true }
    });

    // 3. Calculate next number based on ALL invoices (including deleted)
    let nextNumber: number;
    
    if (settings.resetYearly) {
      // Find highest number in current year (including deleted)
      let highestThisYear = 0;
      allInvoices.forEach((invoice: any) => {
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
    } else {
      // Find highest number ever (including deleted)
      let highestOverall = 0;
      allInvoices.forEach((invoice: any) => {
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
  } catch (error: any) {
    console.error('Get next invoice number error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to get next invoice number' 
    } as ApiResponse);
  }
}

  

  /** ====================
   *  Create Invoice
   * ==================== */





static async createInvoice(req: AuthRequest, res: Response): Promise<void> {
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

    console.log('📦 INCOMING PAYLOAD:', JSON.stringify(req.body, null, 2));

    // Extract all fields from request body
    const { 
      items: legacyItems,
      lineItems: modernItems,
      discount = 0, 
      customerId, 
      customerSnapshot, 
      settingsProfileId,
      taxInclusive = false,
      status = 'DRAFT',
      currency = 'USD',
      invoiceDate,
      dueDate,
      invoiceType = 'STANDARD',
      notes = '',
      terms = '',
      description = '', 
      templateId,
      projectId,
      metadata = {},
      ...otherData 
    } = req.body;

    const items = modernItems || legacyItems;

    // Validate required fields
    if (!items || !items.length) {
      throw new ValidationError('Invoice must have at least one item');
    }

    if (!customerId) {
      throw new ValidationError('Customer ID is required');
    }

    if (!invoiceDate || !dueDate) {
      throw new ValidationError('Invoice date and due date are required');
    }

    // 2️⃣ FETCH SETTINGS PROFILE
    console.log('🔍 FETCHING SETTINGS PROFILE...');
    let profile = await prisma.settingsProfile.findFirst({
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
      throw new ValidationError('No settings profile found');
    }
    
    if (!profile.invoice) {
      console.error('❌ Invoice settings not found in profile');
      throw new ValidationError('No invoice settings found in profile');
    }
    
    console.log('✅ Settings profile found:', profile.id, profile.name);

    // 3️⃣ VALIDATE CUSTOMER
    console.log('🔍 VALIDATING CUSTOMER...');
    const customer = await prisma.customer.findUnique({
      where: { 
        id: customerId,
        tenantId: req.tenantId,
       
      }
    });

    if (!customer) {
      console.error('❌ Customer not found:', customerId);
      throw new ValidationError(`Customer with ID ${customerId} not found`);
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
    let invoiceNumber = await this.generateInvoiceNumber(prisma, req.tenantId, profile.id);
    console.log('✅ Invoice number generated:', invoiceNumber);

    // ✅ RACE CONDITION PROTECTION: Check if invoice number already exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { invoiceNumber }
    });

    if (existingInvoice) {
      console.log('⚠️ Invoice number already exists, generating next available...');
      
      // Get highest number including soft-deleted invoices
      const allInvoices = await prisma.invoice.findMany({
        where: { tenantId: req.tenantId },
        select: { invoiceNumber: true }
      });
      
      let highestNumber = 0;
      allInvoices.forEach((inv: any) => {
        const match = inv.invoiceNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > highestNumber) highestNumber = num;
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
    
    const newInvoice = await prisma.$transaction(async (tx) => {
      // Helper to get value from extraFields
      const getVal = (obj: any, keys: string[]) => {
        if (!obj) return 0;
        for (const k of keys) {
          const val = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
          if (val !== undefined && val !== null && val !== '') return Number(val);
        }
        return 0;
      };

      const { 
        attachments = []
      } = req.body;

      const createdInvoice = await tx.invoice.create({
        data: {
          tenantId: req.tenantId!,
          invoiceNumber,
          customerId,
          invoiceDate: new Date(invoiceDate),
          dueDate: new Date(dueDate),
          invoiceType: invoiceType.toUpperCase() as any,
          status: status.toUpperCase() as any,
          currency: currency.toUpperCase() as any,
          
          // Calculated fields
          subtotal: new Prisma.Decimal(totals.subtotal),
          taxTotal: new Prisma.Decimal(totals.taxTotal),
          grandTotal: new Prisma.Decimal(totals.grandTotal),
          discountTotal: new Prisma.Decimal(totals.discountTotal),
          paidAmount: new Prisma.Decimal(0),
          balanceDue: new Prisma.Decimal(totals.balanceDue),
          
          // Optional fields with defaults
          taxInclusive: Boolean(taxInclusive),
          settingsProfileId: profile.id,
          customerSnapshot: finalSnapshot as any,
          notes: notes || '',
          terms: terms || '',
          description: description || '', // ✅ Added description field
          templateId: templateId || null,
          projectId: projectId || null,
          metadata: metadata || {},
          
          // Audit fields
          createdBy: req.user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          
          // Soft delete fields (explicitly set to null)
          deletedAt: null,
          deletedBy: null,

          // Line Items
          lineItems: {
            create: items.map((item: any, index: number) => {
                const qty = Number(item.quantity || item.qty || 1);
                const rate = Number(item.rate || item.price || 0);
                const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
                const tr = Number(item.taxRate || item.tax || taxRateValue || 0);
                const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
                const d = Number(discountValue || 0);

                const linePrice = qty * rate;
                // Apply line-level discount before tax
                const discountedBase = Math.max(0, linePrice - d);
                
                let lineSubtotal = discountedBase;
                let lineTaxAmount = 0;
                let lineTotal = 0;

                if (taxInclusive) {
                  const netAmount = discountedBase / (1 + tr / 100);
                  lineTaxAmount = discountedBase - netAmount;
                  lineSubtotal = netAmount;
                  lineTotal = discountedBase;
                } else {
                  lineTaxAmount = discountedBase * (tr / 100);
                  lineSubtotal = discountedBase;
                  lineTotal = discountedBase + lineTaxAmount;
                }

                return {
                  tenantId: req.tenantId,
                  itemName: item.itemName || item.item || item.description || `Item ${index + 1}`,
                  description: item.description || '',
                  quantity: new Prisma.Decimal(qty),
                  rate: new Prisma.Decimal(rate),
                  taxRate: new Prisma.Decimal(tr),
                  subtotal: new Prisma.Decimal(lineSubtotal),
                  taxAmount: new Prisma.Decimal(lineTaxAmount),
                  total: new Prisma.Decimal(lineTotal),
                  extraFields: { 
                    ...(item.extraFields || {}),
                    ...(item.projectName ? { projectName: item.projectName } : {})
                  },
                  projectId: item.projectId || null,
                  rowNumber: index + 1,
                  createdBy: req.user.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                  deletedBy: null
                };
            })
          },

          // Aggregated Taxes
          taxes: {
            create: (() => {
              const taxGroups = new Map<string, { rate: number, amount: number }>();
              items.forEach((item: any) => {
                const tr = Number(item.taxRate || item.tax || getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate']) || 0);
                if (tr > 0) {
                  const qty = Number(item.quantity || item.qty || 1);
                  const rate = Number(item.rate || item.price || 0);
                  const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
                  const d = Number(discountValue || 0);
                  const discountedBase = Math.max(0, (qty * rate) - d);
                  
                  let lineTaxAmount = 0;
                  if (taxInclusive) {
                    const netAmount = discountedBase / (1 + tr / 100);
                    lineTaxAmount = discountedBase - netAmount;
                  } else {
                    lineTaxAmount = discountedBase * (tr / 100);
                  }

                  const key = `Tax ${tr}%`;
                  const existing = taxGroups.get(key) || { rate: tr, amount: 0 };
                  existing.amount += lineTaxAmount;
                  taxGroups.set(key, existing);
                }
              });

              return Array.from(taxGroups.entries()).map(([name, data]) => ({
                tenantId: req.tenantId!,
                taxName: name,
                taxRate: new Prisma.Decimal(data.rate),
                taxAmount: new Prisma.Decimal(data.amount),
                createdBy: req.user!.id
              }));
            })(),
          },

          // Attachments
          attachments: {
            create: attachments.map((att: any) => ({
              fileName: att.fileName || 'Attachment',
              fileUrl: att.fileUrl,
              uploadedBy: req.user!.id
            }))
          }
        },
        include: { 
          lineItems: true, 
          customer: true,
          settingsProfile: true,
          taxes: true,
          attachments: true
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
      total: newInvoice.grandTotal.toString()
    });

    // 7️⃣ GENERATE PDF (outside transaction)
    console.log('📄 GENERATING PDF...');
    try {
      const publicUrl = await generateAndUploadInvoicePDF(newInvoice, profile);
      
      // Skip updating invoice.pdfUrl as per user request (deprecated)
      // await prisma.invoice.update({
      //   where: { id: newInvoice.id },
      //   data: { pdfUrl: publicUrl }
      // });
      
      await prisma.invoiceAttachment.create({
        data: {
          invoiceId: newInvoice.id,
          fileName: `Invoice_${newInvoice.invoiceNumber}.pdf`,
          fileUrl: publicUrl,
          uploadedBy: req.user.id
        }
      });
      
      console.log('✅ PDF generated and uploaded:', publicUrl);
      (newInvoice as any).pdfUrl = publicUrl;
    } catch (pdfError) {
      console.error('⚠️ PDF Generation Error (non-critical):', pdfError);
    }

    console.log('🟢 CREATE INVOICE COMPLETE ====================');

    res.status(201).json({ 
      success: true, 
      data: newInvoice, 
      message: 'Invoice created successfully' 
    } as ApiResponse);

  } catch (error: any) {
    console.error('🔴 CREATE INVOICE ERROR ====================');
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    
    if (error.code) {
      console.error('Prisma Error Code:', error.code);
      console.error('Prisma Error Meta:', error.meta);
    }
    
    console.error('🔴 END ERROR ====================');

    const statusCode = 
      error instanceof ValidationError ? 400 :
      error.code === 'P2003' ? 400 :
      error.code === 'P2002' ? 409 :
      500;

    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to create invoice',
      code: error.code,
      meta: error.meta
    } as ApiResponse);
  }
}

  /** ====================
   *  Update invoice
   * ==================== */





  static async updateInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      throw new ValidationError('Tenant context and authentication required');
    }

    const { id } = req.params;
    console.log(`📦 UPDATE PAYLOAD FOR ${id}:`, JSON.stringify(req.body, null, 2));

    const { 
      items: legacyItems,
      lineItems: modernItems,
      discount = 0, 
      customerSnapshot, 
      taxInclusive = false,
      templateId,
      projectId,
      attachments = [],
      metadata = {},
      ...updateData 
    } = req.body;

    const items = modernItems || legacyItems || [];

    if (!items.length) {
      throw new ValidationError('Invoice must have at least one item');
    }

    // 1️⃣ Calculate totals 
    const totals = this.calculateTotals(items, Number(discount || 0), taxInclusive);

    // 2️⃣ Database Update Transaction
    const updatedInvoice = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: { 
            id, 
            tenantId: req.tenantId,
            deletedAt: null // ✅ Add this to exclude soft-deleted invoices
          },
        });
        if (!existing) throw new NotFoundError('Invoice not found');

        // Delete removed items (soft delete)
        const incomingItemIds = items.filter((i: any) => i.id).map((i: any) => i.id);
        await tx.invoiceLineItem.updateMany({
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
        const usedIds = new Set<string>();
        const itemOperations = items.map((item: any, index: number) => {
          const getVal = (obj: any, keys: string[]) => {
            if (!obj) return 0;
            for (const k of keys) {
              const val = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
              if (val !== undefined && val !== null && val !== '') return Number(val);
            }
            return 0;
          };
          const qty = Number(item.quantity || item.qty || 1);
          const rate = Number(item.rate || item.price || 0);
          
          const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
          const tr = Number(item.taxRate || item.tax || taxRateValue || 0);

          const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
          const d = Number(discountValue || 0);

          const linePrice = qty * rate;
          // Apply line-level discount before tax
          const discountedBase = Math.max(0, linePrice - d);
          
          let lineSubtotal = discountedBase;
          let lineTaxAmount = 0;
          let lineTotal = 0;

          if (taxInclusive) {
            const netAmount = discountedBase / (1 + tr / 100);
            lineTaxAmount = discountedBase - netAmount;
            lineSubtotal = netAmount;
            lineTotal = discountedBase;
          } else {
            lineTaxAmount = discountedBase * (tr / 100);
            lineSubtotal = discountedBase;
            lineTotal = discountedBase + lineTaxAmount;
          }

          const itemData = {
            itemName: item.itemName || item.item || item.description || 'Untitled Item',
            description: item.description || '',
            projectId: item.projectId || null,
            quantity: new Prisma.Decimal(qty),
            rate: new Prisma.Decimal(rate),
            taxRate: new Prisma.Decimal(tr),
            extraFields: { 
              ...(item.extraFields || {}),
              ...(item.projectName ? { projectName: item.projectName } : {})
            },
            rowNumber: index + 1,
            subtotal: new Prisma.Decimal(lineSubtotal),
            taxAmount: new Prisma.Decimal(lineTaxAmount),
            total: new Prisma.Decimal(lineTotal),
            tenantId: req.tenantId,
            updatedBy: req.user.id,
            updatedAt: new Date(),
            deletedAt: null,
            deletedBy: null
          };
  
          // Check if ID is present and NOT already used in this transaction
          const isReturningItem = item.id && !usedIds.has(item.id);
          if (item.id) usedIds.add(item.id);

          return isReturningItem 
            ? tx.invoiceLineItem.update({ 
                where: { id: item.id }, 
                data: itemData 
              })
            : tx.invoiceLineItem.create({ 
                data: { 
                  ...itemData, 
                  invoiceId: id, 
                  createdBy: req.user.id,
                  createdAt: new Date()
                } 
              });
        });

        await Promise.all(itemOperations);

        // Update taxes
        await tx.invoiceTax.deleteMany({ where: { invoiceId: id } });
        const taxGroups = new Map<string, { rate: number, amount: number }>();
        
        const getVal = (obj: any, keys: string[]) => {
          if (!obj) return 0;
          for (const k of keys) {
            const val = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
            if (val !== undefined && val !== null && val !== '') return Number(val);
          }
          return 0;
        };

        items.forEach((item: any) => {
          const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
          const tr = Number(item.taxRate || item.tax || taxRateValue || 0);

          if (tr > 0) {
            const qty = Number(item.quantity || item.qty || 1);
            const rate = Number(item.rate || item.price || 0);
            const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
            const d = Number(discountValue || 0);
            const discountedBase = Math.max(0, (qty * rate) - d);
            
            let lineTaxAmount = 0;
            if (taxInclusive) {
              const netAmount = discountedBase / (1 + tr / 100);
              lineTaxAmount = discountedBase - netAmount;
            } else {
              lineTaxAmount = discountedBase * (tr / 100);
            }
            const key = `Tax ${tr}%`;
            const existing = taxGroups.get(key) || { rate: tr, amount: 0 };
            existing.amount += lineTaxAmount;
            taxGroups.set(key, existing);
          }
        });

        await tx.invoiceTax.createMany({
          data: Array.from(taxGroups.entries()).map(([name, data]) => ({
            tenantId: req.tenantId!,
            invoiceId: id,
            taxName: name,
            taxRate: new Prisma.Decimal(data.rate),
            taxAmount: new Prisma.Decimal(data.amount),
            createdBy: req.user!.id
          }))
        });

        // Update attachments
        await tx.invoiceAttachment.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceAttachment.createMany({
          data: attachments.map((att: any) => ({
            invoiceId: id,
            fileName: att.fileName || 'Attachment',
            fileUrl: att.fileUrl,
            uploadedBy: req.user!.id
          }))
        });

        // Update invoice
        return await tx.invoice.update({
          where: { id },
          data: {
            ...updateData,
            templateId: templateId || null,
            projectId: projectId || null,
            taxInclusive,
            discountTotal: new Prisma.Decimal(totals.discountTotal),
            subtotal: new Prisma.Decimal(totals.subtotal),
            taxTotal: new Prisma.Decimal(totals.taxTotal),
            grandTotal: new Prisma.Decimal(totals.grandTotal),
            balanceDue: new Prisma.Decimal(totals.balanceDue),
            metadata: metadata || {},
            customerSnapshot,
            updatedBy: req.user.id,
            updatedAt: new Date()
          },
          include: { 
            lineItems: true, 
            customer: true,
            taxes: true,
            attachments: true
          },
        });
      },
      { maxWait: 10000, timeout: 30000 }
    );

    // Regenerate PDF
    try {
      console.log(`Regenerating PDF for updated invoice: ${updatedInvoice.invoiceNumber}`);
      
      const profile = await prisma.settingsProfile.findFirst({
        where: { 
          id: updatedInvoice.settingsProfileId, 
          tenantId: req.tenantId 
        },
        include: {
          general: true,
          payment: true
        }
      });

      const publicUrl = await generateAndUploadInvoicePDF(updatedInvoice, profile);

      // Skip updating invoice.pdfUrl (deprecated)
      // await prisma.invoice.update({
      //   where: { id: updatedInvoice.id },
      //   data: { pdfUrl: publicUrl }
      // });

      await prisma.invoiceAttachment.create({
        data: {
          invoiceId: updatedInvoice.id,
          fileName: `Invoice_${updatedInvoice.invoiceNumber}.pdf`,
          fileUrl: publicUrl,
          uploadedBy: req.user.id
        }
      });

      (updatedInvoice as any).pdfUrl = publicUrl;
      
      console.log("PDF successfully updated in R2");
    } catch (pdfError) {
      console.error('Non-critical error: Failed to update PDF during invoice update:', pdfError);
    }

    res.status(200).json({
      success: true,
      data: updatedInvoice,
      message: 'Invoice updated successfully',
    } as ApiResponse);

  } catch (error: any) {
    console.error('=== UPDATE INVOICE ERROR ===', error);
    res.status(
      error instanceof NotFoundError ? 404 :
      error instanceof ValidationError ? 400 : 500
    ).json({ 
      success: false, 
      error: error.message || 'Failed to update invoice' 
    } as ApiResponse);
  }
}



  static async getInvoiceById(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) throw new ValidationError('Tenant context required');

    const { id } = req.params;
    const invoice = await prisma.invoice.findFirst({
      where: {
        tenantId: req.tenantId,
        deletedAt: null, // ✅ Add this to exclude soft-deleted invoices
        OR: [
          { id: id },             // Try searching by UUID
          { invoiceNumber: id }   // Try searching by Display Number
        ]
      },
      include: { 
        customer: true, 
        lineItems: true, 
        createdByUser: true, 
        updatedByUser: true,
        taxes: true,
        attachments: true
      }
    });

    if (!invoice) {
        res.status(404).json({ success: false, message: 'Invoice not found' });
        return;
    }

    console.log(`🔍 FETCHED INVOICE ${id}:`, {
      invoiceNumber: invoice.invoiceNumber,
      templateId: invoice.templateId,
      lineItemsCount: invoice.lineItems.length
    });
    
    console.log("Retrieved invoice discount:", invoice.discountTotal);
    console.log("Invoice totals:", {
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.grandTotal,
      balanceDue: invoice.balanceDue,
      discount: invoice.discountTotal
    });
    
    res.status(200).json({ success: true, data: invoice } as ApiResponse);
  } catch (error: any) {
    console.error('Get invoice error:', error);
    res.status(error instanceof NotFoundError ? 404 : 500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch invoice' 
    } as ApiResponse);
  }
}


static async deleteInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

    const { id } = req.params;
    
    const existing = await prisma.invoice.findFirst({ 
      where: { 
        id, 
        tenantId: req.tenantId,
        deletedAt: null
      },
      include: { attachments: true }
    });

    if (!existing) throw new NotFoundError('Invoice not found');

    // 1. DELETE FROM R2 
    // a. Cleanup attachments (including PDFs)
    if (existing.attachments?.length > 0) {
      for (const att of existing.attachments) {
        try {
          await deleteFileFromR2(att.fileUrl, req.tenantId);
        } catch (r2Error) {
          console.error(`Failed to cleanup R2 file ${att.fileUrl} during invoice deletion:`, r2Error);
        }
      }
    }

    // b. Legacy Cleanup (If a PDF URL exists on the invoice record itself)
    if (existing.pdfUrl) {
      try {
        await deleteFileFromR2(existing.pdfUrl, req.tenantId);
      } catch (r2Error) {
        console.error('Failed to cleanup legacy R2 PDF during invoice deletion:', r2Error);
      }
    }

    const now = new Date();
    const userId = req.user.id;

    // 2. SOFT DELETE FROM DATABASE - Fixed typing
    await prisma.$transaction([
      // Soft delete invoice items
      prisma.invoiceLineItem.updateMany({
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
      prisma.invoice.update({
        where: { 
          id, 
          tenantId: req.tenantId 
        },
        data: { 
          deletedAt: now,
          deletedBy: userId,
          updatedAt: now,
          updatedBy: userId
        }
      })
    ]);
    
    res.status(200).json({ 
      success: true, 
      message: 'Invoice deleted successfully' 
    } as ApiResponse);

  } catch (error: any) {
    console.error('Delete invoice error:', error);
    res.status(error instanceof NotFoundError ? 404 : 500).json({ 
      success: false, 
      error: error.message || 'Failed to delete invoice' 
    } as ApiResponse);
  }
}


/** ====================
 * Send Invoice Email
 * ==================== */



static async sendEmail(req: AuthRequest, res: Response): Promise<void> {
  // Declare invoice variable OUTSIDE try block
  let invoice: any = null;
  
  try {
    if (!req.tenantId || !req.user) {
      throw new ValidationError('Tenant context and authentication required');
    }

    const { id } = req.params;
    const { to, subject, message, pdfUrl } = req.body;

    // 1. Fetch invoice
    invoice = await prisma.invoice.findFirst({
      where: { 
        id, 
        tenantId: req.tenantId,
        deletedAt: null 
      },
      include: { 
        customer: true,
        settingsProfile: true,
        attachments: true
      }
    });

    if (!invoice) throw new NotFoundError('Invoice not found');

    // Find PDF in attachments if not provided in body
    const pdfAttachment = invoice.attachments?.find((a: any) => a.fileName.toLowerCase().endsWith('.pdf') || a.fileUrl.toLowerCase().endsWith('.pdf'));
    const finalPdfUrl = pdfUrl || pdfAttachment?.fileUrl || (invoice as any).pdfUrl;

    // 2. Determine recipient and customer details
    const snapshot = invoice.customerSnapshot as any;
    const recipientEmail = to || snapshot?.email || invoice.customer?.email;
    const customerName = snapshot?.companyName || invoice.customer?.companyName || "Valued Customer";

    if (!recipientEmail) {
      throw new ValidationError("No recipient email address found for this customer.");
    }

    // 3. Format amount and due date
    const amount = `${invoice.currency} ${Number(invoice.grandTotal).toLocaleString()}`;
    const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // 4. Send email - GET HTML FROM EMAIL SERVICE
    const emailService = (await import('@/utils/emailService')).default;

    const { success: emailSuccess, html: emailHtml } = await emailService.sendInvoiceEmail({
      to: recipientEmail,
      subject: subject || `Invoice ${invoice.invoiceNumber} from Zithtech`,
      customerName: customerName,
      invoiceNumber: invoice.invoiceNumber,
      amount: amount,
      dueDate: dueDate,
      customMessage: message,
      pdfUrl: finalPdfUrl
    });

    if (!emailSuccess) {
      throw new Error("Failed to send email via SMTP provider");
    }

    // ✅ 5. LOG THE SUCCESSFUL EMAIL - USING HTML FROM EMAIL SERVICE
    await EmailLoggerService.logEmail({
      tenantId: req.tenantId,
      
      // Module information
      module: 'INVOICE',
      moduleId: invoice.id,
      moduleNumber: invoice.invoiceNumber,
      
      // Email content - USE THE HTML RETURNED FROM EMAIL SERVICE
      to: recipientEmail,
      from: process.env.SMTP_FROM_EMAIL || 'noreply@zithtech.com',
      fromName: 'Zithtech',
      subject: subject || `Invoice ${invoice.invoiceNumber} from Zithtech`,
      html: emailHtml, // ✅ EXACT HTML THAT WAS SENT - NO DUPLICATION
      plainText: message || "Please find your invoice details below.",
      
      // Customer information
      customerId: invoice.customerId,
      customerName: customerName,
      customerEmail: recipientEmail,
      
      // Invoice specific fields
      amount: amount,
      dueDate: dueDate,
      currency: invoice.currency,
      
      // Attachment
      hasAttachment: !!(pdfUrl || invoice.pdfUrl),
      attachmentUrl: pdfUrl || invoice.pdfUrl,
      attachmentName: `Invoice_${invoice.invoiceNumber}.pdf`,
      
      // Status
      status: 'SENT',
      
      // User who sent
      sentBy: req.user.id,
      sentByUser: req.user.email || req.user.name,
      
      // Optional metadata
      metadata: {
        invoiceDate: invoice.invoiceDate,
        total: invoice.grandTotal,
        description: invoice.description
      }
    });

    // 6. Update Database
    const updateData: any = {
      // updatedBy: req.user.id,
      updatedAt: new Date(),
      sentAt: invoice.sentAt || new Date(),
      // lastEmailSentAt: new Date()
    };

    const statusesThatCanBeSent = ['DRAFT', 'PENDING', 'APPROVED'];
    if (statusesThatCanBeSent.includes(invoice.status)) {
      updateData.status = 'SENT';
    }

    await prisma.invoice.update({
      where: { id },
      data: updateData
    });

    // 7. Success message
    let successMessage = '';
    if (invoice.status === 'PAID') {
      successMessage = `✅ Invoice ${invoice.invoiceNumber} email resent successfully to ${recipientEmail} (Status: PAID)`;
    } else if (invoice.status === 'PARTIALLY_PAID') {
      successMessage = `✅ Invoice ${invoice.invoiceNumber} email resent successfully to ${recipientEmail} (Status: PARTIALLY PAID)`;
    } else if (invoice.status === 'CANCELLED') {
      successMessage = `✅ Invoice ${invoice.invoiceNumber} email resent successfully to ${recipientEmail} (Status: CANCELLED)`;
    } else {
      successMessage = `✅ Invoice ${invoice.invoiceNumber} sent successfully to ${recipientEmail} (Status: SENT)`;
    }

    res.status(200).json({ 
      success: true, 
      message: successMessage,
      data: { 
        sentAt: new Date(),
        status: updateData.status || invoice.status,
        emailSent: true,
        recipient: recipientEmail,
        invoiceNumber: invoice.invoiceNumber
      }
    });

  } catch (error: any) {
    console.error('Send invoice email error:', error);
    
    // ❌ 8. LOG THE FAILED EMAIL ATTEMPT
    if (req.tenantId && req.user && invoice) {
      try {
        const failedRecipient = req.body.to || invoice.customer?.email || 'unknown';
        const failedSubject = req.body.subject || `Invoice ${invoice.invoiceNumber} from Zithtech`;
        
        // For failed emails, we don't have HTML, so pass empty string
        await EmailLoggerService.logEmail({
          tenantId: req.tenantId,
          module: 'INVOICE',
          moduleId: invoice.id,
          moduleNumber: invoice.invoiceNumber,
          to: failedRecipient,
          from: process.env.SMTP_FROM_EMAIL || 'noreply@zithtech.com',
          fromName: 'Zithtech',
          subject: failedSubject,
          html: '', // No HTML for failed emails
          plainText: req.body.message,
          customerId: invoice.customerId,
          customerName: invoice.customerSnapshot?.companyName || invoice.customer?.companyName || 'Unknown',
          customerEmail: failedRecipient,
          amount: `${invoice.currency} ${Number(invoice.grandTotal).toLocaleString()}`,
          dueDate: new Date(invoice.dueDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          currency: invoice.currency,
          status: 'FAILED',
          errorMessage: error.message,
          sentBy: req.user.id,
          sentByUser: req.user.email || req.user.name
        });
      } catch (logError) {
        console.error('Failed to log email error:', logError);
      }
    }

    res.status(error instanceof NotFoundError ? 404 : 500).json({ 
      success: false, 
      error: error.message || 'Failed to send invoice email' 
    });
  }
}


static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      throw new ValidationError('Tenant context required');
    }

    const { id } = req.params;
    const { status, payment } = req.body; 

    if (!status) throw new ValidationError("Status is required");

    // 1️⃣ Fetch invoice - exclude soft-deleted
    const invoice = await prisma.invoice.findFirst({
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
        grandTotal: true,
        firstPaymentDate: true,
        lastPaymentDate: true,
        fullyPaidDate: true,
        sentAt: true,
        paidAt: true,
        cancelledAt: true
      }
    });

    if (!invoice) throw new NotFoundError('Invoice not found');

    // 2️⃣ Allowed status transitions
    const allowedTransitions: Record<string,string[]> = {
      DRAFT: ["PENDING","APPROVAL","SENT","CANCELLED"],
      PENDING: ["APPROVAL","SENT","CANCELLED"],
      APPROVAL: ["SENT","CANCELLED"],
      SENT: ["PAID","PARTIALLY_PAID","OVERDUE","CANCELLED"],
      OVERDUE: ["PAID","PARTIALLY_PAID","CANCELLED"],
      PARTIALLY_PAID: ["PARTIALLY_PAID","PAID","OVERDUE","CANCELLED"],
      PAID: [],
      CANCELLED: []
    };

    if (!allowedTransitions[invoice.status]?.includes(status)) {
      throw new ValidationError(`Cannot change status from ${invoice.status} to ${status}`);
    }

    // 3️⃣ Convert Decimals to numbers for calculation
    const currentPaid = invoice.paidAmount instanceof Prisma.Decimal
      ? invoice.paidAmount.toNumber()
      : Number(invoice.paidAmount);

    const currentBalance = invoice.balanceDue instanceof Prisma.Decimal
      ? invoice.balanceDue.toNumber()
      : Number(invoice.balanceDue);

    const invoiceTotal = invoice.grandTotal instanceof Prisma.Decimal
      ? invoice.grandTotal.toNumber()
      : Number(invoice.grandTotal);

    let newPaid = currentPaid;
    let newBalance = currentBalance;

    // 4️⃣ Handle payment info if marking as PAID or PARTIALLY_PAID
    let paymentEntry: any = null;
    let amountToPay = 0;
    
    if (status === "PAID" || status === "PARTIALLY_PAID") {
      if (!payment || !payment.amount || !payment.method) {
        throw new ValidationError("Payment info (amount & method) is required when marking as PAID or PARTIALLY_PAID");
      }

      amountToPay = Number(payment.amount);
      if (amountToPay <= 0) {
        throw new ValidationError("Payment amount must be greater than 0");
      }

      if (amountToPay > currentBalance) {
        throw new ValidationError(`Payment amount cannot exceed remaining balance (${currentBalance})`);
      }

      newPaid += amountToPay;
      newBalance = Math.max(0, currentBalance - amountToPay);

      paymentEntry = {
        tenantId: req.tenantId,
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(amountToPay),
        paymentMethod: payment.method,
        description: payment.description || "",
        paymentDate: payment.date ? new Date(payment.date) : new Date(),
        status: PaymentStatus.COMPLETED,
        createdBy: req.user.id,
        balanceBefore: new Prisma.Decimal(currentBalance),
        balanceAfter: new Prisma.Decimal(newBalance),
        referenceId: payment.referenceId || undefined
      };
    }

    // 5️⃣ Prepare invoice update data with date tracking
    const updateData: any = {
      status,
      updatedBy: req.user.id,
      updatedAt: new Date(),
      paidAmount: new Prisma.Decimal(newPaid),
      balanceDue: new Prisma.Decimal(newBalance)
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
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          lineItems: {
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
    } as ApiResponse);

  } catch (error: any) {
    console.error('Update status error:', error);
    res.status(
      error instanceof ValidationError ? 400 :
      error instanceof NotFoundError ? 404 : 500
    ).json({
      success: false,
      error: error.message || 'Failed to update invoice status'
    } as ApiResponse);
  }
}



static async getInvoices(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) throw new ValidationError('Tenant context required');

    const { page = 1, limit = 20, status, customerId, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { 
      tenantId: req.tenantId,
      deletedAt: null // ✅ Add this to exclude soft-deleted invoices
    };
    
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search as string, mode: 'insensitive' } },
        { customer: { companyName: { contains: search as string, mode: 'insensitive' } } }
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.invoice.count({ where })
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
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get invoices error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch invoices' 
    } as ApiResponse);
  }
}





static async downloadInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) {
      throw new ValidationError('Tenant context required');
    }

    const { id } = req.params;

    const invoice = await prisma.invoice.findFirst({
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

    const attachments = await prisma.invoiceAttachment.findMany({
      where: { invoiceId: id }
    });
    
    // Find latest PDF attachment
    const pdfAttachment = attachments.find(a => a.fileName.toLowerCase().endsWith('.pdf') || a.fileUrl.toLowerCase().endsWith('.pdf'));
    let pdfUrl = pdfAttachment?.fileUrl || (invoice as any).pdfUrl;

    // 🔁 Generate PDF if missing
    if (!pdfUrl) {
      const profile = await prisma.settingsProfile.findFirst({
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

      pdfUrl = await generateAndUploadInvoicePDF(invoice as any, profile);

      await prisma.invoiceAttachment.create({
        data: {
          invoiceId: invoice.id,
          fileName: `Invoice_${invoice.invoiceNumber}.pdf`,
          fileUrl: pdfUrl,
          uploadedBy: req.user.id
        }
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
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length.toString());

    res.send(pdfBuffer);

  } catch (error: any) {
    console.error('DOWNLOAD INVOICE ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download invoice'
    });
  }
}








static async getPaymentHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) throw new ValidationError('Tenant context required');

    const { invoiceId } = req.params;

    // 1️⃣ Fetch invoice with customer details - exclude soft-deleted
    const invoice = await prisma.invoice.findFirst({
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
        grandTotal: true,
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
      throw new NotFoundError('Invoice not found');
    }

    // 2️⃣ Fetch all payments with balance tracking
    const payments = await prisma.invoicePayment.findMany({
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
    let runningBalance = Number(invoice.grandTotal);
    
    const paymentHistory = payments.map((payment) => {
      const paymentAmount = Number(payment.amount);
      const paymentDate = payment.paymentDate;
      
      const balanceBeforeValue = payment.balanceBefore ? 
        Number(payment.balanceBefore) : runningBalance;
      
      let balanceAfterValue: number;

      if (payment.balanceAfter) {
        balanceAfterValue = Number(payment.balanceAfter);
      } else {
        if (payment.status === 'COMPLETED') {
          balanceAfterValue = runningBalance - paymentAmount;
        } else if (payment.status === 'REFUNDED') {
          balanceAfterValue = runningBalance + paymentAmount;
        } else {
          balanceAfterValue = runningBalance;
        }
      }

      if (payment.status === 'COMPLETED') {
        runningPaid += paymentAmount;
        runningBalance = balanceAfterValue;
      } else if (payment.status === 'REFUNDED') {
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
    const currentBalance = Math.max(0, Number(invoice.grandTotal) - netPaid);

    const summary = {
      invoiceNumber: invoice.invoiceNumber,
      customerName: (invoice.customerSnapshot as any)?.companyName || invoice.customer?.companyName,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      totalAmount: Number(invoice.grandTotal).toFixed(2),
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
    } as ApiResponse);

  } catch (error: any) {
    console.error('Get payment history error:', error);
    res.status(
      error instanceof ValidationError ? 400 :
      error instanceof NotFoundError ? 404 : 500
    ).json({
      success: false,
      error: error.message || 'Failed to fetch payment history'
    } as ApiResponse);
  }
}






  static async checkPDFStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { invoiceNumber } = req.params;
    
    console.log(`🔍 CHECKING PDF STATUS FOR: ${invoiceNumber}`);
    
    // 1. Find the invoice
    const invoice = await prisma.invoice.findFirst({
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

    // 2. Look for PDF in attachments first
    const attachments = await prisma.invoiceAttachment.findMany({
      where: { invoiceId: invoice.id }
    });
    const pdfAttachment = attachments.find(a => a.fileName.toLowerCase().endsWith('.pdf') || a.fileUrl.toLowerCase().endsWith('.pdf'));
    const finalPdfUrl = pdfAttachment?.fileUrl || (invoice as any).pdfUrl;

    console.log('📋 Invoice found:', {
      number: invoice.invoiceNumber,
      pdfUrl: finalPdfUrl,
      created: invoice.createdAt
    });

    // 2. If no PDF URL, it was never generated
    if (!finalPdfUrl) {
      res.json({ 
        success: true, 
        status: 'NO_PDF_URL',
        message: 'No PDF URL stored in database' 
      });
      return;
    }

    // 3. Test if the PDF URL actually works
    console.log('🔗 Testing PDF URL:', finalPdfUrl);
    
    let pdfExists = false;
    let statusCode = 0;
    let errorMessage = '';
    
    try {
      const response = await fetch(finalPdfUrl, { method: 'HEAD' });
      statusCode = response.status;
      pdfExists = response.ok;
      
      console.log('✅ PDF URL test result:', {
        status: response.status,
        ok: response.ok
      });
    } catch (fetchError: any) {
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

  } catch (error: any) {
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
static async restoreInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      throw new ValidationError('Tenant context and authentication required');
    }

    const { id } = req.params;
    
    // Find the soft-deleted invoice
    const existing = await prisma.invoice.findFirst({ 
      where: { 
        id, 
        tenantId: req.tenantId,
        deletedAt: { not: null } // Only find deleted invoices
      } 
    });

    if (!existing) {
      throw new NotFoundError('Deleted invoice not found');
    }

    // Restore invoice and items
    await prisma.$transaction([
      // Restore invoice items
      prisma.invoiceLineItem.updateMany({
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
      prisma.invoice.update({
        where: { 
          id, 
          tenantId: req.tenantId 
        },
        data: { 
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
          updatedBy: req.user.id
        }
      })
    ]);
    
    // Fetch the restored invoice with items
    const restoredInvoice = await prisma.invoice.findFirst({
      where: {
        id,
        tenantId: req.tenantId
      },
      include: {
        customer: true,
        lineItems: {
          where: { deletedAt: null }
        },
        settingsProfile: true
      }
    });
    
    res.status(200).json({ 
      success: true, 
      data: restoredInvoice,
      message: 'Invoice restored successfully' 
    } as ApiResponse);

  } catch (error: any) {
    console.error('Restore invoice error:', error);
    res.status(error instanceof NotFoundError ? 404 : 500).json({ 
      success: false, 
      error: error.message || 'Failed to restore invoice' 
    } as ApiResponse);
  }
}

/**
 * Permanently delete invoice from database (hard delete)
 * Use with caution - this cannot be undone!
 */
static async permanentDeleteInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      throw new ValidationError('Tenant context and authentication required');
    }

    const { id } = req.params;
    
    // Check if user has admin role (you need to add role check)
    // if (req.user.role !== 'ADMIN') {
    //   throw new ValidationError('Only admins can permanently delete invoices');
    // }
    
    const existing = await prisma.invoice.findFirst({ 
      where: { 
        id, 
        tenantId: req.tenantId 
      } 
    });

    if (!existing) {
      throw new NotFoundError('Invoice not found');
    }

    // Permanently delete from database
    await prisma.$transaction([
      prisma.invoiceLineItem.deleteMany({
        where: { invoiceId: id, tenantId: req.tenantId }
      }),
      prisma.invoicePayment.deleteMany({
        where: { invoiceId: id, tenantId: req.tenantId }
      }),
      prisma.invoiceTax.deleteMany({
        where: { invoiceId: id, tenantId: req.tenantId }
      }),
      prisma.invoiceAttachment.deleteMany({
        where: { invoiceId: id }
      }),
      prisma.invoice.delete({ 
        where: { id, tenantId: req.tenantId } 
      })
    ]);
    
    res.status(200).json({ 
      success: true, 
      message: 'Invoice permanently deleted from database' 
    } as ApiResponse);

  } catch (error: any) {
    console.error('Permanent delete invoice error:', error);
    res.status(error instanceof NotFoundError ? 404 : 500).json({ 
      success: false, 
      error: error.message || 'Failed to permanently delete invoice' 
    } as ApiResponse);
  }
}


/**
 * Get all soft-deleted invoices
 */
static async getDeletedInvoices(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) throw new ValidationError('Tenant context required');

    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { 
      tenantId: req.tenantId,
      deletedAt: { not: null } // Only soft-deleted invoices
    };

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search as string, mode: 'insensitive' } },
        { customer: { companyName: { contains: search as string, mode: 'insensitive' } } }
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
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
      prisma.invoice.count({ where })
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
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get deleted invoices error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch deleted invoices' 
    } as ApiResponse);
  }
}


  /**
   * Bulk restore soft-deleted invoices
   */
  static async bulkRestoreInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('Invoice IDs array is required');
      }

      // Verify invoices exist in trash and belong to tenant
      const invoices = await prisma.invoice.findMany({
        where: {
          id: { in: ids },
          tenantId: req.tenantId,
          deletedAt: { not: null }
        }
      });

      if (invoices.length === 0) {
        throw new NotFoundError('No valid deleted invoices found to restore');
      }

      const invoiceIdsToRestore = invoices.map(i => i.id);

      // Restore invoices and items in transaction
      await prisma.$transaction([
        prisma.invoiceLineItem.updateMany({
          where: { 
            invoiceId: { in: invoiceIdsToRestore }, 
            tenantId: req.tenantId 
          },
          data: { 
            deletedAt: null,
            deletedBy: null,
            updatedAt: new Date(),
            updatedBy: req.user.id
          }
        }),
        prisma.invoice.updateMany({
          where: { 
            id: { in: invoiceIdsToRestore }, 
            tenantId: req.tenantId 
          },
          data: { 
            deletedAt: null,
            deletedBy: null,
            updatedAt: new Date(),
            updatedBy: req.user.id
          }
        })
      ]);

      res.status(200).json({ 
        success: true, 
        data: { restoredCount: invoices.length },
        message: `${invoices.length} invoice(s) restored successfully` 
      } as ApiResponse);

    } catch (error: any) {
      console.error('Bulk restore invoices error:', error);
      res.status(error instanceof NotFoundError ? 404 : 400).json({ 
        success: false, 
        error: error.message || 'Failed to restore invoices' 
      } as ApiResponse);
    }
  }

  /**
   * Bulk permanent delete invoices from database
   */
  static async bulkPermanentDeleteInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('Invoice IDs array is required');
      }

      const invoices = await prisma.invoice.findMany({
        where: {
          id: { in: ids },
          tenantId: req.tenantId,
          deletedAt: { not: null }
        }
      });

      if (invoices.length === 0) {
        throw new NotFoundError('No valid deleted invoices found to permanently delete');
      }

      const invoiceIdsToDelete = invoices.map(i => i.id);

      // Permanently delete from database in transaction
      await prisma.$transaction([
        prisma.invoiceLineItem.deleteMany({
          where: { invoiceId: { in: invoiceIdsToDelete }, tenantId: req.tenantId }
        }),
        prisma.invoicePayment.deleteMany({
          where: { invoiceId: { in: invoiceIdsToDelete }, tenantId: req.tenantId }
        }),
        prisma.invoiceTax.deleteMany({
          where: { invoiceId: { in: invoiceIdsToDelete }, tenantId: req.tenantId }
        }),
        prisma.invoiceAttachment.deleteMany({
          where: { invoiceId: { in: invoiceIdsToDelete } }
        }),
        prisma.invoice.deleteMany({ 
          where: { id: { in: invoiceIdsToDelete }, tenantId: req.tenantId } 
        })
      ]);

      res.status(200).json({ 
        success: true, 
        data: { deletedCount: invoices.length },
        message: `${invoices.length} invoice(s) permanently deleted` 
      } as ApiResponse);

    } catch (error: any) {
      console.error('Bulk permanent delete invoices error:', error);
      res.status(error instanceof NotFoundError ? 404 : 400).json({ 
        success: false, 
        error: error.message || 'Failed to permanently delete invoices' 
      } as ApiResponse);
    }
  }

  /**
   * Bulk soft-delete invoices (Move to Trash)
   */
  static async bulkDeleteInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('Invoice IDs array is required');
      }

      const now = new Date();
      const userId = req.user.id;

      // 1. Fetch invoices to cleanup R2
      const invoices = await prisma.invoice.findMany({
        where: {
          id: { in: ids },
          tenantId: req.tenantId,
          deletedAt: null
        },
        include: { attachments: true }
      });

      if (invoices.length === 0) {
        throw new NotFoundError('No valid invoices found to delete');
      }

      const validIds = invoices.map(i => i.id);

      // 2. Cleanup R2 for all invoices in bulk
      for (const inv of invoices) {
        // Cleanup attachments
        if (inv.attachments?.length > 0) {
          for (const att of inv.attachments) {
            try {
              await deleteFileFromR2(att.fileUrl, req.tenantId);
            } catch (r2Error) {
              console.error(`Failed to cleanup R2 file ${att.fileUrl} during bulk deletion:`, r2Error);
            }
          }
        }
        // Cleanup legacy PDF
        if (inv.pdfUrl) {
          try {
            await deleteFileFromR2(inv.pdfUrl, req.tenantId);
          } catch (r2Error) {
            console.error('Failed to cleanup legacy R2 PDF during bulk deletion:', r2Error);
          }
        }
      }

      // 3. Update database in transaction
      await prisma.$transaction([
        prisma.invoiceLineItem.updateMany({
          where: { 
            invoiceId: { in: validIds }, 
            tenantId: req.tenantId 
          },
          data: {
            deletedAt: now,
            deletedBy: userId,
            updatedAt: now,
            updatedBy: userId
          }
        }),
        prisma.invoice.updateMany({
          where: { 
            id: { in: validIds }, 
            tenantId: req.tenantId 
          },
          data: { 
            deletedAt: now,
            deletedBy: userId,
            updatedAt: now,
            updatedBy: userId
          }
        })
      ]);

      res.status(200).json({ 
        success: true, 
        data: { deletedCount: invoices.length },
        message: `${invoices.length} invoice(s) moved to trash successfully` 
      } as ApiResponse);

    } catch (error: any) {
      console.error('Bulk delete invoices error:', error);
      res.status(error instanceof NotFoundError ? 404 : 400).json({ 
        success: false, 
        error: error.message || 'Failed to move invoices to trash' 
      } as ApiResponse);
    }
  }
}
