


import { Response } from 'express';
import { prisma } from "@/config/database";
import { 
  AuthRequest, 
  ApiResponse, 
  NotFoundError, 
  ValidationError 
} from '@/types';

export class InvoiceController {

  /** ====================
   *  Helper: Calculate totals
   * ==================== */
  // private static calculateTotals(items: any[], discount: number = 0) {
  //   let subtotal = 0;
  //   let taxTotal = 0;

  //   items.forEach(item => {
  //     const lineTotal = Number(item.price) * Number(item.qty);
  //     const lineTax = lineTotal * (Number(item.tax || 0) / 100);
  //     subtotal += lineTotal;
  //     taxTotal += lineTax;
  //   });

  //   const total = subtotal + taxTotal - Number(discount);
  //   return { subtotal, taxTotal, total, balanceDue: total };
  // }
  
  private static calculateTotals(items: any[], discount: number = 0) {
  let subtotal = 0;
  let taxTotal = 0;

  items.forEach(item => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const tax = Number(item.tax || 0);

    const lineTotal = qty * price;
    const lineTax = lineTotal * (tax / 100);

    subtotal += lineTotal;
    taxTotal += lineTax;
  });

  const total = subtotal + taxTotal - Number(discount || 0);
  const balanceDue = total;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    taxTotal: Number(taxTotal.toFixed(2)),
    total: Number(total.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    balanceDue: Number(balanceDue.toFixed(2)),
  };
}


  /** ====================
   *  Helper: Generate invoice number
   * ==================== */
  private static async generateInvoiceNumber(
    tx: any, 
    tenantId: string, 
    profileId: string
  ): Promise<string> {
    const profile = await tx.settingsProfile.findFirst({
      where: { id: profileId, tenantId },
      include: { invoice: true }
    });

    if (!profile || !profile.invoice) {
      throw new ValidationError('Invoice settings profile not found for this tenant');
    }

    const setting = profile.invoice;
    const now = new Date();
    const currentYear = now.getFullYear();
    let nextNum = setting.nextNumber;

    if (setting.resetYearly && setting.lastResetYear !== currentYear) {
      nextNum = 1;
    }

    const paddedNumber = nextNum.toString().padStart(setting.padding, '0');
    const formattedNumber = setting.format
      .replace('{YYYY}', currentYear.toString())
      .replace('{###}', paddedNumber);

    // Increment next number in DB
    await tx.invoiceSetting.update({
      where: { id: setting.id },
      data: { nextNumber: nextNum + 1, lastResetYear: currentYear }
    });

    return formattedNumber;
  }





/** ====================
 *  Get next invoice number (pre-generate)
 * ==================== */
// static async getNextInvoiceNumber(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     if (!req.tenantId) throw new ValidationError('Tenant context required');

//     // Fetch active settings profile
//     const profile = await prisma.settingsProfile.findFirst({
//       where: { tenantId: req.tenantId, isActive: true },
//       include: { invoice: true }
//     });

//     if (!profile || !profile.invoice) {
//       throw new ValidationError('No active invoice settings profile found');
//     }

//     const nextNumber = await this.generateInvoiceNumber(prisma, req.tenantId, profile.id);

//     res.status(200).json({
//       success: true,
//       data: { invoiceNumber: nextNumber }
//     });
//   } catch (error: any) {
//     console.error('Get next invoice number error:', error);
//     res.status(error instanceof ValidationError ? 400 : 500).json({
//       success: false,
//       error: error.message || 'Failed to get next invoice number'
//     });
//   }
// }


// Inside InvoiceController.ts
static async getNextInvoiceNumber(req: AuthRequest, res: Response): Promise<void> {
  try {
    const profile = await prisma.settingsProfile.findFirst({
      where: { tenantId: req.tenantId, isActive: true },
      include: { invoice: true }
    });

    if (!profile?.invoice) throw new ValidationError('Settings not found');

    const { nextNumber, padding, format } = profile.invoice;
    
    // Just format the string, DO NOT update the database here
    const padded = nextNumber.toString().padStart(padding, '0');
    const invoiceNumber = format
      .replace('{YYYY}', new Date().getFullYear().toString())
      .replace('{###}', padded);

    res.status(200).json({ success: true, data: { invoiceNumber } });
  } catch (error) {
    // ... error handling
  }
}



