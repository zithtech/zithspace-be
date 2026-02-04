import { Response } from 'express';
import { prisma } from '@/config/database';
import { AuthRequest } from '@/types';

export class CompanyGovernmentHolidayController {
  // Create a new holiday
  static async create(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const userId = req.user?.id;
      
      if (!tenantId || !userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const {
        holidayName,
        country,
        fromDate,
        toDate,
        baseLeave,
        extraLeave,
        totalLeave,
        type,
        isFloater,
        rule,
        status
      } = req.body;

      const holiday = await prisma.companyGovernmentHoliday.create({
        data: {
          tenantId,
          createdById: userId,
          holidayName,
          country,
          fromDate: new Date(fromDate),
          toDate: new Date(toDate),
          baseLeave: Number(baseLeave),
          extraLeave: Number(extraLeave),
          totalLeave: Number(totalLeave),
          type,
          isFloater: Boolean(isFloater),
          rule,
          status: status || 'ACTIVE',
        },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });

      return res.status(201).json({ success: true, message: "Holiday created successfully", data: holiday });
    } catch (error) {
      console.error('Error creating holiday:', error);
      return res.status(500).json({ message: 'Internal server error', error });
    }
  }

  // Get all holidays for the tenant
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;

      if (!tenantId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const holidays = await prisma.companyGovernmentHoliday.findMany({
        where: { tenantId },
        orderBy: { fromDate: 'asc' },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });

      return res.status(200).json({ success: true, data: holidays });
    } catch (error) {
      console.error('Error fetching holidays:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Get a single holiday by ID
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const holiday = await prisma.companyGovernmentHoliday.findFirst({
        where: { id, tenantId },
      });

      if (!holiday) {
        return res.status(404).json({ message: 'Holiday not found' });
      }

      return res.status(200).json({ success: true, data: holiday });
    } catch (error) {
      console.error('Error fetching holiday:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Update a holiday
  static async update(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const userId = req.user?.id;
      const { id } = req.params;
      const data = req.body;

      if (!tenantId || !userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Ensure the holiday belongs to the tenant before updating
      const existing = await prisma.companyGovernmentHoliday.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return res.status(404).json({ message: 'Holiday not found' });
      }

      // Format dates if present in update data
      if (data.fromDate) data.fromDate = new Date(data.fromDate);
      if (data.toDate) data.toDate = new Date(data.toDate);

      const updatedHoliday = await prisma.companyGovernmentHoliday.update({
        where: { id },
        data: {
          ...data,
          updatedById: userId,
        },
      });

      return res.status(200).json({ success: true, data: updatedHoliday });
    } catch (error) {
      console.error('Error updating holiday:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Delete a holiday
  static async delete(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const existing = await prisma.companyGovernmentHoliday.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return res.status(404).json({ message: 'Holiday not found' });
      }

      await prisma.companyGovernmentHoliday.delete({
        where: { id },
      });

      return res.status(200).json({ success: true, message: 'Holiday deleted successfully' });
    } catch (error) {
      console.error('Error deleting holiday:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}
