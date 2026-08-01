import { Response } from 'express';
import { AuthRequest } from '../types';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DocumentStructureController {
  static async getStructures(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const structures = await prisma.documentStructure.findMany({
        where: { tenantId: { in: [tenantId, 'GLOBAL'] } },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: structures,
      });
    } catch (error: any) {
      console.error('Error fetching document structures:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  static async createStructure(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user?.id!;
      const { name, htmlContent } = req.body;

      if (!name || !htmlContent) {
        return res.status(400).json({
          success: false,
          message: 'Name and HTML content are required',
        });
      }

      const structure = await prisma.documentStructure.create({
        data: {
          name,
          htmlContent,
          tenantId,
          createdById: userId,
        },
      });

      return res.status(201).json({
        success: true,
        data: structure,
      });
    } catch (error: any) {
      console.error('Error creating document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }
  static async updateStructure(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const { name, htmlContent } = req.body;

      if (!name || !htmlContent) {
        return res.status(400).json({
          success: false,
          message: 'Name and HTML content are required',
        });
      }

      const existing = await prisma.documentStructure.findUnique({
        where: { id },
      });

      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({
          success: false,
          message: 'Structure not found or you do not have permission',
        });
      }

      if (existing.tenantId === 'GLOBAL') {
        return res.status(403).json({
          success: false,
          message: 'Global structures cannot be edited',
        });
      }

      const updated = await prisma.documentStructure.update({
        where: { id },
        data: { name, htmlContent },
      });

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error: any) {
      console.error('Error updating document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  static async deleteStructure(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const existing = await prisma.documentStructure.findUnique({
        where: { id },
      });

      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({
          success: false,
          message: 'Structure not found or you do not have permission',
        });
      }

      if (existing.tenantId === 'GLOBAL') {
        return res.status(403).json({
          success: false,
          message: 'Global structures cannot be deleted',
        });
      }

      await prisma.documentStructure.delete({
        where: { id },
      });

      return res.status(200).json({
        success: true,
        message: 'Structure deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  static async getStructureById(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const structure = await prisma.documentStructure.findUnique({
        where: { id },
      });

      if (!structure || (structure.tenantId !== tenantId && structure.tenantId !== 'GLOBAL')) {
        return res.status(404).json({
          success: false,
          message: 'Structure not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: structure,
      });
    } catch (error: any) {
      console.error('Error fetching document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }
}
