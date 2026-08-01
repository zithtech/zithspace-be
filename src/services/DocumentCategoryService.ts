import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const DEFAULT_CATEGORIES = [
  { categoryName: 'Offer Letter', description: 'Letters extended to selected candidates offering employment.' },
  { categoryName: 'Appointment Letter', description: 'Formal employment appointment documents.' },
  { categoryName: 'Experience Certificate', description: 'Certificates detailing past employment duration and roles.' },
  { categoryName: 'Promotion Letter', description: 'Letters detailing career advancement and new designations.' },
  { categoryName: 'Salary Revision Letter', description: 'Letters confirming compensation changes or increments.' },
  { categoryName: 'Legal Agreement', description: 'NDAs, non-compete, and other legal HR contracts.' },
  { categoryName: 'Relieving Letter', description: 'Formal acknowledgment of employee relieving from duties.' },
  { categoryName: 'Warning Letter', description: 'Formal disciplinary or warning notices.' },
  { categoryName: 'General HR Document', description: 'Miscellaneous organizational HR communications.' },
];

export class DocumentCategoryService {
  /**
   * Get all document categories for a tenant.
   * If none exist, automatically seed default HR categories.
   */
  static async getCategories(tenantId: string) {
    let categories = await prisma.documentCategory.findMany({
      where: { tenantId },
      orderBy: { categoryName: 'asc' },
    });

    if (categories.length === 0) {
      // Seed default categories
      await prisma.documentCategory.createMany({
        data: DEFAULT_CATEGORIES.map(c => ({
          ...c,
          tenantId,
          status: 'ACTIVE',
        })),
      });
      categories = await prisma.documentCategory.findMany({
        where: { tenantId },
        orderBy: { categoryName: 'asc' },
      });
    }

    return categories;
  }

  static async getCategoryById(tenantId: string, id: string) {
    return await prisma.documentCategory.findFirst({
      where: { id, tenantId },
    });
  }

  static async createCategory(tenantId: string, data: { categoryName: string; description?: string; status?: string }) {
    return await prisma.documentCategory.create({
      data: {
        tenantId,
        categoryName: data.categoryName,
        description: data.description || null,
        status: data.status || 'ACTIVE',
      },
    });
  }

  static async updateCategory(tenantId: string, id: string, data: { categoryName?: string; description?: string; status?: string }) {
    const existing = await prisma.documentCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new Error('Category not found');
    }
    return await prisma.documentCategory.update({
      where: { id },
      data,
    });
  }

  static async deleteCategory(tenantId: string, id: string) {
    const existing = await prisma.documentCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new Error('Category not found');
    }
    return await prisma.documentCategory.delete({
      where: { id },
    });
  }
}
