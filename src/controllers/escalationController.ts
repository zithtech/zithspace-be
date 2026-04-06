import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  ValidationError,
  NotFoundError,
} from "@/types";

export class EscalationController {
  /**
   * Create a new manual escalation
   */
  static async createEscalation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const {
        subject,
        description,
        categoryId,
        priorityId,
        projectId,
        statusId,
        targetMemberIds = [],
        ticketIds = [],
        attachments = [],
      } = req.body;

      if (!subject || !description || !categoryId || !priorityId) {
        throw new ValidationError("Missing required fields: subject, description, categoryId, priorityId");
      }

      // Create escalation with members in a transaction
      const escalation = await prisma.$transaction(async (tx) => {
        let finalStatusId = statusId;
        let statusName = "OPEN";

        // If statusId is not provided, find the default status for this tenant
        if (!finalStatusId) {
          const defaultStatus = await tx.escalationStatus.findFirst({
            where: { tenantId: req.tenantId!, isDefault: true }
          });
          if (defaultStatus) {
            finalStatusId = defaultStatus.id;
            statusName = defaultStatus.name;
          }
        } else {
          const customStatus = await tx.escalationStatus.findUnique({
            where: { id: finalStatusId }
          });
          if (customStatus) {
            statusName = customStatus.name;
          }
        }

        const newEscalation = await tx.escalation.create({
          data: {
            tenantId: req.tenantId!,
            subject,
            description,
            categoryId,
            priorityId,
            projectId,
            statusId: finalStatusId,
            status: statusName,
            createdById: req.user!.id,
            attachments: attachments as any,
            targetMembers: {
              create: targetMemberIds.map((userId: string) => ({
                userId,
              })),
            },
            tickets: {
              create: ticketIds.map((ticketId: string) => ({
                ticketId,
              })),
            },
          },
          include: {
            category: true,
            priority: true,
            escalationStatus: true,
            project: {
              select: { id: true, name: true, code: true }
            },
            tickets: {
              include: {
                ticket: {
                  select: { id: true, ticketNumber: true, title: true, status: true }
                }
              }
            },
            targetMembers: {
              include: {
                user: {
                  select: { id: true, name: true, workEmail: true, role: true, position: { select: { title: true } } }
                }
              }
            },
            createdBy: {
              select: { id: true, name: true, workEmail: true }
            }
          },
        });

        return newEscalation;
      });

      res.status(201).json({
        success: true,
        data: escalation,
        message: "Escalation created successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create escalation error:", error);
      if (error instanceof ValidationError) {
        res.status(400).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to create escalation",
      } as ApiResponse);
    }
  }

  /**
   * Get all escalations for the current tenant
   */
  static async getAllEscalations(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { status, categoryId, priorityId, projectId, userId, startDate, endDate } = req.query;
  
        const where: any = {
          tenantId: req.tenantId,
        };
  
        if (status) where.status = status;
        if (categoryId) where.categoryId = categoryId;
        if (priorityId) where.priorityId = priorityId;
        if (projectId) where.projectId = projectId;
  
        // Filter by user (either creator OR target member)
        if (userId) {
          where.OR = [
            { createdById: userId as string },
            { targetMembers: { some: { userId: userId as string } } }
          ];
        }
  
        // Filter by date range
        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) where.createdAt.gte = new Date(startDate as string);
          if (endDate) where.createdAt.lte = new Date(endDate as string);
        }

      const escalations = await prisma.escalation.findMany({
        where,
        include: {
          category: true,
          priority: true,
          escalationStatus: true,
          project: {
            select: { id: true, name: true, code: true }
          },
          tickets: {
            include: {
              ticket: {
                select: { id: true, ticketNumber: true, title: true, status: true }
              }
            }
          },
          targetMembers: {
            include: {
              user: {
                select: { id: true, name: true, workEmail: true, role: true, position: { select: { title: true } } }
              }
            }
          },
          createdBy: {
            select: { id: true, name: true, workEmail: true }
          }
        },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        success: true,
        data: escalations,
      } as ApiResponse);
    } catch (error) {
      console.error("Get all escalations error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch escalations",
      } as ApiResponse);
    }
  }

  /**
   * Get escalation by ID
   */
  static async getEscalationById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const escalation = await prisma.escalation.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
        include: {
          category: true,
          priority: true,
          escalationStatus: true,
          project: {
            select: { id: true, name: true, code: true }
          },
          tickets: {
            include: {
              ticket: {
                select: { id: true, ticketNumber: true, title: true, status: true }
              }
            }
          },
          targetMembers: {
            include: {
              user: {
                select: { id: true, name: true, workEmail: true, role: true, position: { select: { title: true } } }
              }
            }
          },
          createdBy: {
            select: { id: true, name: true, workEmail: true }
          }
        },
      });

      if (!escalation) {
        throw new NotFoundError("Escalation not found");
      }

      res.status(200).json({
        success: true,
        data: escalation,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get escalation by ID error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to fetch escalation details",
      } as ApiResponse);
    }
  }

  /**
   * Update escalation status
   */
  static async updateEscalationStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { status, statusId } = req.body;

      if (!status && !statusId) {
        throw new ValidationError("Status or Status ID is required");
      }

      const escalation = await prisma.escalation.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!escalation) {
        throw new NotFoundError("Escalation not found");
      }

      let updateData: any = { updatedAt: new Date() };
      
      if (statusId) {
        const customStatus = await prisma.escalationStatus.findUnique({
          where: { id: statusId }
        });
        if (customStatus) {
          updateData.statusId = statusId;
          updateData.status = customStatus.name;
        }
      } else if (status) {
        updateData.status = status;
      }

      const updatedEscalation = await prisma.escalation.update({
        where: { id },
        data: updateData,
        include: {
          escalationStatus: true,
          tickets: {
            include: {
              ticket: {
                select: { id: true, ticketNumber: true, title: true, status: true }
              }
            }
          }
        }
      });

      res.status(200).json({
        success: true,
        data: updatedEscalation,
        message: "Escalation status updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update escalation status error:", error);
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        res.status(error instanceof NotFoundError ? 404 : 400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to update escalation status",
      } as ApiResponse);
    }
  }

  /**
   * Delete escalation
   */
  static async deleteEscalation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const escalation = await prisma.escalation.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!escalation) {
        throw new NotFoundError("Escalation not found");
      }

      await prisma.escalation.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Escalation deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete escalation error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to delete escalation",
      } as ApiResponse);
    }
  }
}
