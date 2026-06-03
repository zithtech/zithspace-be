import { Response } from 'express';
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from '@/types';
import {
  getSettingsProfiles,
  getSettingsProfileById,
  createSettingsProfile,
  updateSettingsProfile,
  deleteSettingsProfile,
  setActiveProfile,
  getActiveSettingsProfile,
  getAllActiveSettingsProfiles
} from '@/models/settingsProfile.model';
import {
  createGeneralSetting,
  updateGeneralSetting
} from '@/models/generalSettings.model';
import {
  createInvoiceSetting,
  updateInvoiceSetting
} from '@/models/invoiceSettings.model';
import {
  createPaymentSetting,
  updatePaymentSetting
} from '@/models/paymentSettings.model';
import { validatePaymentQR } from '@/utils/qrValidator';
import { validateSignatureImage } from '@/utils/signatureValidator';
import { recordTransaction, Section, Module, Page, Action, EntityType } from '@/utils/transactionHistory';

const parseInvoiceFormat = (formatString: string) => {
  // Finds the sequence of # inside curly braces (e.g., {####})
  const paddingMatch = formatString.match(/{#+}/);
  
  // Calculate padding: length of match minus the 2 curly braces
  // Default to 4 if no {#} token is found
  const padding = paddingMatch ? paddingMatch[0].length - 2 : 4;

  // Check if year tokens exist to determine auto-reset
  const hasYearToken = formatString.includes("{YYYY}") || formatString.includes("{YY}");

  return {
    format: formatString,
    padding: padding,
    resetYearly: hasYearToken,
    lastResetYear: new Date().getFullYear(),
    nextNumber: 1, // Start sequence at 1
  };
};

export class InvoiceSettingsController {
  
  private static sanitizeProfile(profile: any) {
    if (!profile) return null;
    // Remove recursive profile links from related models to prevent circular JSON serialization
    const { general, invoice, payment, ...rest } = profile;
    return {
      ...rest,
      general: general ? { ...general, profiles: undefined, tenant: undefined } : undefined,
      invoice: invoice ? { ...invoice, profiles: undefined, tenant: undefined } : undefined,
      payment: payment ? { ...payment, profiles: undefined, tenant: undefined } : undefined,
    };
  }

  // ===================== GET ALL PROFILES =====================
  static async getProfiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: 'Tenant context required' } as ApiResponse);
        return;
      }

      const { 
        page = 1, 
        limit = 20, 
        isActive = 'all', 
        search, 
        sortBy = 'createdAt', 
        sortOrder = 'desc' 
      } = req.query;

      const options = {
        page: Number(page),
        limit: Number(limit),
        isActive: isActive === 'all' ? 'all' : isActive === 'true',
        search: search as string,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      } as const;

      const { profiles, total } = await getSettingsProfiles(req.tenantId, options);
      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: profiles.map(p => InvoiceSettingsController.sanitizeProfile(p)),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: totalPages,
          hasNext: Number(page) < totalPages,
          hasPrev: Number(page) > 1
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Get profiles error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch profiles' });
    }
  }

  // ===================== GET PROFILE BY ID =====================
  static async getProfileById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      const profile = await getSettingsProfileById(id, req.tenantId);
      
      if (!profile) throw new NotFoundError('Profile not found');
      
      const sanitized = InvoiceSettingsController.sanitizeProfile(profile);

      res.status(200).json({ success: true, data: sanitized } as ApiResponse);

    } catch (error: any) {
      console.error('Get profile by ID error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
  }

 



  // ===================== UPDATE PROFILE =====================
  
  
  static async createProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

    const { name, general = {}, invoice = {}, payment = {} } = req.body;
    if (!name) throw new ValidationError('Profile name is required');

    // --- DYNAMIC DESTRUCTURING START ---
    // If frontend sends { format: "INV-{###}" }, this expands it
    const invoiceFormatString = invoice.format || "INV-{YYYY}-{###}";
    const parsedInvoiceData = parseInvoiceFormat(invoiceFormatString);
    // --- DYNAMIC DESTRUCTURING END ---

    // Validate signature image if provided
    if (general && general.signature) {
      const signatureValidation = await validateSignatureImage(general.signature);
      if (!signatureValidation.isValid) {
        res.status(400).json({ success: false, error: signatureValidation.error });
        return;
      }
    }

    // Create general setting
    const generalSetting = await createGeneralSetting({
      tenantId: req.tenantId,
      companyName: general.companyName || '',
      address: general.address || {},
      primaryColor: general.primaryColor || '#000000',
      currency: general.currency || 'USD',
      dateFormat: general.dateFormat || 'DD/MM/YYYY',
      companyLogo: general.companyLogo,
      signature: general.signature,
      gstin: general.gstin === "" ? null : general.gstin,
      pan: general.pan === "" ? null : general.pan,
      createdBy: req.user.id,
    });

    // Create invoice setting
    const invoiceSetting = await createInvoiceSetting({
      tenantId: req.tenantId,
      format: parsedInvoiceData.format,
      nextNumber: parsedInvoiceData.nextNumber,
      resetYearly: parsedInvoiceData.resetYearly,
      lastResetYear: parsedInvoiceData.lastResetYear,
      padding: parsedInvoiceData.padding,
      createdBy: req.user.id,
    });

    // Validate payment QR code if provided
    let qrDetails: any = null;
    if (payment && payment.qrCode) {
      const qrValidation = await validatePaymentQR(payment.qrCode);
      if (!qrValidation.isValid) {
        res.status(400).json({ success: false, error: qrValidation.error });
        return;
      }
      qrDetails = qrValidation.details;
    }

    // Create payment setting
    const paymentSetting = await createPaymentSetting({
      tenantId: req.tenantId,
      bankName: payment.bankName || '',
      accountNumber: payment.accountNumber || '',
      ifscCode: payment.ifscCode || '',
      branchName: payment.branchName || '',
      qrCode: payment.qrCode,
      createdBy: req.user.id,
      upiId: qrDetails ? qrDetails.upiId : null,
      merchantName: qrDetails ? qrDetails.merchantName : null,
      bankHandle: qrDetails ? qrDetails.bankHandle : null,
    });

    // Create settings profile
    const newProfile = await createSettingsProfile({
      tenantId: req.tenantId,
      name,
      isActive: false,
      generalId: generalSetting.id,
      invoiceId: invoiceSetting.id,
      paymentId: paymentSetting.id,
      createdBy: req.user.id,
    });

    // Get the complete profile with relations
    const completeProfile = await getSettingsProfileById(newProfile.id, req.tenantId);

    res.status(201).json({
      success: true,
      data: completeProfile,
      message: 'Profile created successfully'
    } as ApiResponse);

    // ─── Activity log ───────────────────────────────────────────────
    recordTransaction({
      req,
      section: Section.FINANCE,
      module: Module.INVOICES,
      page: Page.INVOICE_SETTINGS_VIEW,
      action: Action.CREATE,
      actionLabel: `Created settings profile ${name}`,
      entityType: EntityType.INVOICE_SETTINGS_PROFILE,
      entityId: newProfile.id,
      entityLabel: name,
    });

  } catch (error: any) {
    console.error('Create profile error:', error);
    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create profile' });
  }
}
  
  
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new Error('Auth required');

    const { id } = req.params;
    const { name, general, invoice, payment } = req.body;

    // 1. Fetch existing profile to get foreign keys (generalId, invoiceId, etc.)
    const existing = await getSettingsProfileById(id, req.tenantId);
    
    if (!existing) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    // 2. Update related settings if provided
    if (general) {
      if (general.signature) {
        const signatureValidation = await validateSignatureImage(general.signature);
        if (!signatureValidation.isValid) {
          res.status(400).json({ success: false, error: signatureValidation.error });
          return;
        }
      }

      await updateGeneralSetting(existing.generalId, req.tenantId, {
        ...general,
        gstin: general.gstin === "" ? null : general.gstin,
        pan: general.pan === "" ? null : general.pan,
        updatedBy: req.user.id,
      });
    }

    if (invoice) {
      await updateInvoiceSetting(existing.invoiceId, req.tenantId, {
        ...invoice,
        updatedBy: req.user.id,
      });
    }

    if (payment) {
      let qrDetails: any = undefined;
      // Note: check if qrCode is explicitly being cleared or updated
      if (payment.qrCode !== undefined) {
        if (payment.qrCode) {
          const qrValidation = await validatePaymentQR(payment.qrCode);
          if (!qrValidation.isValid) {
            res.status(400).json({ success: false, error: qrValidation.error });
            return;
          }
          qrDetails = qrValidation.details;
        } else {
          // If qrCode is null or empty, it means we are clearing the QR code
          qrDetails = null;
        }
      }

      await updatePaymentSetting(existing.paymentId, req.tenantId, {
        ...payment,
        upiId: qrDetails !== undefined ? (qrDetails ? qrDetails.upiId : null) : undefined,
        merchantName: qrDetails !== undefined ? (qrDetails ? qrDetails.merchantName : null) : undefined,
        bankHandle: qrDetails !== undefined ? (qrDetails ? qrDetails.bankHandle : null) : undefined,
        updatedBy: req.user.id,
      });
    }

    // 3. Update the profile
    const updatedProfile = await updateSettingsProfile(id, req.tenantId, {
      name,
      updatedBy: req.user.id,
    });

    // 4. Get the complete updated profile with relations
    const completeProfile = await getSettingsProfileById(id, req.tenantId);

    res.status(200).json({ success: true, data: completeProfile });

    // ─── Activity log ───────────────────────────────────────────────
    const profileName = name || existing.name;
    recordTransaction({
      req,
      section: Section.FINANCE,
      module: Module.INVOICES,
      page: Page.INVOICE_SETTINGS_VIEW,
      action: Action.UPDATE,
      actionLabel: `Updated settings profile ${profileName}`,
      entityType: EntityType.INVOICE_SETTINGS_PROFILE,
      entityId: id,
      entityLabel: profileName,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}






static async hardDeleteProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) throw new ValidationError('Tenant context required');
    const { id } = req.params;

    // 1. Fetch the profile to verify it exists
    const profile = await getSettingsProfileById(id, req.tenantId);

    if (!profile) throw new NotFoundError('Profile not found');

    // 2. Delete the profile (cascade will handle related settings due to ON DELETE CASCADE)
    const success = await deleteSettingsProfile(id, req.tenantId);

    if (!success) {
      throw new Error('Failed to delete profile');
    }

    res.status(200).json({ success: true, message: 'Profile deleted permanently' });

    // ─── Activity log ───────────────────────────────────────────────
    recordTransaction({
      req,
      section: Section.FINANCE,
      module: Module.INVOICES,
      page: Page.INVOICE_SETTINGS_VIEW,
      action: Action.PERMANENT_DELETE,
      actionLabel: `Permanently deleted settings profile ${profile.name}`,
      entityType: EntityType.INVOICE_SETTINGS_PROFILE,
      entityId: id,
      entityLabel: profile.name,
    });

  } catch (error: any) {
    console.error('Hard delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete profile' });
  }
}


  // ===================== ACTIVATE PROFILE =====================
 

  static async activateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

    const { id } = req.params;
    // 1. Read the boolean state from the body (sent from frontend)
    const { isActive } = req.body; 

    // 2. Update the profile status
    const updatedProfile = await updateSettingsProfile(id, req.tenantId, {
      isActive,
      updatedBy: req.user.id,
    });

    if (!updatedProfile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.status(200).json({ 
      success: true, 
      data: updatedProfile, 
      message: `Profile ${isActive ? 'activated' : 'deactivated'} successfully` 
    });

    // ─── Activity log ───────────────────────────────────────────────
    recordTransaction({
      req,
      section: Section.FINANCE,
      module: Module.INVOICES,
      page: Page.INVOICE_SETTINGS_VIEW,
      action: Action.STATUS_CHANGE,
      actionLabel: `Settings profile "${updatedProfile.name}" ${isActive ? 'activated' : 'deactivated'}`,
      entityType: EntityType.INVOICE_SETTINGS_PROFILE,
      entityId: id,
      entityLabel: updatedProfile.name,
      afterData: { isActive },
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
}


static async getActiveProfiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) throw new ValidationError('Tenant context required');

    const activeProfiles = await getAllActiveSettingsProfiles(req.tenantId);

    const sanitized = activeProfiles.map(profile => InvoiceSettingsController.sanitizeProfile(profile));

    res.status(200).json({ success: true, data: sanitized });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch active profiles' });
  }
}


}

export default InvoiceSettingsController;