/** ====================
 *  Create Invoice (safe, no transaction timeout)
 * ==================== */
static async createInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: 'Tenant context and authentication required'
      } as ApiResponse);
      return;
    }

    const { 
      items, 
      discount = 0, 
      customerId, 
      customerSnapshot, 
      settingsProfileId, 
      ...invoiceData 
    } = req.body;

    if (!items?.length) throw new ValidationError("At least one item is required");
    if (!customerId && !customerSnapshot) throw new ValidationError("Either customerId or customerData is required");

    // 1. Calculate totals
    //const totals = this.calculateTotals(items, discount);
    const totals = this.calculateTotals(items, Number(discount || 0));

    // 2. Fetch active settings profile or use provided ID
    let profile = null;
    if (settingsProfileId) {
      profile = await prisma.settingsProfile.findFirst({
        where: { id: settingsProfileId, tenantId: req.tenantId },
        include: { invoice: true }
      });
    }

    if (!profile) {
      profile = await prisma.settingsProfile.findFirst({
        where: { tenantId: req.tenantId, isActive: true },
        include: { invoice: true }
      });
    }

    if (!profile || !profile.invoice) {
      throw new ValidationError('No active invoice settings profile found for this tenant');
    }

    // 3. Pre-generate invoice number (outside heavy transaction)
    const invoiceNumber = await this.generateInvoiceNumber(prisma, req.tenantId, profile.id);

    // 4. Create invoice along with nested items
    const newInvoice = await prisma.invoice.create({
      // data: {
      //   ...invoiceData,        
      //   ...totals,
      //   invoiceNumber,
      //   discount,
      //   tenant: { connect: { id: req.tenantId } },
      //   customer: customerId
      //     ? { connect: { id: customerId } }
      //     : { create: { ...customerSnapshot, tenant: { connect: { id: req.tenantId } }, createdBy: req.user.id } },
      //   settingsProfile: { connect: { id: profile.id } },
      //   createdByUser: { connect: { id: req.user.id } },
      //   items: { 
      //     create: items.map(item => ({
      //       ...item,
      //       item: item.item || item.description,
      //       tenant: { connect: { id: req.tenantId } },
      //       createdByUser: { connect: { id: req.user.id } }
      //     }))
      //   }
      // },
      data: {
  ...invoiceData,        // notes, dueDate, currency, etc.
  ...totals,
  invoiceNumber,
  discount: totals.discount,
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    balanceDue: totals.balanceDue,
  
  // 1. SAVE THE JSON SNAPSHOT (The backup)
  customerSnapshot: customerSnapshot, 

  tenant: { connect: { id: req.tenantId } },
  
  // 2. LINK THE ACTUAL CUSTOMER RELATION
  customer: customerId
    ? { connect: { id: customerId } }
    : { 
        create: { 
          // Note: Ensure customerSnapshot properties match Customer model fields here
          companyName: customerSnapshot.companyName,
          email: customerSnapshot.email,
          phone: customerSnapshot.phone,
          address: customerSnapshot.address,
          city: customerSnapshot.city,
          country: customerSnapshot.country,
          taxId: customerSnapshot.taxId,
          tenant: { connect: { id: req.tenantId } }, 
          createdBy: req.user.id 
        } 
      },

  settingsProfile: { connect: { id: profile.id } },
  createdByUser: { connect: { id: req.user.id } },
  items: { 
    create: items.map(item => ({
      ...item,
      item: item.item || item.description,
      tenant: { connect: { id: req.tenantId } },
      createdByUser: { connect: { id: req.user.id } }
    }))
  }
},
      
      include: { items: true, customer: true }
    });

    res.status(201).json({ 
      success: true, 
      data: newInvoice, 
      message: 'Invoice created successfully' 
    } as ApiResponse);

  } catch (error: any) {
    console.error('Create invoice error:', error);

    if (error.code === 'P2025') {
      res.status(404).json({ success: false, error: 'Related record not found' });
      return;
    }

    res.status(error instanceof ValidationError ? 400 : 500).json({
      success: false,
      error: error.message || 'Failed to create invoice'
    } as ApiResponse);
  }
}


  /** ====================
   *  Get all invoices
   * ==================== */
  static async getInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) throw new ValidationError('Tenant context required');

      const { page = 1, limit = 20, status, customerId, search } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { tenantId: req.tenantId };
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

      res.status(200).json({ success: true, data: invoices, pagination: { page: Number(page), limit: Number(limit), total, pages: totalPages } } as ApiResponse);
    } catch (error: any) {
      console.error('Get invoices error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch invoices' } as ApiResponse);
    }
  }

  /** ====================
   *  Get invoice by ID
   * ==================== */
  static async getInvoiceById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      const invoice = await prisma.invoice.findFirst({
        where: {
        tenantId: req.tenantId,
        OR: [
          { id: id },             // Try searching by UUID
          { invoiceNumber: id }   // Try searching by Display Number
        ]
      },
        include: { customer: true, items: true, createdByUser: true, updatedByUser: true }
      });

      if (!invoice) throw new NotFoundError('Invoice not found');
      res.status(200).json({ success: true, data: invoice } as ApiResponse);
    } catch (error: any) {
      console.error('Get invoice error:', error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({ success: false, error: error.message || 'Failed to fetch invoice' } as ApiResponse);
    }
  }

  /** ====================
   *  Update invoice
   * ==================== */


