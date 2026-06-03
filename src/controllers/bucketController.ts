import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";
import { socketService } from "@/services/socketService";
import {
  recordTransaction,
  diffShallow,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from "@/utils/transactionHistory";
import { randomUUID } from "crypto";

export class BucketController {
  /**
   * Get all buckets for a tenant/project (tenant-aware)
   */
  static async getBuckets(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { projectId, includeShared = true } = req.query;

      // Build filter
      const where: any = {
        tenantId: req.tenantId,
      };

      if (projectId) {
        if (projectId === "null" || projectId === "cross-project") {
          // Cross-project buckets (projectId is null)
          where.projectId = null;
        } else {
          where.projectId = projectId;
        }
      }

      // Get buckets with ticket counts
      const buckets = await prisma.bucket.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, workEmail: true },
          },
          project: {
            select: { id: true, name: true, code: true },
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, workEmail: true },
              },
            },
          },
          _count: {
            select: { tickets: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Filter out shared buckets user doesn't have access to (if not shared)
      const filteredBuckets = buckets.filter((bucket) => {
        // Owner always has access
        if (bucket.createdById === req.user!.id) return true;

        // Non-shared buckets only visible to owner
        if (!bucket.isShared) return false;

        // Shared buckets visible to everyone in the tenant
        if (includeShared === "true" || includeShared === true) {
          return true;
        }

        return false;
      });

      res.status(200).json({
        success: true,
        data: filteredBuckets,
      } as ApiResponse);
    } catch (error) {
      console.error("Get buckets error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch buckets",
      } as ApiResponse);
    }
  }

  /**
   * Get paginated tickets in a bucket (tenant-aware)
   */
  static async getBucketTickets(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Verify bucket exists and user has access
      const bucket = await prisma.bucket.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
        include: {
          members: {
            select: { userId: true },
          },
        },
      });

      if (!bucket) {
        res.status(404).json({
          success: false,
          error: "Bucket not found",
        } as ApiResponse);
        return;
      }

      // Check access permissions
      const isOwner = bucket.createdById === req.user.id;

      if (!isOwner && !bucket.isShared) {
        res.status(403).json({
          success: false,
          error: "You do not have access to this bucket",
        } as ApiResponse);
        return;
      }

      // Get paginated tickets
      const skip = (Number(page) - 1) * Number(limit);

      const [tickets, total] = await Promise.all([
        prisma.ticket.findMany({
          where: {
            bucketId: id,
            tenantId: req.tenantId,
            isDeleted: false,
          },
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            status: true,
            priority: true,
            type: true,
            storyPoint: true,
            assignee: {
              select: { id: true, name: true, workEmail: true },
            },
            project: {
              select: { id: true, name: true, code: true },
            },
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: Number(limit),
        }),
        prisma.ticket.count({
          where: {
            bucketId: id,
            tenantId: req.tenantId,
            isDeleted: false,
          },
        }),
      ]);

      const totalPages = Math.ceil(total / Number(limit));

      res.status(200).json({
        success: true,
        data: {
          tickets,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: totalPages,
            hasNext: Number(page) < totalPages,
            hasPrev: Number(page) > 1,
          },
        },
      } as ApiResponse);
    } catch (error) {
      console.error("Get bucket tickets error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch bucket tickets",
      } as ApiResponse);
    }
  }

  /**
   * Get bucket by ID with detailed ticket information (tenant-aware)
   */
  static async getBucketById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const bucket = await prisma.bucket.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, workEmail: true },
          },
          project: {
            select: { id: true, name: true, code: true, description: true },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  position: true,
                },
              },
            },
          },
          tickets: {
            where: {
              isDeleted: false, // Exclude deleted tickets
            },
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
              priority: true,
              type: true,
              storyPoint: true,
              assignee: {
                select: { id: true, name: true, workEmail: true },
              },
              project: {
                select: { id: true, name: true, code: true },
              },
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!bucket) {
        throw new NotFoundError("Bucket not found");
      }

      // Check access permissions
      const isOwner = bucket.createdById === req.user.id;

      if (!isOwner && !bucket.isShared) {
        res.status(403).json({
          success: false,
          error: "You do not have access to this bucket",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: bucket,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get bucket by ID error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch bucket",
      } as ApiResponse);
    }
  }

  /**
   * Create a new bucket (tenant-aware)
   */
  static async createBucket(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const {
        name,
        description,
        color = "#6366f1",
        projectId = null,
        isShared = true,
      } = req.body;

      // Validate required fields
      if (!name || name.trim() === "") {
        res.status(400).json({
          success: false,
          error: "Bucket name is required",
        } as ApiResponse);
        return;
      }

      // Validate project if provided
      if (projectId) {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            tenantId: req.tenantId,
          },
        });

        if (!project) {
          throw new ValidationError("Project not found in this tenant");
        }
      }

      // Check for duplicate bucket name in same project/tenant
      const existingBucket = await prisma.bucket.findFirst({
        where: {
          tenantId: req.tenantId,
          projectId: projectId || null,
          name: name.trim(),
        },
      });

      if (existingBucket) {
        res.status(409).json({
          success: false,
          error: `A bucket named "${name}" already exists in this ${projectId ? "project" : "workspace"
            }`,
        } as ApiResponse);
        return;
      }

      // Create bucket
      const bucket = await prisma.bucket.create({
        data: {
          tenantId: req.tenantId,
          projectId: projectId || null,
          name: name.trim(),
          description: description?.trim() || null,
          color,
          isShared,
          createdById: req.user.id,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, workEmail: true },
          },
          project: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      // Emit socket event
      socketService.emitToTenant(req.tenantId, "bucket:created", bucket);

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUCKETS,
        page: Page.BUCKET_LIST,
        action: Action.CREATE,
        actionLabel: "Bucket created",
        entityType: EntityType.BUCKET,
        entityId: bucket.id,
        entityLabel: bucket.name,
        parentEntityType: bucket.projectId ? EntityType.PROJECT : null,
        parentEntityId: bucket.projectId ?? null,
        afterData: {
          name: bucket.name,
          description: bucket.description,
          color: bucket.color,
          isShared: bucket.isShared,
          projectId: bucket.projectId,
        },
        statusCode: 201,
      });

      res.status(201).json({
        success: true,
        data: bucket,
        message: "Bucket created successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create bucket error:", error);

      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to create bucket",
      } as ApiResponse);
    }
  }

  /**
   * Update bucket (tenant-aware)
   */
  static async updateBucket(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { name, description, color, isShared } = req.body;

      // Verify bucket exists and belongs to tenant
      const existingBucket = await prisma.bucket.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!existingBucket) {
        throw new NotFoundError("Bucket not found");
      }

      // Only owner can update bucket
      if (existingBucket.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "Only the bucket owner can update it",
        } as ApiResponse);
        return;
      }

      // Check for duplicate name if name is being changed
      if (name && name !== existingBucket.name) {
        const duplicateBucket = await prisma.bucket.findFirst({
          where: {
            tenantId: req.tenantId,
            projectId: existingBucket.projectId,
            name: name.trim(),
            id: { not: id },
          },
        });

        if (duplicateBucket) {
          res.status(409).json({
            success: false,
            error: `A bucket named "${name}" already exists in this ${existingBucket.projectId ? "project" : "workspace"
              }`,
          } as ApiResponse);
          return;
        }
      }

      // Update bucket
      const bucket = await prisma.bucket.update({
        where: { id },
        data: {
          name: name?.trim() || existingBucket.name,
          description:
            description !== undefined
              ? description?.trim()
              : existingBucket.description,
          color: color || existingBucket.color,
          isShared: isShared !== undefined ? isShared : existingBucket.isShared,
          updatedAt: new Date(),
        },
        include: {
          createdBy: {
            select: { id: true, name: true, workEmail: true },
          },
          project: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      // Emit socket event
      socketService.emitToTenant(req.tenantId, "bucket:updated", bucket);

      {
        const before = {
          name: existingBucket.name,
          description: existingBucket.description,
          color: existingBucket.color,
          isShared: existingBucket.isShared,
        };
        const after = {
          name: bucket.name,
          description: bucket.description,
          color: bucket.color,
          isShared: bucket.isShared,
        };
        const { changedFields, before: b, after: a } = diffShallow(before, after);
        if (changedFields.length > 0) {
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.BUCKETS,
            page: Page.BUCKET_DETAIL,
            action: Action.UPDATE,
            actionLabel: `Bucket updated (${changedFields.join(", ")})`,
            entityType: EntityType.BUCKET,
            entityId: id,
            entityLabel: bucket.name,
            parentEntityType: bucket.projectId ? EntityType.PROJECT : null,
            parentEntityId: bucket.projectId ?? null,
            beforeData: b,
            afterData: a,
            changedFields,
            statusCode: 200,
          });
        }
      }

      res.status(200).json({
        success: true,
        data: bucket,
        message: "Bucket updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update bucket error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to update bucket",
      } as ApiResponse);
    }
  }

  /**
   * Delete bucket (tenant-aware)
   * Removes bucket and unassigns all tickets from it
   */
  static async deleteBucket(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      // Verify bucket exists and belongs to tenant
      const bucket = await prisma.bucket.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!bucket) {
        throw new NotFoundError("Bucket not found");
      }

      // Anyone can delete the bucket (owner restriction removed)

      // Use transaction to ensure data consistency
      const ticketsUnassigned = await prisma.$transaction(async (tx) => {
        // Unassign all tickets from this bucket
        const unassign = await tx.ticket.updateMany({
          where: { bucketId: id },
          data: { bucketId: null },
        });

        // Delete bucket (cascade will delete members)
        await tx.bucket.delete({
          where: { id },
        });

        return unassign.count;
      });

      // Emit socket event
      socketService.emitToTenant(req.tenantId, "bucket:deleted", { id });

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUCKETS,
        page: Page.BUCKET_LIST,
        action: Action.DELETE,
        actionLabel: "Bucket deleted",
        entityType: EntityType.BUCKET,
        entityId: id,
        entityLabel: bucket.name,
        parentEntityType: bucket.projectId ? EntityType.PROJECT : null,
        parentEntityId: bucket.projectId ?? null,
        statusCode: 200,
        metadata: { hardDelete: true, ticketsUnassigned },
      });

      res.status(200).json({
        success: true,
        message: "Bucket deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete bucket error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to delete bucket",
      } as ApiResponse);
    }
  }

  /**
   * Add member to shared bucket (tenant-aware)
   */
  static async addBucketMember(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { userId, role = "member" } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: "User ID is required",
        } as ApiResponse);
        return;
      }

      // Verify bucket exists, is shared, and belongs to tenant
      const bucket = await prisma.bucket.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!bucket) {
        throw new NotFoundError("Bucket not found");
      }

      if (!bucket.isShared) {
        res.status(400).json({
          success: false,
          error: "Cannot add members to a non-shared bucket",
        } as ApiResponse);
        return;
      }

      // Only owner can add members
      if (bucket.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "Only the bucket owner can add members",
        } as ApiResponse);
        return;
      }

      // Verify user exists in tenant
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          tenantId: req.tenantId,
          isActive: true,
        },
      });

      if (!user) {
        throw new ValidationError("User not found in this tenant");
      }

      // Check if user is already a member
      const existingMember = await prisma.bucketMember.findFirst({
        where: {
          bucketId: id,
          userId,
        },
      });

      if (existingMember) {
        res.status(409).json({
          success: false,
          error: "User is already a member of this bucket",
        } as ApiResponse);
        return;
      }

      // Add member
      const member = await prisma.bucketMember.create({
        data: {
          bucketId: id,
          userId,
          tenantId: req.tenantId,
          role,
        },
        include: {
          user: {
            select: { id: true, name: true, workEmail: true, position: true },
          },
        },
      });

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUCKETS,
        page: Page.BUCKET_DETAIL,
        action: Action.CREATE,
        actionLabel: "Bucket member added",
        entityType: EntityType.BUCKET_MEMBER,
        entityId: member.id,
        entityLabel: user.name ?? user.workEmail ?? userId,
        parentEntityType: EntityType.BUCKET,
        parentEntityId: id,
        afterData: { userId, role },
        statusCode: 201,
      });

      res.status(201).json({
        success: true,
        data: member,
        message: "Member added successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Add bucket member error:", error);

      if (error instanceof NotFoundError || error instanceof ValidationError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to add bucket member",
      } as ApiResponse);
    }
  }

  /**
   * Remove member from shared bucket (tenant-aware)
   */
  static async removeBucketMember(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id, memberId } = req.params;

      // Verify bucket exists and belongs to tenant
      const bucket = await prisma.bucket.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!bucket) {
        throw new NotFoundError("Bucket not found");
      }

      // Only owner can remove members
      if (bucket.createdById !== req.user.id) {
        res.status(403).json({
          success: false,
          error: "Only the bucket owner can remove members",
        } as ApiResponse);
        return;
      }

      // Verify member exists
      const member = await prisma.bucketMember.findFirst({
        where: {
          id: memberId,
          bucketId: id,
        },
      });

      if (!member) {
        throw new NotFoundError("Member not found in this bucket");
      }

      // Remove member
      await prisma.bucketMember.delete({
        where: { id: memberId },
      });

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUCKETS,
        page: Page.BUCKET_DETAIL,
        action: Action.DELETE,
        actionLabel: "Bucket member removed",
        entityType: EntityType.BUCKET_MEMBER,
        entityId: memberId,
        parentEntityType: EntityType.BUCKET,
        parentEntityId: id,
        beforeData: { userId: member.userId, role: member.role },
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        message: "Member removed successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Remove bucket member error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to remove bucket member",
      } as ApiResponse);
    }
  }

  /**
   * Assign tickets to bucket (tenant-aware)
   */
  static async assignTicketsToBucket(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "Ticket IDs array is required",
        } as ApiResponse);
        return;
      }

      // Verify bucket exists and user has access
      const bucket = await prisma.bucket.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
        },
      });

      if (!bucket) {
        throw new NotFoundError("Bucket not found");
      }

      // Update tickets
      const result = await prisma.ticket.updateMany({
        where: {
          id: { in: ticketIds },
          tenantId: req.tenantId,
          isDeleted: false, // Don't assign deleted tickets
        },
        data: {
          bucketId: id,
          updatedAt: new Date(),
        },
      });

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUCKETS,
        page: Page.BUCKET_DETAIL,
        action: Action.BULK_ASSIGN,
        actionLabel: `Tickets assigned to bucket (${result.count})`,
        entityType: EntityType.BUCKET,
        entityId: id,
        entityLabel: bucket.name,
        correlationId: randomUUID(),
        metadata: {
          targetTicketIds: ticketIds,
          requested: ticketIds.length,
          assigned: result.count,
        },
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: { assignedCount: result.count },
        message: `${result.count} ticket(s) assigned to bucket successfully`,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Assign tickets to bucket error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to assign tickets to bucket",
      } as ApiResponse);
    }
  }

  /**
   * Unassign tickets from bucket (tenant-aware)
   */
  static async unassignTicketsFromBucket(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { ticketIds } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        res.status(400).json({
          success: false,
          error: "Ticket IDs array is required",
        } as ApiResponse);
        return;
      }

      // Update tickets - remove bucket assignment
      const result = await prisma.ticket.updateMany({
        where: {
          id: { in: ticketIds },
          tenantId: req.tenantId,
          bucketId: id,
        },
        data: {
          bucketId: null,
          updatedAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        data: { unassignedCount: result.count },
        message: `${result.count} ticket(s) removed from bucket successfully`,
      } as ApiResponse);
    } catch (error) {
      console.error("Unassign tickets from bucket error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to unassign tickets from bucket",
      } as ApiResponse);
    }
  }

  /**
   * Move all tickets in a bucket to a specific sprint (tenant-aware)
   */
  static async moveBucketToSprint(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { sprintId } = req.body;

      if (!sprintId) {
        res.status(400).json({
          success: false,
          error: "Sprint ID is required",
        } as ApiResponse);
        return;
      }

      // Verify bucket exists
      const bucket = await prisma.bucket.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!bucket) {
        throw new NotFoundError("Bucket not found");
      }

      // Verify sprint exists and belongs to tenant
      const sprint = await prisma.releasePlan.findFirst({
        where: { id: sprintId, tenantId: req.tenantId },
      });

      if (!sprint) {
        throw new NotFoundError("Sprint not found");
      }

      // Move all tickets in bucket to this sprint
      const result = await prisma.ticket.updateMany({
        where: {
          bucketId: id,
          tenantId: req.tenantId,
          isDeleted: false,
        },
        data: {
          sprintPlanId: sprintId,
          releasePlanId: null, // Clear release plan
          demoPlanId: null, // Clear demo plan
          bucketId: null, // Clear bucket assignment so they show in main views
          updatedAt: new Date(),
        },
      });

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUCKETS,
        page: Page.BUCKET_DETAIL,
        action: Action.MOVE,
        actionLabel: `Bucket emptied to sprint (${result.count})`,
        entityType: EntityType.BUCKET,
        entityId: id,
        entityLabel: bucket.name,
        correlationId: randomUUID(),
        metadata: {
          destination: "sprint",
          destinationSprintId: sprintId,
          destinationSprintVersion: sprint.version,
          ticketsMoved: result.count,
        },
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: { movedCount: result.count },
        message: `${result.count} ticket(s) moved to sprint successfully`,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Move bucket to sprint error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to move bucket to sprint",
      } as ApiResponse);
    }
  }

  /**
   * Move all tickets in a bucket back to backlog (tenant-aware)
   */
  static async moveBucketToBacklog(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      // Verify bucket exists
      const bucket = await prisma.bucket.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!bucket) {
        throw new NotFoundError("Bucket not found");
      }

      // Move all tickets in bucket back to backlog
      const result = await prisma.ticket.updateMany({
        where: {
          bucketId: id,
          tenantId: req.tenantId,
          isDeleted: false,
        },
        data: {
          sprintPlanId: null,
          releasePlanId: null,
          demoPlanId: null,
          bucketId: null, // Clear bucket assignment so they show in main views
          updatedAt: new Date(),
        },
      });

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUCKETS,
        page: Page.BUCKET_DETAIL,
        action: Action.MOVE,
        actionLabel: `Bucket emptied to backlog (${result.count})`,
        entityType: EntityType.BUCKET,
        entityId: id,
        entityLabel: bucket.name,
        correlationId: randomUUID(),
        metadata: { destination: "backlog", ticketsMoved: result.count },
        statusCode: 200,
      });

      res.status(200).json({
        success: true,
        data: { movedCount: result.count },
        message: `${result.count} ticket(s) moved to backlog successfully`,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Move bucket to backlog error:", error);
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Failed to move bucket to backlog",
      } as ApiResponse);
    }
  }
}
