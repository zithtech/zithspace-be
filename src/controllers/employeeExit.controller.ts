import { Response } from "express";
import { AuthRequest, ApiResponse } from "../types";
import { employeeExitService } from "../services/employeeExit.service";
import TenantLogger from "@/utils/tenantLogger";

export class EmployeeExitController {
  static async createEmployeeExit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;

      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { employeeId, resignationDate, proposedLastWorkingDay } = req.body;

      if (!employeeId || !resignationDate || !proposedLastWorkingDay) {
        res.status(400).json({ success: false, error: "Missing required fields" } as ApiResponse);
        return;
      }

      const exitRequest = await employeeExitService.createExitRequest(tenantId, req.body, userId);

      TenantLogger.info("Employee exit request created successfully", {
        tenantId,
        userId,
        metadata: { employeeId }
      });

      res.status(201).json({
        success: true,
        message: "Exit request created successfully",
        data: exitRequest
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error creating exit request:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async getEmployeeExits(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const requests = await employeeExitService.getExitRequests(tenantId);

      res.status(200).json({
        success: true,
        data: requests
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching exit requests:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async getEmployeeExitById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const request = await employeeExitService.getExitRequestById(tenantId, id);
      if (!request) {
        res.status(404).json({ success: false, error: "Exit request not found" } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: request
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching exit request by id:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async deleteEmployeeExit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      await employeeExitService.deleteExitRequest(tenantId, id);

      TenantLogger.info("Employee exit request deleted successfully", {
        tenantId,
        metadata: { id }
      });

      res.status(200).json({
        success: true,
        message: "Exit request deleted successfully"
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error deleting exit request:", error);
      if (error.message === "Exit Request not found or access denied") {
        res.status(404).json({ success: false, error: error.message } as ApiResponse);
        return;
      }
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }
}