// static async updateInvoice(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     if (!req.tenantId || !req.user) {
//       throw new ValidationError('Tenant context and authentication required');
//     }

//     const { id } = req.params;
//     const { items = [], discount = 0, customerSnapshot,...updateData } = req.body;

//     if (!items.length) {
//       throw new ValidationError('Invoice must have at least one item');
//     }

//     // Calculate totals for the invoice
//     const totals = this.calculateTotals(items, discount);

//     // Start transaction with increased timeout
//     const updatedInvoice = await prisma.$transaction(
//       async (tx) => {
//         // 1️⃣ Fetch existing invoice
//         const existing = await tx.invoice.findFirst({
//           where: { id, tenantId: req.tenantId },
//         });
//         if (!existing) throw new NotFoundError('Invoice not found');

//         // 2️⃣ Delete removed items
//         const incomingItemIds = items.filter((i: any) => i.id).map((i: any) => i.id);
//         await tx.invoiceItem.deleteMany({
//           where: { invoiceId: id, id: { notIn: incomingItemIds }, tenantId: req.tenantId },
//         });

//         // 3️⃣ Upsert invoice items efficiently
//         const upsertItems = items.map((item: any) => {
//           if (item.id) {
//             // Update existing item
//             return {
//               where: { id: item.id },
//               update: { ...item, updatedBy: req.user.id },
//               create: { ...item, tenantId: req.tenantId, createdBy: req.user.id },
//             };
//           } else {
//             // New item
//             return {
//               where: { id: 'temp-' + Math.random() }, // placeholder, Prisma requires unique where
//               update: { ...item, updatedBy: req.user.id },
//               create: { ...item, tenantId: req.tenantId, createdBy: req.user.id },
//             };
//           }
//         });

//         // 4️⃣ Update invoice
//         return await tx.invoice.update({
//           where: { id },
//           data: {
//             ...updateData,
//             ...totals,
//             discount,
//             customerSnapshot: customerSnapshot,
//             updatedBy: req.user.id,
//             items: { upsert: upsertItems },
//           },
//           include: { items: true },
//         });
//       },
//       {
//         maxWait: 10000, // wait up to 10s to start transaction
//         timeout: 30000, // allow 30s for entire transaction
//       }
//     );

//     res.status(200).json({
//       success: true,
//       data: updatedInvoice,
//       message: 'Invoice updated successfully',
//     } as ApiResponse);
//   } catch (error: any) {
//     console.error('Update invoice error:', error);
//     res.status(
//       error instanceof NotFoundError ? 404 : error instanceof ValidationError ? 400 : 500
//     ).json({ success: false, error: error.message } as ApiResponse);
//   }
// }

