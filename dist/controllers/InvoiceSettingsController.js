"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceSettingsController = void 0;
const types_1 = require("@/types");
const settingsProfile_model_1 = require("@/models/settingsProfile.model");
const generalSettings_model_1 = require("@/models/generalSettings.model");
const invoiceSettings_model_1 = require("@/models/invoiceSettings.model");
const paymentSettings_model_1 = require("@/models/paymentSettings.model");
const parseInvoiceFormat = (formatString) => {
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
class InvoiceSettingsController {
    static sanitizeProfile(profile) {
        if (!profile)
            return null;
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
    static async getProfiles(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { page = 1, limit = 20, isActive = 'all', search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
            const options = {
                page: Number(page),
                limit: Number(limit),
                isActive: isActive === 'all' ? 'all' : isActive === 'true',
                search: search,
                sortBy: sortBy,
                sortOrder: sortOrder
            };
            const { profiles, total } = await (0, settingsProfile_model_1.getSettingsProfiles)(req.tenantId, options);
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
            });
        }
        catch (error) {
            console.error('Get profiles error:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch profiles' });
        }
    }
    // ===================== GET PROFILE BY ID =====================
    static async getProfileById(req, res) {
        try {
            if (!req.tenantId)
                throw new types_1.ValidationError('Tenant context required');
            const { id } = req.params;
            const profile = await (0, settingsProfile_model_1.getSettingsProfileById)(id, req.tenantId);
            if (!profile)
                throw new types_1.NotFoundError('Profile not found');
            const sanitized = InvoiceSettingsController.sanitizeProfile(profile);
            res.status(200).json({ success: true, data: sanitized });
        }
        catch (error) {
            console.error('Get profile by ID error:', error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({ success: false, error: error.message });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({ success: false, error: error.message });
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to fetch profile' });
        }
    }
    // ===================== UPDATE PROFILE =====================
    static async createProfile(req, res) {
        try {
            if (!req.tenantId || !req.user)
                throw new types_1.ValidationError('Tenant context required');
            const { name, general = {}, invoice = {}, payment = {} } = req.body;
            if (!name)
                throw new types_1.ValidationError('Profile name is required');
            // --- DYNAMIC DESTRUCTURING START ---
            // If frontend sends { format: "INV-{###}" }, this expands it
            const invoiceFormatString = invoice.format || "INV-{YYYY}-{###}";
            const parsedInvoiceData = parseInvoiceFormat(invoiceFormatString);
            // --- DYNAMIC DESTRUCTURING END ---
            // Create general setting
            const generalSetting = await (0, generalSettings_model_1.createGeneralSetting)({
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
            const invoiceSetting = await (0, invoiceSettings_model_1.createInvoiceSetting)({
                tenantId: req.tenantId,
                format: parsedInvoiceData.format,
                nextNumber: parsedInvoiceData.nextNumber,
                resetYearly: parsedInvoiceData.resetYearly,
                lastResetYear: parsedInvoiceData.lastResetYear,
                padding: parsedInvoiceData.padding,
                createdBy: req.user.id,
            });
            // Create payment setting
            const paymentSetting = await (0, paymentSettings_model_1.createPaymentSetting)({
                tenantId: req.tenantId,
                bankName: payment.bankName || '',
                accountNumber: payment.accountNumber || '',
                ifscCode: payment.ifscCode || '',
                branchName: payment.branchName || '',
                qrCode: payment.qrCode,
                createdBy: req.user.id,
            });
            // Create settings profile
            const newProfile = await (0, settingsProfile_model_1.createSettingsProfile)({
                tenantId: req.tenantId,
                name,
                isActive: false,
                generalId: generalSetting.id,
                invoiceId: invoiceSetting.id,
                paymentId: paymentSetting.id,
                createdBy: req.user.id,
            });
            // Get the complete profile with relations
            const completeProfile = await (0, settingsProfile_model_1.getSettingsProfileById)(newProfile.id, req.tenantId);
            res.status(201).json({
                success: true,
                data: completeProfile,
                message: 'Profile created successfully'
            });
        }
        catch (error) {
            console.error('Create profile error:', error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({ success: false, error: error.message });
                return;
            }
            res.status(500).json({ success: false, error: 'Failed to create profile' });
        }
    }
    static async updateProfile(req, res) {
        try {
            if (!req.tenantId || !req.user)
                throw new Error('Auth required');
            const { id } = req.params;
            const { name, general, invoice, payment } = req.body;
            // 1. Fetch existing profile to get foreign keys (generalId, invoiceId, etc.)
            const existing = await (0, settingsProfile_model_1.getSettingsProfileById)(id, req.tenantId);
            if (!existing) {
                res.status(404).json({ success: false, error: 'Profile not found' });
                return;
            }
            // 2. Update related settings if provided
            if (general) {
                await (0, generalSettings_model_1.updateGeneralSetting)(existing.generalId, req.tenantId, {
                    ...general,
                    gstin: general.gstin === "" ? null : general.gstin,
                    pan: general.pan === "" ? null : general.pan,
                    updatedBy: req.user.id,
                });
            }
            if (invoice) {
                await (0, invoiceSettings_model_1.updateInvoiceSetting)(existing.invoiceId, req.tenantId, {
                    ...invoice,
                    updatedBy: req.user.id,
                });
            }
            if (payment) {
                await (0, paymentSettings_model_1.updatePaymentSetting)(existing.paymentId, req.tenantId, {
                    ...payment,
                    updatedBy: req.user.id,
                });
            }
            // 3. Update the profile
            const updatedProfile = await (0, settingsProfile_model_1.updateSettingsProfile)(id, req.tenantId, {
                name,
                updatedBy: req.user.id,
            });
            // 4. Get the complete updated profile with relations
            const completeProfile = await (0, settingsProfile_model_1.getSettingsProfileById)(id, req.tenantId);
            res.status(200).json({ success: true, data: completeProfile });
        }
        catch (error) {
            console.error(error);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
    }
    static async hardDeleteProfile(req, res) {
        try {
            if (!req.tenantId)
                throw new types_1.ValidationError('Tenant context required');
            const { id } = req.params;
            // 1. Fetch the profile to verify it exists
            const profile = await (0, settingsProfile_model_1.getSettingsProfileById)(id, req.tenantId);
            if (!profile)
                throw new types_1.NotFoundError('Profile not found');
            // 2. Delete the profile (cascade will handle related settings due to ON DELETE CASCADE)
            const success = await (0, settingsProfile_model_1.deleteSettingsProfile)(id, req.tenantId);
            if (!success) {
                throw new Error('Failed to delete profile');
            }
            res.status(200).json({ success: true, message: 'Profile deleted permanently' });
        }
        catch (error) {
            console.error('Hard delete error:', error);
            res.status(500).json({ success: false, error: 'Failed to delete profile' });
        }
    }
    // ===================== ACTIVATE PROFILE =====================
    static async activateProfile(req, res) {
        try {
            if (!req.tenantId || !req.user)
                throw new types_1.ValidationError('Tenant context required');
            const { id } = req.params;
            // 1. Read the boolean state from the body (sent from frontend)
            const { isActive } = req.body;
            // 2. Update the profile status
            const updatedProfile = await (0, settingsProfile_model_1.updateSettingsProfile)(id, req.tenantId, {
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
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to update status' });
        }
    }
    static async getActiveProfiles(req, res) {
        try {
            if (!req.tenantId)
                throw new types_1.ValidationError('Tenant context required');
            const activeProfiles = await (0, settingsProfile_model_1.getAllActiveSettingsProfiles)(req.tenantId);
            const sanitized = activeProfiles.map(profile => InvoiceSettingsController.sanitizeProfile(profile));
            res.status(200).json({ success: true, data: sanitized });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to fetch active profiles' });
        }
    }
}
exports.InvoiceSettingsController = InvoiceSettingsController;
exports.default = InvoiceSettingsController;
//# sourceMappingURL=InvoiceSettingsController.js.map