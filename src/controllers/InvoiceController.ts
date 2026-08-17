import { Response } from 'express';
import { 
  InvoiceStatus, 
  InvoiceType,
  CreateInvoiceData,
  UpdateInvoiceData,
  getInvoiceById,
  updateInvoiceStatus,
  updateInvoiceStatusAndBalance,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoices,
  getInvoiceStats,
  markInvoiceAsSent,
  getAllInvoices,
  getInvoiceByNumber,
  getDeletedInvoices
} from '../models/invoice.model';
import { emailService, EmailService } from '../utils/emailService';
import { MailService } from '../services/mail/MailService';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '../utils/transactionHistory';
import { 
  PaymentStatus,
  PaymentMethod,
  getInvoicePayments,
  createInvoicePayment
} from '../models/invoicePayment.model';
import { createTransaction } from '../models/transaction.model';
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError 
} from '../types';
import { generateAndUploadInvoicePDF } from '../services/pdfService';
import { deleteFileFromR2 } from '../utils/r2Client';
import { EmailLoggerService } from '../services/emailLoggerService';
import pool from '../config/dbpool';
import { 
  getSettingsProfileById
} from '../models/settingsProfile.model';
import { 
  createMultipleInvoiceLineItems,
  updateInvoiceLineItem,
  deleteInvoiceLineItemsByInvoiceId,
  CreateInvoiceLineItemData,
  UpdateInvoiceLineItemData
} from '../models/invoiceLineItem.model';
import { 
  createMultipleInvoiceTaxes,
  deleteInvoiceTaxesByInvoiceId,
  CreateInvoiceTaxData
} from '../models/invoiceTax.model';
import { 
  createInvoiceAttachment,
  deleteInvoiceAttachmentsByInvoiceId,
  getInvoiceAttachments,
  CreateInvoiceAttachmentData
} from '../models/invoiceAttachment.model';
import { 
  getInvoiceLineItems
} from '../models/invoiceLineItem.model';
import { 
  getInvoiceTaxes
} from '../models/invoiceTax.model';
import { 
  createInvoiceActivityLog 
} from '../models/invoiceActivityLog.model';
import { 
  deleteInvoice as softDeleteInvoice,
  restoreInvoice,
  hardDeleteInvoice
} from '../models/invoice.model';
import { 
  PaymentStatus as InvoicePaymentStatus
} from '../models/invoicePayment.model';

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
      // Apply line-level discount BEFORE tax if we want consistent subtotal + tax = total
      const discountedBase = Math.max(0, linePrice - d);

      if (taxInclusive && taxRate > 0) {
        const netAmount = discountedBase / (1 + taxRate / 100);
        subtotal += netAmount;
        taxTotal += discountedBase - netAmount;
      } else {
        subtotal += discountedBase;
        taxTotal += discountedBase * (taxRate / 100);
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
    tenantId: string, 
    profileId: string
  ): Promise<string> {
    console.log('Generating invoice number - Tenant:', tenantId, 'Profile:', profileId);
    
    try {
      // 1. Get the profile for formatting
      const profile = await getSettingsProfileById(profileId, tenantId);

      if (!profile || !profile.invoice) {
        throw new ValidationError('Invoice settings profile not found');
      }

      const settings = profile.invoice;
      const now = new Date();
      const currentYear = now.getFullYear();
      
      console.log('Profile format:', profile.name, '-', settings.format);

      // Get ALL invoices including soft-deleted ones
      const { invoices: allInvoices } = await getAllInvoices(tenantId, {
        page: 1,
        limit: 10000, // Get all invoices
        status: 'all'
      });

      console.log(`Found ${allInvoices.length} total invoices (including deleted)`);

      // Extract numbers from existing invoices for current year only (for yearly reset)
      let highestNumber = 0;
      allInvoices.forEach((invoice: any) => {
        // Check if invoice belongs to current year
        const yearMatch = invoice.invoiceNumber.match(/(\d{4})/);
        if (yearMatch && parseInt(yearMatch[1]) === currentYear) {
          // Extract the sequence number (last part of the format)
          const numberMatch = invoice.invoiceNumber.match(/(\d+)$/);
          if (numberMatch) {
            const num = parseInt(numberMatch[1], 10);
            if (num > highestNumber) {
              highestNumber = num;
            }
          }
        }
      });

      let nextNumber = highestNumber + 1;
      const paddedNumber = nextNumber.toString().padStart(settings.padding, '0');

      // Format the invoice number and check for duplicates
      let formattedNumber = settings.format
        .replace('{YYYY}', currentYear.toString())
        .replace('{YY}', (currentYear % 100).toString().padStart(2, '0'))
        .replace('{MM}', (now.getMonth() + 1).toString().padStart(2, '0'))
        .replace('{DD}', now.getDate().toString().padStart(2, '0'))
        .replace('{###}', paddedNumber);

      // Check if the generated number already exists and increment if needed
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        const existingInvoice = allInvoices.find((inv: any) => inv.invoiceNumber === formattedNumber);
        
        if (!existingInvoice) {
          console.log(`Generated invoice number: ${formattedNumber}`);
          return formattedNumber;
        }
        
        // If duplicate exists, increment the number and try again
        attempts++;
        nextNumber = highestNumber + attempts;
        const retryPaddedNumber = nextNumber.toString().padStart(settings.padding, '0');
        
        formattedNumber = settings.format
          .replace('{YYYY}', currentYear.toString())
          .replace('{YY}', (currentYear % 100).toString().padStart(2, '0'))
          .replace('{MM}', (now.getMonth() + 1).toString().padStart(2, '0'))
          .replace('{DD}', now.getDate().toString().padStart(2, '0'))
          .replace('{###}', retryPaddedNumber);
          
        console.log(`Duplicate found, retrying with: ${formattedNumber} (attempt ${attempts})`);
      }

      throw new Error('Failed to generate unique invoice number after multiple attempts');

    } catch (error) {
      console.error('Error in generateInvoiceNumber:', error);
      throw error;
    }
  }

  /** ====================
   *  CREATE INVOICE - PostgreSQL Version
   * ==================== */
  static async createInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      console.log('CREATE INVOICE START - PostgreSQL Version');
      
      if (!req.tenantId || !req.user) {
        console.error('Missing tenant context or user');
        res.status(400).json({ 
          success: false, 
          error: 'Tenant context and authentication required' 
        });
        return;
      }

      console.log('Tenant ID:', req.tenantId);
      console.log('User ID:', req.user.id);

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
        attachments = []
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

      // 1. FETCH SETTINGS PROFILE
      console.log('FETCHING SETTINGS PROFILE...');
      const profile = await getSettingsProfileById(
        settingsProfileId || '', 
        req.tenantId
      );

      if (!profile) {
        console.error('Settings profile not found');
        throw new ValidationError('No settings profile found');
      }
      
      if (!profile.invoice) {
        console.error('Invoice settings not found in profile');
        throw new ValidationError('No invoice settings found in profile');
      }
      
      console.log('Settings profile found:', profile.id, profile.name);

      // 2. VALIDATE CUSTOMER (using a simple customer lookup for now)
      console.log('VALIDATING CUSTOMER...');
      // TODO: Implement customer validation with PostgreSQL model
      console.log('Customer validation skipped for now (customer ID:', customerId, ')');

      // 3. BUILD CUSTOMER SNAPSHOT
      console.log('BUILDING CUSTOMER SNAPSHOT...');
      let finalSnapshot = customerSnapshot;
      if (!finalSnapshot) {
        // TODO: Get customer details from PostgreSQL model
        finalSnapshot = {
          id: customerId,
          companyName: 'Customer Name', // TODO: Get from customer model
          email: '',
          phone: '',
          address: {},
          city: '',
          country: '',
          taxId: ''
        };
      }
      console.log('Customer snapshot prepared');

      // 4. CALCULATE TOTALS
      console.log('CALCULATING TOTALS...');
      const totals = this.calculateTotals(items, Number(discount || 0), taxInclusive);
      console.log('Totals calculated:', totals);

      // 5. GENERATE INVOICE NUMBER
      console.log('GENERATING INVOICE NUMBER...');
      let invoiceNumber = await this.generateInvoiceNumber(req.tenantId, profile.id);
      console.log('Invoice number generated:', invoiceNumber);

      // 6. CHECK IF INVOICE NUMBER ALREADY EXISTS
      console.log('CHECKING FOR DUPLICATE INVOICE NUMBER...');
      const existingInvoice = await getInvoiceByNumber(invoiceNumber, req.tenantId);
      
      if (existingInvoice) {
        console.log('Invoice number already exists, regenerating...');
        // Get all invoices to find next available number
        const { invoices: allInvoices } = await getInvoices(req.tenantId, {
          page: 1,
          limit: 10000,
          status: 'all'
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
        
        console.log('Regenerated invoice number:', invoiceNumber);
      }

      // 7. CREATE INVOICE WITH POSTGRESQL
      console.log('CREATING INVOICE WITH POSTGRESQL...');
      
      const invoiceData: CreateInvoiceData = {
        tenantId: req.tenantId!,
        invoiceNumber,
        customerId,
        customerSnapshot: finalSnapshot,
        invoiceDate: new Date(invoiceDate),
        dueDate: new Date(dueDate),
        invoiceType: invoiceType.toUpperCase() as InvoiceType,
        status: status.toUpperCase() as InvoiceStatus,
        currency: currency.toUpperCase(),
        
        // Calculated fields
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        discountTotal: totals.discountTotal,
        paidAmount: 0,
        balanceDue: totals.balanceDue,
        
        // Optional fields with defaults
        taxInclusive: Boolean(taxInclusive),
        settingsProfileId: profile.id,
        notes: notes || '',
        terms: terms || '',
        description: description || '',
        templateId: templateId || null,
        projectId: projectId || null,
        metadata: metadata || {},
        
        createdBy: req.user.id
      };

      const createdInvoice = await createInvoice(invoiceData);
      console.log('Invoice created successfully:', createdInvoice.id);

      // 8. CREATE LINE ITEMS
      console.log('CREATING LINE ITEMS...');
      if (items && items.length > 0) {
        const getVal = (obj: any, keys: string[]) => {
          if (!obj) return 0;
          for (const k of keys) {
            const val = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
            if (val !== undefined && val !== null && val !== '') return Number(val);
          }
          return 0;
        };

        const lineItemsData: CreateInvoiceLineItemData[] = items.map((item: any, index: number) => {
          const qty = Number(item.quantity || item.qty || 1);
          const rate = Number(item.rate || item.price || 0);
          const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
          const tr = Number(item.taxRate || item.tax || taxRateValue || 0);
          const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
          const d = Number(discountValue || 0);

          const linePrice = qty * rate;
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
            tenantId: req.tenantId!,
            invoiceId: createdInvoice.id,
            itemName: item.itemName || item.item || item.description || `Item ${index + 1}`,
            description: item.description || '',
            quantity: qty,
            rate: rate,
            taxRate: tr,
            subtotal: lineSubtotal,
            taxAmount: lineTaxAmount,
            total: lineTotal,
            extraFields: { 
              ...(item.extraFields || {}),
              ...(item.projectName ? { projectName: item.projectName } : {})
            },
            projectId: item.projectId || null,
            rowNumber: index + 1,
            createdBy: req.user.id
          };
        });

        await createMultipleInvoiceLineItems(lineItemsData);
        console.log('Line items created successfully');
      }

      // 9. CREATE TAXES
      console.log('CREATING TAXES...');
      if (items && items.length > 0) {
        const getVal = (obj: any, keys: string[]) => {
          if (!obj) return 0;
          for (const k of keys) {
            const val = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
            if (val !== undefined && val !== null && val !== '') return Number(val);
          }
          return 0;
        };

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

        if (taxGroups.size > 0) {
          const taxesData: CreateInvoiceTaxData[] = Array.from(taxGroups.entries()).map(([name, data]) => ({
            tenantId: req.tenantId!,
            invoiceId: createdInvoice.id,
            taxName: name,
            taxRate: data.rate,
            taxAmount: data.amount,
            createdBy: req.user!.id
          }));

          await createMultipleInvoiceTaxes(taxesData);
          console.log('Taxes created successfully');
        }
      }

      // 10. CREATE ATTACHMENTS
      console.log('CREATING ATTACHMENTS...');
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          const attachmentData: CreateInvoiceAttachmentData = {
            invoiceId: createdInvoice.id,
            fileName: att.fileName || 'Attachment',
            fileUrl: att.fileUrl,
            uploadedBy: req.user!.id
          };
          
          await createInvoiceAttachment(attachmentData);
        }
        console.log('Attachments created successfully');
      }

      // 11. LOG ACTIVITY
      console.log('LOGGING ACTIVITY...');
      await createInvoiceActivityLog({
        invoiceId: createdInvoice.id,
        action: 'CREATED',
        performedBy: req.user.id,
        metadata: {
          invoiceNumber: createdInvoice.invoiceNumber,
          total: createdInvoice.grandTotal,
          itemCount: items.length
        }
      });

      // 12. GENERATE PDF (outside transaction)
      console.log('GENERATING PDF...');
      try {
        // Create a complete invoice object for PDF generation
        const invoiceForPDF = {
          ...createdInvoice,
          lineItems: items,
          customer: finalSnapshot,
          settingsProfile: profile
        };
        
        const publicUrl = await generateAndUploadInvoicePDF(invoiceForPDF, profile);
        
        // Create attachment for PDF
        await createInvoiceAttachment({
          invoiceId: createdInvoice.id,
          fileName: `Invoice_${createdInvoice.invoiceNumber}.pdf`,
          fileUrl: publicUrl,
          uploadedBy: req.user.id
        });
        
        console.log('PDF generated and uploaded:', publicUrl);
        (createdInvoice as any).pdfUrl = publicUrl;
      } catch (pdfError) {
        console.error('PDF Generation Error (non-critical):', pdfError);
      }

      console.log('CREATE INVOICE COMPLETE ====================');

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_LIST,
        action: Action.CREATE,
        actionLabel: `Created invoice ${createdInvoice.invoiceNumber}`,
        entityType: EntityType.INVOICE,
        entityId: createdInvoice.id,
        entityLabel: createdInvoice.invoiceNumber,
        afterData: {
          invoiceNumber: createdInvoice.invoiceNumber,
          status: createdInvoice.status,
          grandTotal: createdInvoice.grandTotal,
          currency: createdInvoice.currency,
        },
      });

      res.status(201).json({ 
        success: true, 
        data: createdInvoice, 
        message: 'Invoice created successfully' 
      } as ApiResponse);

    } catch (error: any) {
      console.error('CREATE INVOICE ERROR ====================');
      console.error('Error Type:', error.constructor.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
      
      console.error('END ERROR ====================');

      const statusCode = 
        error instanceof ValidationError ? 400 :
        error.code === 'P2003' ? 400 :
        error.code === 'P2002' ? 409 :
        500;

      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to create invoice',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      } as ApiResponse);
    }
  }

  /** ====================
   *  UPDATE INVOICE - PostgreSQL Version
   * ==================== */
  static async updateInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      console.log(`UPDATE INVOICE START - ID: ${id}`);
      console.log('REQUEST BODY DETAILS:', JSON.stringify(req.body, null, 2));

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

      // 1. Check if invoice exists
      const existingInvoice = await getInvoiceById(id, req.tenantId);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice not found');
      }

      // 2. Calculate totals 
      const totals = this.calculateTotals(items, Number(discount || 0), taxInclusive);

      // 3. Update line items
      console.log('UPDATING LINE ITEMS...');
      
      // Get existing line items to determine which ones to delete
      const existingLineItems = await getInvoiceLineItems(id, req.tenantId);
      const incomingItemIds = items.filter((i: any) => i.id).map((i: any) => i.id);
      
      console.log('LINE ITEMS UPDATE DEBUG:', {
        existingCount: existingLineItems.length,
        incomingCount: items.length,
        incomingItemIds: incomingItemIds,
        existingIds: existingLineItems.map(item => item.id)
      });
      
      // Soft delete line items that are not in the incoming items
      const itemsToDelete = existingLineItems.filter(item => !incomingItemIds.includes(item.id));
      
      if (itemsToDelete.length > 0) {
        console.log('Deleting line items:', itemsToDelete.length);
        for (const itemToDelete of itemsToDelete) {
          await deleteInvoiceLineItemsByInvoiceId(itemToDelete.id, req.tenantId);
        }
      } else {
        console.log('No line items to delete');
      }

      // Update or create line items
      const getVal = (obj: any, keys: string[]) => {
        if (!obj) return 0;
        for (const k of keys) {
          const val = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()];
          if (val !== undefined && val !== null && val !== '') return Number(val);
        }
        return 0;
      };

      const lineItemsOperations = items.map(async (item: any, index: number) => {
        const qty = Number(item.quantity || item.qty || 1);
        const rate = Number(item.rate || item.price || 0);
        
        const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
        const tr = Number(item.taxRate || item.tax || taxRateValue || 0);

        const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
        const d = Number(discountValue || 0);

        const linePrice = qty * rate;
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

        const itemName = item.itemName || item.item || item.description || 'Untitled Item';
        const lineItemData: UpdateInvoiceLineItemData = {
          itemName,
          description: item.description || '',
          projectId: item.projectId || null,
          quantity: qty,
          rate: rate,
          taxRate: tr,
          extraFields: { 
            ...(item.extraFields || {}),
            ...(item.projectName ? { projectName: item.projectName } : {})
          },
          rowNumber: index + 1,
          subtotal: lineSubtotal,
          taxAmount: lineTaxAmount,
          total: lineTotal,
          updatedBy: req.user.id
        };

        // Update existing item or create new one
        if (item.id) {
          return await updateInvoiceLineItem(item.id, req.tenantId, lineItemData);
        } else {
          // Create new line item
          const createData: CreateInvoiceLineItemData = {
            tenantId: req.tenantId!,
            invoiceId: id,
            itemName,
            description: item.description || '',
            quantity: qty,
            rate: rate,
            taxRate: tr,
            subtotal: lineSubtotal,
            taxAmount: lineTaxAmount,
            total: lineTotal,
            extraFields: { 
              ...(item.extraFields || {}),
              ...(item.projectName ? { projectName: item.projectName } : {})
            },
            rowNumber: index + 1,
            projectId: item.projectId || null,
            createdBy: req.user.id
          };
          // For simplicity, we'll handle new items in a separate step
          return createData;
        }
      });

      // Execute line item operations
      console.log('LINE ITEMS OPERATIONS DEBUG:', {
        totalItems: items.length,
        existingItems: items.filter(item => item.id).length,
        newItems: items.filter(item => !item.id).length
      });

      // Execute updates for existing items
      const existingItems = items.filter(item => item.id);
      const updateResults = await Promise.all(
        existingItems.map(async (item) => {
          const qty = Number(item.quantity || item.qty || 1);
          const rate = Number(item.rate || item.price || 0);
          
          const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
          const tr = Number(item.taxRate || item.tax || taxRateValue || 0);

          const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
          const d = Number(discountValue || 0);

          const linePrice = qty * rate;
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

          const itemName = item.itemName || item.item || item.description || 'Untitled Item';
          const lineItemData: UpdateInvoiceLineItemData = {
            itemName,
            description: item.description || '',
            projectId: item.projectId || null,
            quantity: qty,
            rate: rate,
            taxRate: tr,
            extraFields: { 
              ...(item.extraFields || {}),
              ...(item.projectName ? { projectName: item.projectName } : {})
            },
            rowNumber: items.indexOf(item) + 1,
            subtotal: lineSubtotal,
            taxAmount: lineTaxAmount,
            total: lineTotal,
            updatedBy: req.user.id
          };

          return await updateInvoiceLineItem(item.id, req.tenantId, lineItemData);
        })
      );

      console.log(`Executed ${updateResults.length} line item updates`);

      // Create new items
      const newItems = items.filter(item => !item.id);
      if (newItems.length > 0) {
        console.log(`Creating ${newItems.length} new line items`);
        const newLineItemsData = newItems.map((item, index) => {
          const qty = Number(item.quantity || item.qty || 1);
          const rate = Number(item.rate || item.price || 0);
          
          const taxRateValue = getVal(item.extraFields, ['taxRate', 'tax', 'tax_rate', 'VAT', 'GST']);
          const tr = Number(item.taxRate || item.tax || taxRateValue || 0);

          const discountValue = getVal(item.extraFields, ['discount', 'dis', 'disc']);
          const d = Number(discountValue || 0);

          const linePrice = qty * rate;
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

          const itemName = item.itemName || item.item || item.description || 'Untitled Item';
          
          return {
            tenantId: req.tenantId!,
            invoiceId: id,
            itemName,
            description: item.description || '',
            quantity: qty,
            rate: rate,
            taxRate: tr,
            subtotal: lineSubtotal,
            taxAmount: lineTaxAmount,
            total: lineTotal,
            extraFields: { 
              ...(item.extraFields || {}),
              ...(item.projectName ? { projectName: item.projectName } : {})
            },
            rowNumber: existingItems.length + index + 1,
            projectId: item.projectId || null,
            createdBy: req.user.id
          };
        });
        
        await createMultipleInvoiceLineItems(newLineItemsData);
        console.log('New line items created successfully');
      }

      const newLineItems: CreateInvoiceLineItemData[] = [];
      for (const operation of lineItemsOperations) {
        // Check if this is a new line item (createData object)
        // New items will have invoiceId but no id property
        if (operation && typeof operation === 'object' && 'invoiceId' in operation && !('id' in operation)) {
          newLineItems.push(operation as CreateInvoiceLineItemData);
        }
      }

      // Create new line items if any
      if (newLineItems.length > 0) {
        console.log(`Creating ${newLineItems.length} new line items:`, newLineItems.map(item => ({
          itemName: item.itemName,
          quantity: item.quantity,
          rate: item.rate,
          subtotal: item.subtotal,
          total: item.total,
          invoiceId: item.invoiceId,
          createdBy: item.createdBy
        })));
        const createResult = await createMultipleInvoiceLineItems(newLineItems);
        console.log('New line items creation result:', createResult);
      } else {
        console.log('No new line items to create');
      }

      // 4. Update taxes
      console.log('UPDATING TAXES...');
      await deleteInvoiceTaxesByInvoiceId(id, req.tenantId);
      
      const taxGroups = new Map<string, { rate: number, amount: number }>();
      
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

      if (taxGroups.size > 0) {
        const taxesData: CreateInvoiceTaxData[] = Array.from(taxGroups.entries()).map(([name, data]) => ({
          tenantId: req.tenantId!,
          invoiceId: id,
          taxName: name,
          taxRate: data.rate,
          taxAmount: data.amount,
          createdBy: req.user!.id
        }));

        await createMultipleInvoiceTaxes(taxesData);
      }

      // 5. Update attachments
      console.log('UPDATING ATTACHMENTS...');
      await deleteInvoiceAttachmentsByInvoiceId(id);
      
      if (attachments.length > 0) {
        for (const att of attachments) {
          const attachmentData: CreateInvoiceAttachmentData = {
            invoiceId: id,
            fileName: att.fileName || 'Attachment',
            fileUrl: att.fileUrl,
            uploadedBy: req.user!.id
          };
          
          await createInvoiceAttachment(attachmentData);
        }
      }

      // 6. Update main invoice
      console.log('UPDATING MAIN INVOICE...');
      const invoiceUpdateData: UpdateInvoiceData = {
        ...updateData,
        templateId: templateId || null,
        projectId: projectId || null,
        taxInclusive,
        discountTotal: totals.discountTotal,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        grandTotal: totals.grandTotal,
        balanceDue: totals.balanceDue,
        metadata: metadata || {},
        updatedBy: req.user.id
      };

      // Add customer snapshot if provided
      if (customerSnapshot !== undefined) {
        invoiceUpdateData.customerSnapshot = customerSnapshot;
      }

      console.log('INVOICE UPDATE DATA BEING SAVED:', JSON.stringify(invoiceUpdateData, null, 2));
      const updatedInvoice = await updateInvoice(id, req.tenantId, invoiceUpdateData);

      if (!updatedInvoice) {
        throw new Error('Failed to update invoice');
      }

      // 7. Log activity
      console.log('LOGGING ACTIVITY...');
      await createInvoiceActivityLog({
        invoiceId: id,
        action: 'UPDATED',
        performedBy: req.user.id,
        metadata: {
          itemCount: items.length,
          total: totals.grandTotal,
          updatedFields: Object.keys(updateData)
        }
      });

      // 8. Regenerate PDF
      console.log('REGENERATING PDF...');
      try {
        // Get settings profile for PDF generation
        const profile = await getSettingsProfileById(
          updatedInvoice.settingsProfileId!, 
          req.tenantId
        );

        if (profile) {
          // Create a complete invoice object for PDF generation
          const invoiceForPDF = {
            ...updatedInvoice,
            lineItems: items,
            customer: customerSnapshot || { companyName: 'Customer' },
            settingsProfile: profile
          };
          
          const publicUrl = await generateAndUploadInvoicePDF(invoiceForPDF, profile);

          // Create attachment for PDF
          await createInvoiceAttachment({
            invoiceId: updatedInvoice.id,
            fileName: `Invoice_${updatedInvoice.invoiceNumber}.pdf`,
            fileUrl: publicUrl,
            uploadedBy: req.user.id
          });
          
          console.log('PDF successfully updated:', publicUrl);
          (updatedInvoice as any).pdfUrl = publicUrl;
        }
      } catch (pdfError) {
        console.error('PDF Generation Error (non-critical):', pdfError);
      }

      console.log('UPDATE INVOICE COMPLETE ====');
      console.log('FINAL INVOICE DATA:', {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        invoiceDate: updatedInvoice.invoiceDate,
        dueDate: updatedInvoice.dueDate,
        grandTotal: updatedInvoice.grandTotal
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_LIST,
        action: Action.UPDATE,
        actionLabel: `Updated invoice ${updatedInvoice.invoiceNumber}`,
        entityType: EntityType.INVOICE,
        entityId: updatedInvoice.id,
        entityLabel: updatedInvoice.invoiceNumber,
        afterData: {
          invoiceNumber: updatedInvoice.invoiceNumber,
          status: updatedInvoice.status,
          grandTotal: updatedInvoice.grandTotal,
        },
      });

      res.status(200).json({
        success: true,
        data: updatedInvoice,
        message: 'Invoice updated successfully',
      } as ApiResponse);

    } catch (error: any) {
      console.error('UPDATE INVOICE ERROR ====================');
      console.error('Error Type:', error.constructor.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
      
      console.error('END ERROR ====================');

      const statusCode = 
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500;

      res.status(statusCode).json({ 
        success: false, 
        error: error.message || 'Failed to update invoice',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      } as ApiResponse);
    }
  }

  /** ====================
   *  GET INVOICE BY ID - PostgreSQL Version
   * ==================== */
  static async getInvoiceById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      console.log(`GET INVOICE BY ID - ID: ${id}`);

      // Try to find invoice by ID first, then by invoice number
      let invoice = await getInvoiceById(id, req.tenantId);
      
      if (!invoice) {
        // Try searching by invoice number
        invoice = await getInvoiceByNumber(id, req.tenantId);
      }

      if (!invoice) {
        res.status(404).json({ success: false, message: 'Invoice not found' });
        return;
      }

      console.log(`FETCHED INVOICE ${id}:`, {
        invoiceNumber: invoice.invoiceNumber,
        templateId: invoice.templateId
      });

      // Get related data
      const [lineItems, taxes, attachments, proofsResult] = await Promise.all([
        getInvoiceLineItems(invoice.id, req.tenantId),
        getInvoiceTaxes(invoice.id, req.tenantId),
        getInvoiceAttachments(invoice.id),
        pool.query(
          `SELECT id, file_url as file, file_name as "fileName", amount, payment_date as "paymentDate", reference, note, status, created_at as "createdAt"
           FROM invoice_payment_proofs 
           WHERE tenant_id = $1 AND invoice_id = $2
           ORDER BY created_at DESC`,
          [req.tenantId, invoice.id]
        )
      ]);

      // Debug line items data
      console.log("RETRIEVED LINE ITEMS FOR EDIT:", {
        count: lineItems.length,
        items: lineItems.map(item => ({
          id: item.id,
          itemName: item.itemName,
          quantity: item.quantity,
          rate: item.rate,
          subtotal: item.subtotal,
          total: item.total,
          deletedAt: item.deletedAt
        }))
      });

      // Check if line items have been soft-deleted
      const deletedLineItems = lineItems.filter(item => item.deletedAt !== null);
      if (deletedLineItems.length > 0) {
        console.log("WARNING: Found deleted line items:", deletedLineItems.length);
      }

      // Combine all data
      const invoiceWithDetails = {
        ...invoice,
        lineItems,
        taxes,
        attachments,
        paymentProofs: proofsResult.rows,
        // TODO: Add customer data when customer model is available
        customer: invoice.customerSnapshot || null
      };

      console.log("Retrieved invoice totals:", {
        subtotal: invoice.subtotal,
        taxTotal: invoice.taxTotal,
        total: invoice.grandTotal,
        balanceDue: invoice.balanceDue,
        discount: invoice.discountTotal,
        lineItemsCount: lineItems.length,
        taxesCount: taxes.length,
        attachmentsCount: attachments.length
      });
      
      res.status(200).json({ success: true, data: invoiceWithDetails } as ApiResponse);
    } catch (error: any) {
      console.error('Get invoice error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to fetch invoice' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  GET INVOICES - PostgreSQL Version
   * ==================== */
  static async getInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { 
        page = 1, 
        limit = 20, 
        status, 
        customerId, 
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      console.log(`GET INVOICES - Page: ${page}, Limit: ${limit}`);

      // Handle status parameter properly
      let statusFilter: 'all' | InvoiceStatus = 'all';
      if (status && status !== 'all') {
        statusFilter = status as InvoiceStatus;
      }

      const options = {
        page: Number(page),
        limit: Number(limit),
        status: statusFilter,
        customerId: customerId as string,
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      const { invoices, total } = await getInvoices(req.tenantId, options);

      if (invoices.length > 0) {
        const invoiceIds = invoices.map(i => i.id);
        const proofsResult = await pool.query(
          `SELECT invoice_id, id, file_url as file, file_name as "fileName", amount, payment_date as "paymentDate", reference, note, status, created_at as "createdAt"
           FROM invoice_payment_proofs 
           WHERE tenant_id = $1 AND invoice_id = ANY($2::text[])`,
          [req.tenantId, invoiceIds]
        );
        
        const proofsByInvoice = new Map();
        for (const row of proofsResult.rows) {
          if (!proofsByInvoice.has(row.invoice_id)) {
            proofsByInvoice.set(row.invoice_id, []);
          }
          const { invoice_id, ...proof } = row;
          proofsByInvoice.get(invoice_id).push(proof);
        }
        
        for (const invoice of invoices) {
          (invoice as any).paymentProofs = proofsByInvoice.get(invoice.id) || [];
        }
      }

      const totalPages = Math.ceil(total / Number(limit));

      console.log(`Retrieved ${invoices.length} invoices out of ${total} total`);

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

  /** ====================
   *  DELETE INVOICE (Soft Delete) - PostgreSQL Version
   * ==================== */
  static async deleteInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      console.log(`DELETE INVOICE - ID: ${id}`);

      // Check if invoice exists and is not already deleted
      const existingInvoice = await getInvoiceById(id, req.tenantId);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice not found');
      }

      // Soft delete the invoice
      const deleted = await softDeleteInvoice(id, req.tenantId, req.user.id);
      
      if (!deleted) {
        throw new Error('Failed to delete invoice');
      }

      // Log activity
      await createInvoiceActivityLog({
        invoiceId: id,
        action: 'DELETED',
        performedBy: req.user.id,
        metadata: {
          invoiceNumber: existingInvoice.invoiceNumber,
          total: existingInvoice.grandTotal
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_LIST,
        action: Action.DELETE,
        actionLabel: `Moved invoice ${existingInvoice.invoiceNumber} to trash`,
        entityType: EntityType.INVOICE,
        entityId: id,
        entityLabel: existingInvoice.invoiceNumber,
        beforeData: {
          invoiceNumber: existingInvoice.invoiceNumber,
          status: existingInvoice.status,
          grandTotal: existingInvoice.grandTotal,
        },
      });

      console.log(`Invoice ${id} soft deleted successfully`);

      res.status(200).json({
        success: true,
        message: 'Invoice moved to trash successfully',
      } as ApiResponse);

    } catch (error: any) {
      console.error('Delete invoice error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to delete invoice' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  RESTORE INVOICE - PostgreSQL Version
   * ==================== */
  static async restoreInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      console.log(`RESTORE INVOICE - ID: ${id}`);

      // Fetch invoice details for the log label BEFORE restoring
      const invoiceToRestore = await getInvoiceById(id, req.tenantId).catch(() => null);

      // Restore the invoice
      const restored = await restoreInvoice(id, req.tenantId, req.user.id);
      
      if (!restored) {
        throw new NotFoundError('Deleted invoice not found');
      }

      // Log activity
      await createInvoiceActivityLog({
        invoiceId: id,
        action: 'RESTORED',
        performedBy: req.user.id,
        metadata: {
          restoredAt: new Date()
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_LIST,
        action: Action.RESTORE,
        actionLabel: `Restored invoice ${invoiceToRestore?.invoiceNumber ?? id}`,
        entityType: EntityType.INVOICE,
        entityId: id,
        entityLabel: invoiceToRestore?.invoiceNumber ?? id,
      });

      console.log(`Invoice ${id} restored successfully`);

      res.status(200).json({
        success: true,
        message: 'Invoice restored successfully',
      } as ApiResponse);

    } catch (error: any) {
      console.error('Restore invoice error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to restore invoice' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  HARD DELETE INVOICE (Permanent) - PostgreSQL Version
   * ==================== */
  static async permanentDeleteInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      console.log(`PERMANENT DELETE INVOICE - ID: ${id}`);

      // Check if invoice exists (including deleted ones) with retry logic
      let existingInvoice = null;
      let foundInDeleted = null;
      
      try {
        existingInvoice = await getInvoiceById(id, req.tenantId);
      } catch (error: any) {
        console.log('Error getting invoice by ID, trying deleted invoices:', error.message);
        if (error.code === 'ETIMEDOUT') {
          // Retry once for timeout
          try {
            existingInvoice = await getInvoiceById(id, req.tenantId);
          } catch (retryError: any) {
            console.log('Retry also failed, proceeding to check deleted invoices');
          }
        }
      }
      
      if (!existingInvoice) {
        // Try to find in deleted invoices as well
        const deletedInvoicesResponse = await getDeletedInvoices(req.tenantId);
        foundInDeleted = deletedInvoicesResponse.invoices.find(inv => inv.id === id || inv.invoiceNumber === id);
        
        if (!foundInDeleted) {
          throw new NotFoundError('Invoice not found');
        }
        console.log('Found invoice in deleted invoices, proceeding with permanent delete');
      }

      // Hard delete the invoice (cascade deletion)
      const deleted = await hardDeleteInvoice(id, req.tenantId);
      
      if (!deleted) {
        throw new Error('Failed to permanently delete invoice');
      }

      // Log activity (before deletion)
      const invoiceForLog = existingInvoice || foundInDeleted;
      await createInvoiceActivityLog({
        invoiceId: id,
        action: 'PERMANENTLY_DELETED',
        performedBy: req.user.id,
        metadata: {
          invoiceNumber: invoiceForLog?.invoiceNumber || 'Unknown',
          total: invoiceForLog?.grandTotal || 0
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_LIST,
        action: Action.PERMANENT_DELETE,
        actionLabel: `Permanently deleted invoice ${invoiceForLog?.invoiceNumber || id}`,
        entityType: EntityType.INVOICE,
        entityId: id,
        entityLabel: invoiceForLog?.invoiceNumber || id,
        beforeData: {
          invoiceNumber: invoiceForLog?.invoiceNumber,
          status: invoiceForLog?.status,
          grandTotal: invoiceForLog?.grandTotal,
        },
      });

      console.log(`Invoice ${id} permanently deleted successfully`);

      res.status(200).json({
        success: true,
        message: 'Invoice permanently deleted successfully',
      } as ApiResponse);

    } catch (error: any) {
      console.error('Permanent delete invoice error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to permanently delete invoice' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  GET DELETED INVOICES - PostgreSQL Version
   * ==================== */
  static async getDeletedInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { 
        page = 1, 
        limit = 20, 
        search,
        status,
        startDate,
        endDate,
        sortBy = 'deletedAt',
        sortOrder = 'desc'
      } = req.query;

      console.log(`GET DELETED INVOICES - Page: ${page}, Limit: ${limit}`);

      const options = {
        page: Number(page),
        limit: Number(limit),
        status: (status as string) || 'all',
        customerId: undefined,
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      };

      const { invoices: deletedInvoices, total } = await getDeletedInvoices(req.tenantId, options);

      const totalPages = Math.ceil(total / Number(limit));

      console.log(`Retrieved ${deletedInvoices.length} deleted invoices out of ${total} total`);

      res.status(200).json({ 
        success: true, 
        data: deletedInvoices, 
        pagination: { 
          page: Number(page), 
          limit: Number(limit), 
          total: total, 
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

  /** ====================
   *  BULK RESTORE INVOICES - PostgreSQL Version
   * ==================== */
  static async bulkRestoreInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { invoiceIds, ids } = req.body;
      const invoiceIdsToRestore = invoiceIds || ids;
      console.log(`BULK RESTORE INVOICES - Count: ${invoiceIdsToRestore?.length || 0}`);

      if (!invoiceIdsToRestore || !Array.isArray(invoiceIdsToRestore) || invoiceIdsToRestore.length === 0) {
        throw new ValidationError('Invoice IDs array is required');
      }

      let restoredCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const id of invoiceIdsToRestore) {
        try {
          const restored = await restoreInvoice(id, req.tenantId, req.user.id);
          if (restored) {
            restoredCount++;
          } else {
            failedCount++;
            errors.push(`Invoice ${id} not found or not deleted`);
          }
        } catch (error) {
          failedCount++;
          errors.push(`Invoice ${id}: ${error.message}`);
        }
      }

      // Log bulk activity
      await createInvoiceActivityLog({
        invoiceId: 'bulk-operation',
        action: 'BULK_RESTORED',
        performedBy: req.user.id,
        metadata: {
          restoredCount,
          failedCount,
          invoiceIds,
          errors
        }
      });

      console.log(`Bulk restore completed: ${restoredCount} restored, ${failedCount} failed`);

      res.status(200).json({
        success: true,
        message: `Restored ${restoredCount} invoices successfully`,
        data: {
          restoredCount,
          failedCount,
          errors
        }
      } as ApiResponse);

    } catch (error: any) {
      console.error('Bulk restore invoices error:', error);
      res.status(
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to restore invoices' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  BULK HARD DELETE INVOICES - PostgreSQL Version
   * ==================== */
  static async bulkPermanentDeleteInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { invoiceIds, ids } = req.body;
      const invoiceIdsToDelete = invoiceIds || ids;
      console.log(`BULK PERMANENT DELETE INVOICES - Count: ${invoiceIdsToDelete?.length || 0}`);

      if (!invoiceIdsToDelete || !Array.isArray(invoiceIdsToDelete) || invoiceIdsToDelete.length === 0) {
        throw new ValidationError('Invoice IDs array is required');
      }

      let deletedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const id of invoiceIdsToDelete) {
        try {
          const deleted = await hardDeleteInvoice(id, req.tenantId);
          if (deleted) {
            deletedCount++;
          } else {
            failedCount++;
            errors.push(`Invoice ${id} not found`);
          }
        } catch (error) {
          failedCount++;
          errors.push(`Invoice ${id}: ${error.message}`);
        }
      }

      // Log bulk activity
      await createInvoiceActivityLog({
        invoiceId: 'bulk-operation',
        action: 'BULK_PERMANENTLY_DELETED',
        performedBy: req.user.id,
        metadata: {
          deletedCount,
          failedCount,
          invoiceIds,
          errors
        }
      });

      console.log(`Bulk permanent delete completed: ${deletedCount} deleted, ${failedCount} failed`);

      res.status(200).json({
        success: true,
        message: `Permanently deleted ${deletedCount} invoices successfully`,
        data: {
          deletedCount,
          failedCount,
          errors
        }
      } as ApiResponse);

    } catch (error: any) {
      console.error('Bulk permanent delete invoices error:', error);
      res.status(
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to permanently delete invoices' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  BULK DELETE INVOICES (Soft Delete) - PostgreSQL Version
   * ==================== */
  static async bulkDeleteInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { invoiceIds, ids } = req.body;
      const invoiceIdsToDelete = invoiceIds || ids;
      console.log(`BULK DELETE INVOICES - Count: ${invoiceIdsToDelete?.length || 0}`);
      console.log('Bulk delete request body:', req.body);

      if (!invoiceIdsToDelete || !Array.isArray(invoiceIdsToDelete)) {
        throw new ValidationError('Invoice IDs array is required');
      }

      if (invoiceIdsToDelete.length === 0) {
        console.log('No invoice IDs provided for bulk delete');
        res.status(200).json({
          success: true,
          message: 'No invoices selected for deletion',
          data: {
            deletedCount: 0,
            failedCount: 0,
            errors: []
          }
        } as ApiResponse);
        return;
      }

      let deletedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const id of invoiceIdsToDelete) {
        try {
          const deleted = await softDeleteInvoice(id, req.tenantId, req.user.id);
          if (deleted) {
            deletedCount++;
          } else {
            failedCount++;
            errors.push(`Invoice ${id} not found`);
          }
        } catch (error) {
          failedCount++;
          errors.push(`Invoice ${id}: ${error.message}`);
        }
      }

      // Log bulk activity
      await createInvoiceActivityLog({
        invoiceId: 'bulk-operation',
        action: 'BULK_DELETED',
        performedBy: req.user.id,
        metadata: {
          deletedCount,
          failedCount,
          invoiceIds,
          errors
        }
      });

      console.log(`Bulk delete completed: ${deletedCount} deleted, ${failedCount} failed`);

      res.status(200).json({
        success: true,
        message: `Moved ${deletedCount} invoices to trash successfully`,
        data: {
          deletedCount,
          failedCount,
          errors
        }
      } as ApiResponse);

    } catch (error: any) {
      console.error('Bulk delete invoices error:', error);
      res.status(
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to delete invoices' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  SEND EMAIL - PostgreSQL Version
   * ==================== */
  static async sendEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and authentication required');
      }

      const { id } = req.params;
      const { to, subject, message, pdfUrl } = req.body;
      console.log(`SEND EMAIL - Invoice ID: ${id}`);

      // Get invoice with complete data
      const invoice = await getInvoiceById(id, req.tenantId);
      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }

      // Get attachments to find PDF
      const attachments = await getInvoiceAttachments(invoice.id);
      const pdfAttachment = attachments.find(a => a.fileName.toLowerCase().endsWith('.pdf') || a.fileUrl.toLowerCase().endsWith('.pdf'));
      let finalPdfUrl = pdfUrl || pdfAttachment?.fileUrl || (invoice as any).pdfUrl;

      // Validate PDF exists
      let isPdfValid = false;
      if (finalPdfUrl) {
        try {
          const checkRes = await fetch(finalPdfUrl, { method: 'HEAD' });
          if (checkRes.ok) isPdfValid = true;
        } catch (e) {
          console.warn(`PDF Check failed for ${finalPdfUrl}`, e);
        }
      }

      // Generate PDF if missing or invalid
      if (!isPdfValid) {
        console.log('PDF missing or invalid, regenerating...');
        const profile = await getSettingsProfileById(invoice.settingsProfileId!, req.tenantId);
        if (!profile) {
          throw new Error('Settings profile not found for PDF regeneration');
        }
        finalPdfUrl = await generateAndUploadInvoicePDF(invoice, profile);
        
        await createInvoiceAttachment({
          invoiceId: invoice.id,
          fileName: `Invoice_${invoice.invoiceNumber}.pdf`,
          fileUrl: finalPdfUrl,
          uploadedBy: req.user.id
        });
      }

      // Determine recipient email
      const snapshot = invoice.customerSnapshot as any;
      const recipientEmail = invoice.customerSnapshot?.email || to || snapshot?.email;
      const customerName = invoice.customerSnapshot?.companyName || snapshot?.companyName || "Valued Customer";

      if (!recipientEmail) {
        throw new ValidationError("No recipient email address found for this customer.");
      }

      // Check if there is a verified integrated default invoice mail
      let emailResult;
      try {
        console.log(`[InvoiceController] Attempting to send via integrated mail for tenant ${req.tenantId}`);
        
        // Generate nice HTML content
        const htmlContent = EmailService.generateInvoiceHtml({
          customerName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.grandTotal ? invoice.grandTotal.toString() : '0.00',
          dueDate: new Date(invoice.dueDate).toLocaleDateString(),
          customMessage: message,
          pdfUrl: finalPdfUrl
        });

        const mailResponse = await MailService.sendInvoiceViaIntegratedMail(req.tenantId, {
          to: [recipientEmail],
          subject: subject || `Invoice ${invoice.invoiceNumber} from Zithspace`,
          body: message || `Dear ${customerName}, please find your invoice ${invoice.invoiceNumber} attached.`,
          htmlBody: htmlContent,
          attachments: finalPdfUrl ? [{
            filename: `Invoice_${invoice.invoiceNumber}.pdf`,
            url: finalPdfUrl,
            contentType: 'application/pdf'
          }] : []
        }, req.user.id);
        emailResult = { success: true, data: mailResponse }; 
      } catch (err: any) {
        console.warn(`[InvoiceController] Integrated mail sending failed or not configured: ${err.message}. Falling back to SMTP.`);
        
        // Fallback to existing SMTP email service
        emailResult = await emailService.sendInvoiceEmail({
          to: recipientEmail,
          subject: subject || `Invoice ${invoice.invoiceNumber} from Zithtech`,
          customerName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.grandTotal ? invoice.grandTotal.toString() : '0.00',
          dueDate: new Date(invoice.dueDate).toLocaleDateString(),
          customMessage: message,
          pdfUrl: finalPdfUrl
        }, req.tenantId);
      }

      if (emailResult.success) {
        console.log(`✅ Email sent successfully to ${recipientEmail}`);
        
        // Update status to SENT if it was DRAFT, PENDING, or APPROVAL
        if (['DRAFT', 'PENDING', 'APPROVAL'].includes(invoice.status)) {
          await updateInvoiceStatus(invoice.id, req.tenantId, InvoiceStatus.SENT, req.user.id);
        }

        res.status(200).json({
          success: true,
          message: 'Email sent successfully',
          data: {
            recipientEmail,
            customerName,
            pdfUrl: finalPdfUrl,
            invoiceNumber: invoice.invoiceNumber
          }
        } as ApiResponse);

        // ─── Activity log ───────────────────────────────────────────────
        recordTransaction({
          req,
          section: Section.FINANCE,
          module: Module.INVOICES,
          page: Page.INVOICE_LIST,
          action: Action.EMAIL_SENT,
          actionLabel: `Email sent for invoice ${invoice.invoiceNumber} to ${recipientEmail}`,
          entityType: EntityType.INVOICE,
          entityId: id,
          entityLabel: invoice.invoiceNumber,
          afterData: {
            recipientEmail,
            customerName,
            invoiceNumber: invoice.invoiceNumber,
            subject: subject || `Invoice ${invoice.invoiceNumber}`,
          },
        });
      } else {
        console.error(`❌ Failed to send email to ${recipientEmail}`);
        res.status(500).json({
          success: false,
          error: 'Failed to send email'
        } as ApiResponse);
      }

    } catch (error: any) {
      console.error('Send email error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to send email' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  UPDATE STATUS - PostgreSQL Version
   * ==================== */
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const { status, payment, paidAmount, balanceAmount, paymentMethod, paymentDate } = req.body;
      
      // Extract payment details from nested payment object or flat structure
      const extractedPaidAmount = payment?.amount || paidAmount;
      const extractedPaymentMethod = payment?.method || paymentMethod;
      const extractedPaymentDate = payment?.date || paymentDate;
      const extractedBalanceAmount = balanceAmount; // balanceAmount is only at root level
      
      console.log(`UPDATE STATUS - ID: ${id}, Status: ${status}`);
      console.log('PAYMENT DETAILS:', {
        paidAmount: extractedPaidAmount,
        balanceAmount: extractedBalanceAmount,
        paymentMethod: extractedPaymentMethod,
        paymentDate: extractedPaymentDate,
        originalPaymentObject: payment
      });

      // Validate status
      if (!status) {
        throw new ValidationError('Status is required');
      }
      
      const normalizedStatus = status.toUpperCase();
      if (!Object.values(InvoiceStatus).includes(normalizedStatus)) {
        throw new ValidationError(`Invalid status: ${status}. Valid statuses: ${Object.values(InvoiceStatus).join(', ')}`);
      }

      // Check if invoice exists
      const existingInvoice = await getInvoiceById(id, req.tenantId);
      if (!existingInvoice) {
        throw new NotFoundError('Invoice not found');
      }

      // Validate payment details for payment-related statuses BEFORE updating
      if (normalizedStatus === InvoiceStatus.PARTIALLY_PAID || normalizedStatus === InvoiceStatus.PAID) {
        if (!extractedPaidAmount || extractedPaidAmount <= 0) {
          throw new ValidationError(`Paid amount is required and must be greater than 0 for ${normalizedStatus} status. Received: ${extractedPaidAmount}`);
        }
        
        if (!extractedPaymentMethod) {
          throw new ValidationError(`Payment method is required for ${normalizedStatus} status. Valid methods: CASH, BANK_TRANSFER, CREDIT_CARD, DEBIT_CARD, CHECK, ONLINE_PAYMENT, OTHER`);
        }

        // Validate payment amount doesn't exceed total
        const paymentAmount = Number(extractedPaidAmount);
        if (paymentAmount > existingInvoice.grandTotal) {
          throw new ValidationError(`Payment amount (${paymentAmount}) cannot exceed invoice total (${existingInvoice.grandTotal})`);
        }
      }

      // For payment-related statuses, update both status and balance
      if (normalizedStatus === InvoiceStatus.PARTIALLY_PAID || normalizedStatus === InvoiceStatus.PAID) {
        // Get current invoice details for payment calculation
        const currentInvoice = await getInvoiceById(id, req.tenantId);
        if (!currentInvoice) {
          throw new NotFoundError('Invoice not found');
        }

        // Use actual payment amount from request
        const paymentAmount = Number(extractedPaidAmount);
        
        // Calculate balance after payment
        const balanceBefore = currentInvoice.balanceDue;
        const balanceAfter = extractedBalanceAmount !== undefined ? Number(extractedBalanceAmount) : 
          (normalizedStatus === InvoiceStatus.PAID ? 0 : balanceBefore - paymentAmount);
        
        // Calculate new paid amount
        const newPaidAmount = (currentInvoice.paidAmount || 0) + paymentAmount;
        
        // Update both status and balance in one operation
        const updated = await updateInvoiceStatusAndBalance(
          id, 
          req.tenantId, 
          normalizedStatus as InvoiceStatus, 
          balanceAfter, 
          newPaidAmount,
          req.user.id
        );
        
        if (!updated) {
          throw new Error('Failed to update invoice status and balance');
        }

        // Create payment record
        try {
          // Map payment method string to enum
          let paymentMethodEnum = PaymentMethod.OTHER;
          if (extractedPaymentMethod) {
            const methodUpper = extractedPaymentMethod.toUpperCase();
            switch (methodUpper) {
              case 'CASH':
                paymentMethodEnum = PaymentMethod.CASH;
                break;
              case 'BANK_TRANSFER':
              case 'TRANSFER':
                paymentMethodEnum = PaymentMethod.BANK_TRANSFER;
                break;
              case 'CREDIT_CARD':
              case 'CARD':
                paymentMethodEnum = PaymentMethod.CREDIT_CARD;
                break;
              case 'DEBIT_CARD':
                paymentMethodEnum = PaymentMethod.DEBIT_CARD;
                break;
              case 'CHECK':
              case 'CHEQUE':
                paymentMethodEnum = PaymentMethod.CHECK;
                break;
              case 'ONLINE_PAYMENT':
              case 'ONLINE':
                paymentMethodEnum = PaymentMethod.ONLINE_PAYMENT;
                break;
              default:
                paymentMethodEnum = PaymentMethod.OTHER;
            }
          }
          
          await createInvoicePayment({
            tenantId: req.tenantId!,
            invoiceId: id,
            amount: paymentAmount,
            description: `Payment for status update to ${normalizedStatus}`,
            paymentDate: extractedPaymentDate ? new Date(extractedPaymentDate) : new Date(),
            paymentMethod: paymentMethodEnum,
            status: InvoicePaymentStatus.COMPLETED,
            createdBy: req.user.id,
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter
          });
          
          console.log(`Payment record created: Amount=${paymentAmount}, Method=${paymentMethodEnum}, Balance Before=${balanceBefore}, Balance After=${balanceAfter}`);
          
          // Create transaction for the payment
          try {
            await createTransaction({
              userId: req.user.id,
              type: 'income', // Invoice payments are income
              amount: paymentAmount,
              description: `Payment received for invoice ${currentInvoice.invoiceNumber}`,
              category: 'client_payment',
              date: extractedPaymentDate ? new Date(extractedPaymentDate) : new Date(),
              metadata: {
                invoiceId: id,
                invoiceNumber: currentInvoice.invoiceNumber,
                paymentMethod: paymentMethodEnum,
                paymentStatus: normalizedStatus
              }
            }, req.tenantId!);
            
            console.log(`Transaction created for invoice payment: Amount=${paymentAmount}, Invoice=${currentInvoice.invoiceNumber}`);
          } catch (transactionError: any) {
            console.error('Failed to create transaction for invoice payment:', transactionError);
            // Don't fail the payment update if transaction creation fails
          }
        } catch (paymentError: any) {
          console.error('Failed to create payment record:', paymentError);
          // Don't fail the status update if payment creation fails
        }
      } else {
        // For non-payment statuses, just update the status
        const updated = await updateInvoiceStatus(id, req.tenantId, normalizedStatus as InvoiceStatus, req.user.id);
        
        if (!updated) {
          throw new Error('Failed to update invoice status');
        }
      }

      // Log activity
      await createInvoiceActivityLog({
        invoiceId: id,
        action: 'STATUS_UPDATED',
        performedBy: req.user.id,
        metadata: {
          oldStatus: existingInvoice.status,
          newStatus: normalizedStatus,
          updatedBy: req.user.id
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_LIST,
        action: Action.STATUS_CHANGE,
        actionLabel: `Invoice ${existingInvoice.invoiceNumber} status changed to ${normalizedStatus}`,
        entityType: EntityType.INVOICE,
        entityId: id,
        entityLabel: existingInvoice.invoiceNumber,
        beforeData: { status: existingInvoice.status },
        afterData: { status: normalizedStatus },
        changedFields: ['status'],
      });

      console.log(`Invoice ${id} status updated to ${status}`);

      res.status(200).json({
        success: true,
        data: {
          id,
          invoiceNumber: existingInvoice.invoiceNumber,
          oldStatus: existingInvoice.status,
          newStatus: normalizedStatus
        }
      } as ApiResponse);
    } catch (error: any) {
      console.error('Update status error:', error);
      res.status(
        error instanceof NotFoundError ? 404 :
        error instanceof ValidationError ? 400 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to update invoice status' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  DOWNLOAD INVOICE - PostgreSQL Version
   * ==================== */
  static async downloadInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      console.log(`DOWNLOAD INVOICE - ID: ${id}`);

      // Get invoice with related data
      const invoice = await getInvoiceById(id, req.tenantId);
      if (!invoice) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      // Get attachments to find PDF
      const attachments = await getInvoiceAttachments(invoice.id);
      const pdfAttachment = attachments.find(a => a.fileName.toLowerCase().endsWith('.pdf') || a.fileUrl.toLowerCase().endsWith('.pdf'));
      let pdfUrl = pdfAttachment?.fileUrl || (invoice as any).pdfUrl;

      // Generate PDF if missing
      if (!pdfUrl) {
        console.log('PDF missing, generating...');
        const profile = await getSettingsProfileById(invoice.settingsProfileId!, req.tenantId);
        if (!profile) {
          throw new Error('Settings profile not found for PDF generation');
        }
        
        pdfUrl = await generateAndUploadInvoicePDF(invoice, profile);
        
        await createInvoiceAttachment({
          invoiceId: invoice.id,
          fileName: `Invoice_${invoice.invoiceNumber}.pdf`,
          fileUrl: pdfUrl,
          uploadedBy: req.user.id
        });
      }

      // Fetch the PDF from R2
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const pdfUrlParsed = url.parse(pdfUrl);
      const client = pdfUrlParsed.protocol === 'https:' ? https : http;
      
      client.get(pdfUrl, (pdfRes: any) => {
        if (pdfRes.statusCode !== 200) {
          console.error(`Failed to fetch PDF: ${pdfRes.statusCode}`);
          res.status(500).json({ success: false, error: 'Failed to fetch PDF file' });
          return;
        }

        // Set proper headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
        res.setHeader('Cache-Control', 'no-cache');

        // Pipe the PDF response to the client
        pdfRes.pipe(res);
      }).on('error', (err: any) => {
        console.error('Error fetching PDF:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch PDF file' });
      });

      // Log activity
      await createInvoiceActivityLog({
        invoiceId: id,
        action: 'DOWNLOADED',
        performedBy: req.user.id,
        metadata: {
          pdfUrl,
          downloadedAt: new Date()
        }
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.FINANCE,
        module: Module.INVOICES,
        page: Page.INVOICE_LIST,
        action: Action.DOWNLOAD,
        actionLabel: `Downloaded PDF for invoice ${invoice.invoiceNumber}`,
        entityType: EntityType.INVOICE,
        entityId: id,
        entityLabel: invoice.invoiceNumber,
        afterData: { pdfUrl, invoiceNumber: invoice.invoiceNumber },
      });

      console.log(`Invoice ${id} PDF downloaded successfully`);

    } catch (error: any) {
      console.error('Download invoice error:', error);
      res.status(
        error instanceof NotFoundError ? 404 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to download invoice' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  GET PAYMENT HISTORY - PostgreSQL Version
   * ==================== */
  static async getPaymentHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const id = req.params.id || req.params.invoiceId;
      const { page = 1, limit = 20 } = req.query;
      console.log(`GET PAYMENT HISTORY - Invoice ID: ${id}`);

      if (!id) {
        throw new ValidationError('Invoice ID is required');
      }

      // Check if invoice exists
      const invoice = await getInvoiceById(id, req.tenantId);
      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }

      // Get payment history
      const payments = await getInvoicePayments(id, req.tenantId);
      const total = payments.length;

      const totalPages = Math.ceil(total / Number(limit));

      // Calculate summary values
      const completedPayments = payments.filter(p => p.status === 'COMPLETED');
      const refundedPayments = payments.filter(p => p.status === 'REFUNDED');
      const totalPaid = completedPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const totalRefunded = refundedPayments.reduce((sum, payment) => sum + payment.amount, 0);
      
      console.log(`Retrieved ${payments.length} payments out of ${total} total`);
      console.log(`Payment Summary - Total Paid: ${totalPaid}, Total Refunded: ${totalRefunded}, Invoice Total: ${invoice.grandTotal}`);

      res.status(200).json({ 
        success: true, 
        data: {
          payments,
          summary: {
            invoiceNumber: invoice.invoiceNumber,
            customerName: (invoice.customerSnapshot as any)?.companyName || 'Unknown',
            totalAmount: invoice.grandTotal,
            totalPaid: totalPaid,
            totalRefunded: totalRefunded,
            balanceDue: invoice.grandTotal - totalPaid + totalRefunded,
            paymentCount: payments.length,
            completedPayments: completedPayments.length,
            refundedPayments: refundedPayments.length
          },
          pagination: { 
            page: Number(page), 
            limit: Number(limit), 
            total, 
            pages: totalPages 
          }
        } 
      } as ApiResponse);

    } catch (error: any) {
      console.error('Get payment history error:', error);
      res.status(
        error instanceof NotFoundError ? 404 : 500
      ).json({ 
        success: false, 
        error: error.message || 'Failed to fetch payment history' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  GET NEXT INVOICE NUMBER - PostgreSQL Version
   * ==================== */
  static async getNextInvoiceNumber(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { profileId } = req.query;
      console.log(`GET NEXT INVOICE NUMBER - Profile ID: ${profileId}`);

      // Get profile for formatting
      const profile = await getSettingsProfileById(profileId as string, req.tenantId);
      if (!profile || !profile.invoice) {
        throw new ValidationError('Invoice settings profile not found');
      }

      const settings = profile.invoice;
      const currentYear = new Date().getFullYear();
      
      // Get ALL invoices including soft-deleted ones
      const { invoices: allInvoices } = await getAllInvoices(req.tenantId, {
        page: 1,
        limit: 10000, // Get all invoices
        status: 'all'
      });

      // Calculate next number based on ALL invoices (including deleted)
      let nextNumber: number;
      
      if (settings.resetYearly) {
        // Find highest number in current year (including deleted) - using improved logic
        let highestThisYear = 0;
        allInvoices.forEach((invoice: any) => {
          // Check if invoice belongs to current year
          const yearMatch = invoice.invoiceNumber.match(/(\d{4})/);
          if (yearMatch && parseInt(yearMatch[1]) === currentYear) {
            // Extract the sequence number (last part of format)
            const numberMatch = invoice.invoiceNumber.match(/(\d+)$/);
            if (numberMatch) {
              const num = parseInt(numberMatch[1], 10);
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

      // Format the number
      const padded = nextNumber.toString().padStart(settings.padding, '0');
      const now = new Date();
      
      let invoiceNumber = settings.format
        .replace('{YYYY}', currentYear.toString())
        .replace('{YY}', (currentYear % 100).toString().padStart(2, '0'))
        .replace('{MM}', (now.getMonth() + 1).toString().padStart(2, '0'))
        .replace('{DD}', now.getDate().toString().padStart(2, '0'))
        .replace('{###}', padded);

      console.log(`Next invoice number for profile ${profile.name}: ${invoiceNumber}`);

      res.status(200).json({ 
        success: true, 
        data: { 
          invoiceNumber,
          nextNumber,
          profileName: profile.name,
          format: settings.format
        }
      } as ApiResponse);

    } catch (error: any) {
      console.error('Get next invoice number error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to get next invoice number' 
      } as ApiResponse);
    }
  }

  /** ====================
   *  CHECK PDF STATUS - PostgreSQL Version
   * ==================== */
  static async checkPDFStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { invoiceNumber } = req.params;
      console.log(`CHECK PDF STATUS - Invoice Number: ${invoiceNumber}`);

      // Get invoice by number
      const invoice = await getInvoiceByNumber(invoiceNumber, req.tenantId);
      if (!invoice) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      // Get attachments to find PDF
      const attachments = await getInvoiceAttachments(invoice.id);
      const pdfAttachment = attachments.find(a => a.fileName.toLowerCase().endsWith('.pdf') || a.fileUrl.toLowerCase().endsWith('.pdf'));
      const pdfUrl = pdfAttachment?.fileUrl || (invoice as any).pdfUrl;

      // Check PDF status
      let pdfExists = false;
      let statusCode = 0;
      let errorMessage = '';

      if (pdfUrl) {
        try {
          const response = await fetch(pdfUrl, { method: 'HEAD' });
          statusCode = response.status;
          pdfExists = response.ok;
        } catch (fetchError: any) {
          errorMessage = fetchError.message;
          console.error('PDF URL test failed:', fetchError.message);
        }
      }

      // Log activity
      await createInvoiceActivityLog({
        invoiceId: invoice.id,
        action: 'PDF_STATUS_CHECKED',
        performedBy: req.user.id,
        metadata: {
          pdfUrl,
          pdfExists,
          statusCode,
          errorMessage
        }
      });

      res.json({
        success: true,
        data: {
          invoiceNumber: invoice.invoiceNumber,
          pdfUrl,
          pdfExists,
          statusCode,
          errorMessage,
          expectedUrl: `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/b85c1b5b-77a3-4281-9147-51d6bd3ee94d/invoices/Invoice-${invoiceNumber}.pdf`
        }
      } as ApiResponse);

    } catch (error: any) {
      console.error('Check PDF status error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to check PDF status' 
      } as ApiResponse);
    }
  }
}
