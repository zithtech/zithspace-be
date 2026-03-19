import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class MailTemplateController {
  /** =========================
   * GET ALL MAIL TEMPLATES
   ========================== */
  static async getAllMailTemplates(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const { search, module, status } = req.query;
      const tenantId = req.tenantId;

      if (!tenantId) {
        throw new ValidationError("Tenant ID is required");
      }

      const where: any = {
        tenantId,
      };

      if (module) {
        where.module = module;
      }

      if (status !== undefined) {
        where.status = status === "true" || status === "active" || status === "Active";
      }

      if (search) {
        where.OR = [
          {
            templateName: {
              contains: search as string,
              mode: "insensitive",
            },
          },
          {
            subject: {
              contains: search as string,
              mode: "insensitive",
            },
          },
        ];
      }

      const [templates, total] = await Promise.all([
        prisma.emailTemplate.findMany({
          where,
          skip,
          take: limit,
          orderBy: { updatedAt: "desc" },
        }),
        prisma.emailTemplate.count({ where }),
      ]);

      res.json({
        success: true,
        data: templates,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /** =========================
   * GET MAIL TEMPLATE BY ID
   ========================== */
  static async getMailTemplateById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!id) {
        throw new ValidationError("Template ID is required");
      }

      const template = await prisma.emailTemplate.findFirst({
        where: {
          id,
          tenantId,
        },
      });

      if (!template) {
        throw new NotFoundError("Email template not found");
      }

      res.json({
        success: true,
        data: template,
      } as ApiResponse);
    } catch (error) {
      throw error;
    }
  }

  /** =========================
   * CREATE MAIL TEMPLATE
   ========================== */
  static async createMailTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        templateName,
        module,
        triggerEvent,
        description,
        subject,
        emailBody,
        status,
      } = req.body;
      const tenantId = req.tenantId;
      const userId = req.user?.id;

      if (!tenantId) {
        throw new ValidationError("Tenant ID is required");
      }

      if (!templateName || !subject || !emailBody) {
        throw new ValidationError("Template name, subject, and email body are required");
      }

      if (!userId) {
        throw new ValidationError("User ID is required");
      }

      const template = await prisma.emailTemplate.create({
        data: {
          tenantId,
          templateName,
          module,
          triggerEvent,
          description,
          subject,
          emailBody,
          status: status ?? true,
          createdById: userId,
        },
      });

      res.status(201).json({
        success: true,
        data: template,
        message: "Mail template created successfully",
      } as ApiResponse);
    } catch (error) {
      throw error;
    }
  }

  /** =========================
   * UPDATE MAIL TEMPLATE
   ========================== */
  static async updateMailTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        templateName,
        module,
        triggerEvent,
        description,
        subject,
        emailBody,
        status,
      } = req.body;
      const tenantId = req.tenantId;
      const userId = req.user?.id;

      if (!id) {
        throw new ValidationError("Template ID is required");
      }

      const existing = await prisma.emailTemplate.findFirst({
        where: {
          id,
          tenantId,
        },
      });

      if (!existing) {
        throw new NotFoundError("Email template not found");
      }

      const updated = await prisma.emailTemplate.update({
        where: { id },
        data: {
          templateName,
          module,
          triggerEvent,
          description,
          subject,
          emailBody,
          status,
          updatedById: userId,
        },
      });

      res.json({
        success: true,
        data: updated,
        message: "Mail template updated successfully",
      } as ApiResponse);
    } catch (error) {
      throw error;
    }
  }

  /** =========================
   * DELETE MAIL TEMPLATE
   ========================== */
  static async deleteMailTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!id) {
        throw new ValidationError("Template ID is required");
      }

      const existing = await prisma.emailTemplate.findFirst({
        where: {
          id,
          tenantId,
        },
      });

      if (!existing) {
        throw new NotFoundError("Email template not found");
      }

      // Hard delete
      await prisma.emailTemplate.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: "Mail template deleted successfully",
      } as ApiResponse);
    } catch (error) {
      throw error;
    }
  }
}
