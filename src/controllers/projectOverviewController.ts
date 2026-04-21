import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import { ProjectOverviewModel } from "../models/projectOverviewModel";

export class ProjectOverviewController {
  /**
   * Get comprehensive project overview data
   */
  static async getOverview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const overviewData = await ProjectOverviewModel.getOverviewData(projectId, tenantId);

      res.status(200).json({
        success: true,
        data: overviewData,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get project overview error:", error);
      res.status(error.message === "Project not found" ? 404 : 500).json({
        success: false,
        error: error.message || "Failed to fetch project overview",
      } as ApiResponse);
    }
  }

  /**
   * Update project basic details
   */
  static async updateProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const tenantId = req.tenantId;
      const data = req.body;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const updatedProject = await ProjectOverviewModel.update(projectId, tenantId, data);

      res.status(200).json({
        success: true,
        data: updatedProject,
        message: "Project updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update project error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update project",
      } as ApiResponse);
    }
  }

  /**
   * Delete project
   */
  static async deleteProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context required",
        } as ApiResponse);
        return;
      }

      const success = await ProjectOverviewModel.delete(projectId, tenantId);

      if (!success) {
        res.status(404).json({
          success: false,
          error: "Project not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        message: "Project deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete project error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete project",
      } as ApiResponse);
    }
  }
}
