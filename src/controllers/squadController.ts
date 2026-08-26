import { Response } from "express";
import { prisma } from "@/config/database";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  CreateSquadData,
  UpdateSquadData,
} from "@/types";

export class SquadController {
  /**
   * Get all squads (tenant-aware)
   */
  static async getSquads(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({ success: false, error: "Tenant context required" });
        return;
      }

      const { search, status, isArchived, page, limit } = req.query;

      const where: any = {
        tenantId: req.tenantId,
        isDeleted: false,
      };

      if (search) {
        where.OR = [
          { squadName: { contains: search as string, mode: "insensitive" } },
          { squadCode: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (status !== undefined && status !== "") {
        where.squadStatus = status === "true" || status === "active";
      }

      if (isArchived !== undefined && isArchived !== "") {
        where.isArchived = isArchived === "true";
      }

      const pageNum = page ? parseInt(page as string, 10) : undefined;
      const limitNum = limit ? parseInt(limit as string, 10) : undefined;
      const skip = pageNum && limitNum ? (pageNum - 1) * limitNum : undefined;

      const total = await prisma.squad.count({ where });

      const squads = await prisma.squad.findMany({
        where,
        take: limitNum,
        skip,
        include: {
          squadMembers: {
            include: {
              member: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  avatarUrl: true,
                  position: { select: { title: true } },
                },
              },
            },
          },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [
          { isArchived: "desc" },
          { createdAt: "desc" },
        ],
      });

      if (limitNum) {
        res.status(200).json({
          success: true,
          data: squads,
          pagination: {
            total,
            page: pageNum || 1,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
          }
        } as ApiResponse);
      } else {
        res.status(200).json({
          success: true,
          data: squads,
        } as ApiResponse);
      }
    } catch (error) {
      console.error("Get squads error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch squads" });
    }
  }

  /**
   * Get squad by ID
   */
  static async getSquadById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const squad = await prisma.squad.findFirst({
        where: { id, tenantId: req.tenantId as string, isDeleted: false },
        include: {
          squadMembers: {
            include: {
              member: {
                select: {
                  id: true,
                  name: true,
                  workEmail: true,
                  avatarUrl: true,
                  position: { select: { title: true } },
                },
              },
            },
          },
        },
      });

      if (!squad) {
        res.status(404).json({ success: false, error: "Squad not found" });
        return;
      }

      res.status(200).json({ success: true, data: squad });
    } catch (error) {
      console.error("Get squad by ID error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch squad" });
    }
  }

  /**
   * Create squad
   */
  static async createSquad(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { squadName, squadCode, headIds, subHeadIds, memberIds } = req.body as CreateSquadData;
      if (!squadName || !squadCode) {
        throw new ValidationError("Squad name and code are required");
      }

      const result = await prisma.$transaction(async (tx) => {
        const squad = await tx.squad.create({
          data: {
            tenantId: req.tenantId as string,
            squadName,
            squadCode,
            createdById: req.user!.id,
          },
        });

        const membersData: any[] = [];

        headIds?.forEach((id) => {
          membersData.push({
            tenantId: req.tenantId as string,
            squadId: squad.id,
            squadMemberId: id,
            memberType: "HEAD",
            createdById: req.user!.id,
          });
        });

        subHeadIds?.forEach((id) => {
          membersData.push({
            tenantId: req.tenantId as string,
            squadId: squad.id,
            squadMemberId: id,
            memberType: "SUB_HEAD",
            createdById: req.user!.id,
          });
        });

        memberIds?.forEach((id) => {
          membersData.push({
            tenantId: req.tenantId as string,
            squadId: squad.id,
            squadMemberId: id,
            memberType: "MEMBER",
            createdById: req.user!.id,
          });
        });

        if (membersData.length > 0) {
          await tx.squadMember.createMany({ data: membersData });
        }

        return squad;
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.SQUAD,
        page: Page.SQUAD_VIEW,
        action: Action.CREATE,
        actionLabel: `Created squad "${result.squadName}"`,
        entityType: EntityType.SQUAD,
        entityId: result.id,
        entityLabel: result.squadName,
        afterData: {
          squadName: result.squadName,
          squadCode: result.squadCode,
        },
      });

      res.status(201).json({ success: true, data: result, message: "Squad created successfully" });
    } catch (error: any) {
      console.error("Create squad error:", error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message || "Failed to create squad",
      });
    }
  }

  /**
   * Update squad
   */
  static async updateSquad(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { squadName, squadCode, headIds, subHeadIds, memberIds, squadStatus, isArchived } = req.body;

      const existingSquad = await prisma.squad.findFirst({
        where: { id, tenantId: req.tenantId as string, isDeleted: false },
      });

      if (!existingSquad) {
        throw new NotFoundError("Squad");
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedSquad = await tx.squad.update({
          where: { id },
          data: {
            squadName,
            squadCode,
            squadStatus,
            isArchived,
            updatedById: req.user!.id,
          },
        });

        if (headIds !== undefined || subHeadIds !== undefined || memberIds !== undefined) {
          // Sync members: delete existing and recreate
          // Alternatively, update existing ones, but recreation is simpler for syncing
          await tx.squadMember.deleteMany({ where: { squadId: id } });

          const membersData: any[] = [];
          headIds?.forEach((mId: string) => {
            membersData.push({
              tenantId: req.tenantId as string,
              squadId: id,
              squadMemberId: mId,
              memberType: "HEAD",
              createdById: req.user!.id,
            });
          });
          subHeadIds?.forEach((mId: string) => {
            membersData.push({
              tenantId: req.tenantId as string,
              squadId: id,
              squadMemberId: mId,
              memberType: "SUB_HEAD",
              createdById: req.user!.id,
            });
          });
          memberIds?.forEach((mId: string) => {
            membersData.push({
              tenantId: req.tenantId as string,
              squadId: id,
              squadMemberId: mId,
              memberType: "MEMBER",
              createdById: req.user!.id,
            });
          });

          if (membersData.length > 0) {
            await tx.squadMember.createMany({ data: membersData });
          }
        }

        return updatedSquad;
      });

      // ─── Activity log ───────────────────────────────────────────────
      if (existingSquad && result) {
        const beforeSnap = {
          squadName: existingSquad.squadName,
          squadCode: existingSquad.squadCode,
          squadStatus: existingSquad.squadStatus,
          isArchived: existingSquad.isArchived,
        };
        const afterSnap = {
          squadName: result.squadName,
          squadCode: result.squadCode,
          squadStatus: result.squadStatus,
          isArchived: result.isArchived,
        };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.SQUAD,
          page: Page.SQUAD_VIEW,
          action: Action.UPDATE,
          actionLabel: `Updated squad "${result.squadName}"`,
          entityType: EntityType.SQUAD,
          entityId: id,
          entityLabel: result.squadName,
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }

      res.status(200).json({ success: true, data: result, message: "Squad updated successfully" });
    } catch (error: any) {
      console.error("Update squad error:", error);
      res.status(error instanceof NotFoundError ? 404 : 500).json({
        success: false,
        error: error.message || "Failed to update squad",
      });
    }
  }

  /**
   * Delete squad (soft delete)
   */
  static async deleteSquad(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const squad = await prisma.squad.findFirst({
        where: { id, tenantId: req.tenantId as string },
      });
      if (!squad) {
        res.status(404).json({ success: false, error: "Squad not found" });
        return;
      }
      const squadName = squad.squadName;

      await prisma.squad.update({
        where: { id },
        data: { isDeleted: true, updatedById: req.user!.id },
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.SQUAD,
        page: Page.SQUAD_VIEW,
        action: Action.DELETE,
        actionLabel: `Deleted squad "${squadName}"`,
        entityType: EntityType.SQUAD,
        entityId: id,
        entityLabel: squadName,
      });

      res.status(200).json({ success: true, message: "Squad deleted successfully" });
    } catch (error) {
      console.error("Delete squad error:", error);
      res.status(500).json({ success: false, error: "Failed to delete squad" });
    }
  }

  /**
   * Archive/Unarchive squad
   */
  static async archiveSquad(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { isArchived } = req.body;

      const owned = await prisma.squad.findFirst({
        where: { id, tenantId: req.tenantId as string },
        select: { id: true },
      });
      if (!owned) {
        res.status(404).json({ success: false, error: "Squad not found" });
        return;
      }

      const squad = await prisma.squad.update({
        where: { id },
        data: { isArchived: !!isArchived, updatedById: req.user!.id },
      });

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.SQUAD,
        page: Page.SQUAD_VIEW,
        action: Action.STATUS_CHANGE,
        actionLabel: isArchived ? `Archived squad "${squad.squadName}"` : `Unarchived squad "${squad.squadName}"`,
        entityType: EntityType.SQUAD,
        entityId: id,
        entityLabel: squad.squadName,
        beforeData: { isArchived: !isArchived },
        afterData: { isArchived: !!isArchived },
        changedFields: ["isArchived"],
      });

      res.status(200).json({
        success: true,
        message: isArchived ? "Squad archived successfully" : "Squad unarchived successfully",
      });
    } catch (error) {
      console.error("Archive squad error:", error);
      res.status(500).json({ success: false, error: "Failed to archive squad" });
    }
  }
}
