import { Response } from 'express';
import { prisma } from "@/config/database";
import { 
  AuthRequest, 
  ApiResponse
} from '@/types';

export class UserPreferenceController {
  /**
   * Get user preferences
   * @route GET /api/user/preferences
   */
  static async getPreferences(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;

      let preferences = await prisma.userPreference.findUnique({
        where: { userId },
      });

      // If no preferences exist, return defaults
      if (!preferences) {
        res.status(200).json({
          success: true,
          data: {
            sidebarCollapsed: true // Default value
          }
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          sidebarCollapsed: preferences.sidebarCollapsed
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Get preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch preferences'
      } as ApiResponse);
    }
  }

  /**
   * Update user preferences
   * @route PATCH /api/user/preferences
   */
  static async updatePreferences(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;
      const { sidebarCollapsed } = req.body;

      if (sidebarCollapsed === undefined) {
        res.status(400).json({
          success: false,
          error: 'sidebarCollapsed preference is required'
        } as ApiResponse);
        return;
      }

      const preferences = await prisma.userPreference.upsert({
        where: { userId },
        update: {
          sidebarCollapsed,
          updatedAt: new Date(),
        },
        create: {
          userId,
          tenantId: req.tenantId,
          sidebarCollapsed,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          sidebarCollapsed: preferences.sidebarCollapsed
        },
        message: 'Preferences updated successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Update preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update preferences'
      } as ApiResponse);
    }
  }
}