static async updateInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      throw new ValidationError('Tenant context and authentication required');
    }

    const { id } = req.params;
    const { items = [], discount = 0, customerSnapshot, ...updateData } = req.body;

    if (!items.length) {
      throw new ValidationError('Invoice must have at least one item');
    }

    // 1️⃣ Calculate totals safely using plain numbers
    const totals = this.calculateTotals(items, Number(discount || 0));

    // 2️⃣ Start transaction
    const updatedInvoice = await prisma.$transaction(
      async (tx) => {
        // Fetch existing invoice
        const existing = await tx.invoice.findFirst({
          where: { id, tenantId: req.tenantId },
        });
        if (!existing) throw new NotFoundError('Invoice not found');

        // Delete removed items
        const incomingItemIds = items.filter((i: any) => i.id).map((i: any) => i.id);
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: id, id: { notIn: incomingItemIds }, tenantId: req.tenantId },
        });

        // Upsert items
        const upsertItems = items.map((item: any) => {
          if (item.id) {
            return {
              where: { id: item.id },
              update: { ...item, updatedBy: req.user.id },
              create: { ...item, tenantId: req.tenantId, createdBy: req.user.id },
            };
          } else {
            return {
              where: { id: 'temp-' + Math.random() },
              update: { ...item, updatedBy: req.user.id },
              create: { ...item, tenantId: req.tenantId, createdBy: req.user.id },
            };
          }
        });

        // Update invoice
        return await tx.invoice.update({
          where: { id },
          data: {
            ...updateData,
            discount: totals.discount,
            subtotal: totals.subtotal,
            taxTotal: totals.taxTotal,
            total: totals.total,
            balanceDue: totals.balanceDue,
            customerSnapshot,
            updatedBy: req.user.id,
            items: { upsert: upsertItems },
          },
          include: { items: true },
        });
      },
      { maxWait: 10000, timeout: 30000 }
    );

    res.status(200).json({
      success: true,
      data: updatedInvoice,
      message: 'Invoice updated successfully',
    } as ApiResponse);

  } catch (error: any) {
    console.error('Update invoice error:', error);
    res.status(
      error instanceof NotFoundError ? 404 :
      error instanceof ValidationError ? 400 : 500
    ).json({ success: false, error: error.message } as ApiResponse);
  }
}





  /** ====================
   *  Update invoice status
   * ==================== */
  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      const { status } = req.body;
      if (!status) throw new ValidationError("Status is required");

      const invoice = await prisma.invoice.findFirst({ where: { id, tenantId: req.tenantId } });
      if (!invoice) throw new NotFoundError('Invoice not found');

      const allowedTransitions: Record<string,string[]> = {
        DRAFT: ["SENT","CANCELLED"],
        SENT: ["PAID","OVERDUE","CANCELLED"],
        OVERDUE: ["PAID","CANCELLED"],
        PAID: [],
        CANCELLED: []
      };

      if (!allowedTransitions[invoice.status].includes(status)) {
        throw new ValidationError(`Cannot change status from ${invoice.status} to ${status}`);
      }

      const updateData: any = { status, updatedBy: req.user.id };
      if (status === "SENT") updateData.sentAt = new Date();
      if (status === "PAID") { updateData.paidAt = new Date(); updateData.balanceDue = 0; }
      if (status === "CANCELLED") updateData.cancelledAt = new Date();

      const updatedInvoice = await prisma.invoice.update({ where: { id }, data: updateData });
      res.status(200).json({ success: true, data: updatedInvoice, message: 'Invoice status updated' });

    } catch (error: any) {
      console.error('Update status error:', error);
      res.status(
        error instanceof ValidationError ? 400 :
        error instanceof NotFoundError ? 404 : 500
      ).json({ success: false, error: error.message || 'Failed to update status' });
    }
  }

  /** ====================
   *  Delete invoice
   * ==================== */
  static async deleteInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      const existing = await prisma.invoice.findFirst({ where: { id, tenantId: req.tenantId } });
      if (!existing) throw new NotFoundError('Invoice not found');

      await prisma.invoice.delete({ where: { id } });
      res.status(200).json({ success: true, message: 'Invoice deleted successfully' });

    } catch (error: any) {
      console.error('Delete invoice error:', error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({ success: false, error: error.message });
    }
  }
}

export default InvoiceController;


