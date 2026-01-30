import { Response } from 'express';
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from '@/types';

export class InvoiceSettingsController {

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

      const where: any = { tenantId: req.tenantId };
      if (isActive !== 'all') where.isActive = isActive === 'true';
      if (search) where.name = { contains: search as string, mode: 'insensitive' };

      const orderBy: any = { [sortBy as string]: sortOrder === 'desc' ? 'desc' : 'asc' };
      const skip = (Number(page) - 1) * Number(limit);

      const [profiles, total] = await Promise.all([
        prisma.settingsProfile.findMany({ 
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
        prisma.settingsProfile.count({ where })
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
      const profile = await prisma.settingsProfile.findFirst({ 
        where: { id, tenantId: req.tenantId },
        include: {
          general: true,
          invoice: true,
          payment: true
        }
      });
      
      if (!profile) throw new NotFoundError('Profile not found');

      res.status(200).json({ success: true, data: profile } as ApiResponse);

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

  // ===================== CREATE PROFILE =====================
  // static async createProfile(req: AuthRequest, res: Response): Promise<void> {
  //   try {
  //     if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

  //     const { name, general, invoice, payment } = req.body;
  //     if (!name) throw new ValidationError('Profile name is required');

  //     // Note: We use nested 'create' for relations because the IDs (generalId, etc) 
  //     // are required in your schema. This creates the profile and settings in one transaction.
  //     const newProfile = await prisma.settingsProfile.create({
  //       data: {
  //         name,
  //         isActive: false,
  //         tenant: { connect: { id: req.tenantId } },
  //         createdByUser: { connect: { id: req.user.id } },
  //         general: { create: general || {} },
  //         invoice: { create: invoice || {} },
  //         payment: { create: payment || {} },
  //       },
  //       include: {
  //         general: true,
  //         invoice: true,
  //         payment: true
  //       }
  //     });

  //     res.status(201).json({ success: true, data: newProfile, message: 'Profile created successfully' } as ApiResponse);

  //   } catch (error: any) {
  //     console.error('Create profile error:', error);
  //     if (error instanceof ValidationError) {
  //       res.status(400).json({ success: false, error: error.message });
  //       return;
  //     }
  //     res.status(500).json({ success: false, error: 'Failed to create profile' });
  //   }
  // }

  static async createProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

    const { name, general = {}, invoice = {}, payment = {} } = req.body;
    if (!name) throw new ValidationError('Profile name is required');

    // Create profile with nested settings, connecting all required relations
    const newProfile = await prisma.settingsProfile.create({
      data: {
        name,
        isActive: false,
        tenant: { connect: { id: req.tenantId } }, // profile -> tenant
        createdByUser: { connect: { id: req.user.id } },

        general: {
          create: {
            ...general,
            tenant: { connect: { id: req.tenantId } }, // general -> tenant
            createdByUser: { connect: { id: req.user.id } },
          }
        },

        invoice: {
          create: {
            ...invoice,
            tenant: { connect: { id: req.tenantId } }, // invoice -> tenant
            createdByUser: { connect: { id: req.user.id } },
          }
        },

        payment: {
          create: {
            ...payment,
            tenant: { connect: { id: req.tenantId } }, // payment -> tenant
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
    } as ApiResponse);

  } catch (error: any) {
    console.error('Create profile error:', error);
    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Failed to create profile' });
  }
}


  // ===================== UPDATE PROFILE =====================
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      const { name, general, invoice, payment } = req.body;

      const existing = await prisma.settingsProfile.findFirst({ where: { id, tenantId: req.tenantId } });
      if (!existing) throw new NotFoundError('Profile not found');

      const updatedProfile = await prisma.settingsProfile.update({
        where: { id },
        data: { 
          name,
          updatedByUser: { connect: { id: req.user.id } },
          // Using nested update to modify related tables
          general: general ? { update: general } : undefined,
          invoice: invoice ? { update: invoice } : undefined,
          payment: payment ? { update: payment } : undefined,
        },
        include: {
          general: true,
          invoice: true,
          payment: true
        }
      });

      res.status(200).json({ success: true, data: updatedProfile, message: 'Profile updated successfully' } as ApiResponse);

    } catch (error: any) {
      console.error('Update profile error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
  }

  

  // ===================== DELETE (DEACTIVATE) PROFILE =====================
  // static async deleteProfile(req: AuthRequest, res: Response): Promise<void> {
  //   try {
  //     if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

  //     const { id } = req.params;
  //     const existing = await prisma.settingsProfile.findFirst({ where: { id, tenantId: req.tenantId } });
  //     if (!existing) throw new NotFoundError('Profile not found');

  //     const deletedProfile = await prisma.settingsProfile.update({
  //       where: { id },
  //       data: { 
  //         isActive: false, 
  //         updatedByUser: { connect: { id: req.user.id } }
  //       }
  //     });

  //     res.status(200).json({ success: true, data: deletedProfile, message: 'Profile deactivated successfully' } as ApiResponse);

  //   } catch (error: any) {
  //     console.error('Delete profile error:', error);
  //     if (error instanceof NotFoundError) {
  //       res.status(404).json({ success: false, error: error.message });
  //       return;
  //     }
  //     res.status(500).json({ success: false, error: 'Failed to deactivate profile' });
  //   }
  // }

  // ===================== HARD DELETE PROFILE =====================
// static async hardDeleteProfile(req: AuthRequest, res: Response): Promise<void> {
//   try {
//     if (!req.tenantId || !req.user) {
//       throw new ValidationError('Tenant context required');
//     }

//     const { id } = req.params;

//     const profile = await prisma.settingsProfile.findFirst({
//       where: { id, tenantId: req.tenantId },
//       include: {
//         general: true,
//         invoice: true,
//         payment: true,
//       },
//     });

//     if (!profile) throw new NotFoundError('Profile not found');

//     await prisma.$transaction([
//       prisma.generalSetting.delete({ where: { id: profile.generalId } }),
//       prisma.invoiceSetting.delete({ where: { id: profile.invoiceId } }),
//       prisma.paymentSetting.delete({ where: { id: profile.paymentId } }),
//       prisma.settingsProfile.delete({ where: { id } }),
//     ]);

//     res.status(200).json({
//       success: true,
//       message: 'Profile deleted permanently',
//     } as ApiResponse);

//   } catch (error: any) {
//     console.error('Hard delete error:', error);

//     if (error instanceof NotFoundError) {
//       res.status(404).json({ success: false, error: error.message });
//       return;
//     }

//     res.status(500).json({
//       success: false,
//       error: 'Failed to delete profile',
//     });
//   }
// }

// ===================== HARD DELETE PROFILE =====================
static async hardDeleteProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId) throw new ValidationError('Tenant context required');
    const { id } = req.params;

    // 1. Fetch the profile to get the IDs of the related settings
    const profile = await prisma.settingsProfile.findFirst({
      where: { id, tenantId: req.tenantId }
    });

    if (!profile) throw new NotFoundError('Profile not found');

    // 2. Transaction: Delete Parent first, then orphaned Children
    // This prevents foreign key constraint violations
    await prisma.$transaction([
      prisma.settingsProfile.delete({ where: { id: profile.id } }),
      prisma.generalSetting.delete({ where: { id: profile.generalId } }),
      prisma.invoiceSetting.delete({ where: { id: profile.invoiceId } }),
      prisma.paymentSetting.delete({ where: { id: profile.paymentId } }),
    ]);

    res.status(200).json({ success: true, message: 'Profile deleted permanently' });

  } catch (error: any) {
    // Log the actual Prisma error to your server terminal to see the code (e.g., P2003)
    console.error('Hard delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete profile' });
  }
}


  // ===================== ACTIVATE PROFILE =====================
  static async activateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) throw new ValidationError('Tenant context required');

      const { id } = req.params;
      const profile = await prisma.settingsProfile.findFirst({ where: { id, tenantId: req.tenantId } });
      if (!profile) throw new NotFoundError('Profile not found');

      // Transaction to ensure only one profile is active at a time
      const [activatedProfile] = await prisma.$transaction([
        prisma.settingsProfile.update({
          where: { id },
          data: { isActive: true, updatedByUser: { connect: { id: req.user.id } } }
        }),
        prisma.settingsProfile.updateMany({
          where: { 
            tenantId: req.tenantId, 
            id: { not: id }, 
            isActive: true 
          },
          data: { isActive: false }
        })
      ]);

      res.status(200).json({ success: true, data: activatedProfile, message: 'Profile activated successfully' } as ApiResponse);

    } catch (error: any) {
      console.error('Activate profile error:', error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to activate profile' });
    }
  }
}

export default InvoiceSettingsController;