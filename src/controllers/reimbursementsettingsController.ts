// import { Response } from "express";
// import { prisma } from "@/config/database";
// import {
//   AuthRequest,
//   ApiResponse,
//   NotFoundError,
//   ValidationError,
// } from "@/types";

// export class ReimbursementSettingsCategoriesController {
//   /**
//    * CREATE CATEGORY
//    */
//   static async createCategory(
//     req: AuthRequest,
//     res: Response
//   ): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context and authentication required");

//       const {
//         name,
//         code,
//         maxRequestsPerMonth,
//         attachmentRequired,
//         isActive,
//       } = req.body;

//       if (!name || !code)
//         throw new ValidationError("Name and Code are required");

//       const category = await prisma.reimbursementCategory.create({
//         data: {
//           tenantId: req.tenantId,
//           name,
//           code,
//           maxRequestsPerMonth,
//           attachmentRequired: attachmentRequired ?? false,
//           isActive: isActive ?? true,
//           createdBy: req.user.id,
//         },
//       });

//       res.status(201).json({
//         success: true,
//         data: category,
//       } as ApiResponse);
//     } catch (error: any) {
//       res.status(error instanceof ValidationError ? 400 : 500).json({
//         success: false,
//         error: error.message,
//       } as ApiResponse);
//     }
//   }

//   /**
//    * GET ALL CATEGORIES
//    */
//   static async getCategories(
//     req: AuthRequest,
//     res: Response
//   ): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context and authentication required");

//       const categories = await prisma.reimbursementCategory.findMany({
//         where: { tenantId: req.tenantId },
//         orderBy: { createdAt: "desc" },
//         select: {
//           id: true,
//           name: true,
//           code: true,
//           maxRequestsPerMonth: true,
//           attachmentRequired: true,
//           isActive: true,
//         },
//       });

//       res.status(200).json({
//         success: true,
//         data: categories,
//       } as ApiResponse);
//     } catch (error: any) {
//       res.status(500).json({
//         success: false,
//         error: "Failed to fetch categories",
//       } as ApiResponse);
//     }
//   }

//   /**
//    * GET BY ID
//    */
//   static async getCategoryById(
//     req: AuthRequest,
//     res: Response
//   ): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context and authentication required");

//       const { id } = req.params;

//       const category = await prisma.reimbursementCategory.findFirst({
//         where: { id, tenantId: req.tenantId },
//       });

//       if (!category) throw new NotFoundError("Category not found");

//       res.status(200).json({
//         success: true,
//         data: category,
//       } as ApiResponse);
//     } catch (error: any) {
//       res
//         .status(error instanceof NotFoundError ? 404 : 500)
//         .json({ success: false, error: error.message } as ApiResponse);
//     }
//   }

//   /**
//    * UPDATE CATEGORY
//    */
//   static async updateCategory(
//     req: AuthRequest,
//     res: Response
//   ): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context and authentication required");

//       const { id } = req.params;
//       const {
//         name,
//         code,
//         maxRequestsPerMonth,
//         attachmentRequired,
//         isActive,
//       } = req.body;

//       const existing = await prisma.reimbursementCategory.findFirst({
//         where: { id, tenantId: req.tenantId },
//       });

//       if (!existing) throw new NotFoundError("Category not found");

//       const updated = await prisma.reimbursementCategory.update({
//         where: { id },
//         data: {
//           name,
//           code,
//           maxRequestsPerMonth,
//           attachmentRequired,
//           isActive,
//           updatedBy: req.user.id,
//         },
//       });

//       res.status(200).json({
//         success: true,
//         data: updated,
//         message: "Category updated successfully",
//       } as ApiResponse);
//     } catch (error: any) {
//       res
//         .status(
//           error instanceof ValidationError
//             ? 400
//             : error instanceof NotFoundError
//             ? 404
//             : 500
//         )
//         .json({ success: false, error: error.message } as ApiResponse);
//     }
//   }

//   /**
//    * DELETE CATEGORY
//    */
//   static async deleteCategory(
//     req: AuthRequest,
//     res: Response
//   ): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId)
//         throw new ValidationError("Tenant context and authentication required");

//       const { id } = req.params;

//       const existing = await prisma.reimbursementCategory.findFirst({
//         where: { id, tenantId: req.tenantId },
//       });

//       if (!existing) throw new NotFoundError("Category not found");

//       await prisma.reimbursementCategory.delete({
//         where: { id },
//       });

//       res.status(200).json({
//         success: true,
//         message: "Category deleted successfully",
//       } as ApiResponse);
//     } catch (error: any) {
//       res
//         .status(error instanceof NotFoundError ? 404 : 500)
//         .json({ success: false, error: error.message } as ApiResponse);
//     }
//   }
// }

// export default ReimbursementSettingsCategoriesController;



import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class ReimbursementSettingsCategoriesController {
  /**
   * CREATE CATEGORY
   */
  static async createCategory(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const {
        name,
        code,
        description,        // 👈 changed from maxRequestsPerMonth
        attachmentRequired,
        isActive,
      } = req.body;

      if (!name || !code)
        throw new ValidationError("Name and Code are required");

      const category = await prisma.reimbursementCategory.create({
        data: {
          tenantId: req.tenantId,
          name,
          code,
          description,        // 👈 new field
          attachmentRequired: attachmentRequired ?? false,
          isActive: isActive ?? true,
          createdBy: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: category,
      } as ApiResponse);
    } catch (error: any) {
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message,
      } as ApiResponse);
    }
  }

  /**
   * GET ALL CATEGORIES
   */
  static async getCategories(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const categories = await prisma.reimbursementCategory.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,      // 👈 changed
          attachmentRequired: true,
          isActive: true,
        },
      });

      res.status(200).json({
        success: true,
        data: categories,
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch categories",
      } as ApiResponse);
    }
  }

  /**
   * GET BY ID
   */
  static async getCategoryById(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const category = await prisma.reimbursementCategory.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!category) throw new NotFoundError("Category not found");

      res.status(200).json({
        success: true,
        data: category,
      } as ApiResponse);
    } catch (error: any) {
      res
        .status(error instanceof NotFoundError ? 404 : 500)
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * UPDATE CATEGORY
   */
  static async updateCategory(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;
      const {
        name,
        code,
        description,        // 👈 changed
        attachmentRequired,
        isActive,
      } = req.body;

      const existing = await prisma.reimbursementCategory.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) throw new NotFoundError("Category not found");

      const updated = await prisma.reimbursementCategory.update({
        where: { id },
        data: {
          name,
          code,
          description,        // 👈 new field
          attachmentRequired,
          isActive,
          updatedBy: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Category updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      res
        .status(
          error instanceof ValidationError
            ? 400
            : error instanceof NotFoundError
            ? 404
            : 500
        )
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }

  /**
   * DELETE CATEGORY
   */
  static async deleteCategory(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user || !req.tenantId)
        throw new ValidationError("Tenant context and authentication required");

      const { id } = req.params;

      const existing = await prisma.reimbursementCategory.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) throw new NotFoundError("Category not found");

      await prisma.reimbursementCategory.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      res
        .status(error instanceof NotFoundError ? 404 : 500)
        .json({ success: false, error: error.message } as ApiResponse);
    }
  }
}

export default ReimbursementSettingsCategoriesController;