"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceSettingsController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
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
    // ===================== GET ALL PROFILES =====================
    static async getProfiles(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: 'Tenant context required' });
                return;
            }
            const { page = 1, limit = 20, isActive = 'all', search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
            const where = { tenantId: req.tenantId };
            if (isActive !== 'all')
                where.isActive = isActive === 'true';
            if (search)
                where.name = { contains: search, mode: 'insensitive' };
            const orderBy = { [sortBy]: sortOrder === 'desc' ? 'desc' : 'asc' };
            const skip = (Number(page) - 1) * Number(limit);
            const [profiles, total] = await Promise.all([
                database_1.prisma.settingsProfile.findMany({
                    where,
                    orderBy,
                    skip,
                    take: Number(limit),
                    include: {
                        general: true,
                        invoice: true,
                        payment: true,
                        createdByUser: { select: { name: true } }
                    }
                }),
                database_1.prisma.settingsProfile.count({ where })
            ]);
            const totalPages = Math.ceil(total / Number(limit));
            res.status(200).json({
                success: true,
                data: profiles,
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
            const profile = await database_1.prisma.settingsProfile.findFirst({
                where: { id, tenantId: req.tenantId },
                include: {
                    general: true,
                    invoice: true,
                    payment: true
                }
            });
            if (!profile)
                throw new types_1.NotFoundError('Profile not found');
            res.status(200).json({ success: true, data: profile });
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
            const newProfile = await database_1.prisma.settingsProfile.create({
                data: {
                    name,
                    isActive: false,
                    tenant: { connect: { id: req.tenantId } },
                    createdByUser: { connect: { id: req.user.id } },
                    general: {
                        create: {
                            ...general,
                            gstin: general.gstin === "" ? null : general.gstin,
                            pan: general.pan === "" ? null : general.pan,
                            tenant: { connect: { id: req.tenantId } },
                            createdByUser: { connect: { id: req.user.id } },
                        }
                    },
                    invoice: {
                        create: {
                            ...parsedInvoiceData, // This now contains dynamic padding, resetYearly, etc.
                            tenant: { connect: { id: req.tenantId } },
                            createdByUser: { connect: { id: req.user.id } },
                        }
                    },
                    payment: {
                        create: {
                            ...payment,
                            tenant: { connect: { id: req.tenantId } },
                            createdByUser: { connect: { id: req.user.id } },
                        }
                    },
                },
                include: {
                    general: true,
                    invoice: true,
                    payment: true
                }
            });
            res.status(201).json({
                success: true,
                data: newProfile,
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
            const existing = await database_1.prisma.settingsProfile.findFirst({
                where: { id, tenantId: req.tenantId }
            });
            if (!existing) {
                res.status(404).json({ success: false, error: 'Profile not found' });
                return;
            }
            // 2. Perform the update with explicit 'where' for children
            const updatedProfile = await database_1.prisma.settingsProfile.update({
                where: { id },
                data: {
                    name,
                    updatedByUser: { connect: { id: req.user.id } },
                    // Update General Settings
                    general: general ? {
                        update: {
                            where: { id: existing.generalId },
                            data: {
                                ...general,
                                gstin: general.gstin === "" ? null : general.gstin,
                                pan: general.pan === "" ? null : general.pan,
                                id: undefined, // Strip ID so Prisma doesn't try to overwrite PK
                                tenantId: undefined,
                                updatedByUser: { connect: { id: req.user.id } }
                            }
                        }
                    } : undefined,
                    // Update Invoice Settings
                    invoice: invoice ? {
                        update: {
                            where: { id: existing.invoiceId },
                            data: {
                                ...invoice,
                                id: undefined,
                                tenantId: undefined,
                                updatedByUser: { connect: { id: req.user.id } }
                            }
                        }
                    } : undefined,
                    // Update Payment Settings
                    payment: payment ? {
                        update: {
                            where: { id: existing.paymentId },
                            data: {
                                ...payment,
                                id: undefined,
                                tenantId: undefined,
                                updatedByUser: { connect: { id: req.user.id } }
                            }
                        }
                    } : undefined,
                },
                include: { general: true, invoice: true, payment: true }
            });
            res.status(200).json({ success: true, data: updatedProfile });
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
            // 1. Fetch the profile to get the IDs of the related settings
            const profile = await database_1.prisma.settingsProfile.findFirst({
                where: { id, tenantId: req.tenantId }
            });
            if (!profile)
                throw new types_1.NotFoundError('Profile not found');
            // 2. Transaction: Delete Parent first, then orphaned Children
            // This prevents foreign key constraint violations
            await database_1.prisma.$transaction([
                database_1.prisma.settingsProfile.delete({ where: { id: profile.id } }),
                database_1.prisma.generalSetting.delete({ where: { id: profile.generalId } }),
                database_1.prisma.invoiceSetting.delete({ where: { id: profile.invoiceId } }),
                database_1.prisma.paymentSetting.delete({ where: { id: profile.paymentId } }),
            ]);
            res.status(200).json({ success: true, message: 'Profile deleted permanently' });
        }
        catch (error) {
            // Log the actual Prisma error to your server terminal to see the code (e.g., P2003)
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
            // 2. Perform a single update ONLY on the targeted profile
            const updatedProfile = await database_1.prisma.settingsProfile.update({
                where: { id, tenantId: req.tenantId },
                data: {
                    isActive: isActive,
                    updatedByUser: { connect: { id: req.user.id } }
                }
            });
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
            const activeProfiles = await database_1.prisma.settingsProfile.findMany({
                where: {
                    tenantId: req.tenantId,
                    isActive: true // <--- The filter
                },
                include: {
                    general: true,
                    invoice: true,
                    payment: true
                }
            });
            res.status(200).json({ success: true, data: activeProfiles });
        }
        catch (error) {
            res.status(500).json({ success: false, error: 'Failed to fetch active profiles' });
        }
    }
}
exports.InvoiceSettingsController = InvoiceSettingsController;
exports.default = InvoiceSettingsController;
//# sourceMappingURL=InvoiceSettingsController.js.map