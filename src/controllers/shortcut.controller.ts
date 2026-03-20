import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class ShortcutController {
  /**
   * Create Shortcut
   */
  static async createShortcut(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { name, path } = req.body;

      if (!name || !path) {
        res.status(400).json({
          success: false,
          error: "Name and path are required",
        } as ApiResponse);
        return;
      }

      const shortcut = await prisma.shortcut.create({
        data: {
          title: name,
          path,
          createdById: req.user.id,
          tenantId: req.tenantId,
        },
        select: {
          id: true,
          title: true,
          path: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        success: true,
        data: shortcut,
        message: "Shortcut created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Create shortcut error:", error);

      res.status(500).json({
        success: false,
        error: "Failed to create shortcut",
      } as ApiResponse);
    }
  }

  /**
   * Get Shortcuts
   */
  static async getShortcuts(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const shortcuts = await prisma.shortcut.findMany({
        where: {
          createdById: req.user.id,
          tenantId: req.tenantId,
        },
        select: {
          id: true,
          title: true,
          path: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({
        success: true,
        data: shortcuts,
        message: "Shortcuts fetched successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Get shortcuts error:", error);

      res.status(500).json({
        success: false,
        error: "Failed to fetch shortcuts",
      } as ApiResponse);
    }
  }

  /**
   * Delete Shortcut
   */
  static async deleteShortcut(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const shortcut = await prisma.shortcut.findFirst({
        where: {
          id,
          tenantId: req.tenantId,
          createdById: req.user.id,
        },
      });

      if (!shortcut) {
        throw new NotFoundError("Shortcut not found");
      }

      await prisma.shortcut.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Shortcut deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete shortcut error:", error);

      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: error.message,
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to delete shortcut",
      } as ApiResponse);
    }
  }
}

export default ShortcutController;
