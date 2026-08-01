import { Response } from "express";
import { AuthRequest, ApiResponse } from "../types";
import { employeeExitService } from "../services/employeeExit.service";
import TenantLogger from "@/utils/tenantLogger";
import { uploadExitDocumentToR2, s3Client, BUCKET_NAME } from "../utils/r2Client";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export class EmployeeExitController {
  static async createEmployeeExit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;

      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      console.log("[EmployeeExitController] Creating exit request with body:", req.body);

      // Handle employeeId if it's sent as an object {value, label} or a string
      const rawEmployeeId = req.body.employeeId;
      const inputEmployeeId = typeof rawEmployeeId === 'object' && rawEmployeeId !== null 
        ? rawEmployeeId.value 
        : rawEmployeeId;

      const { resignationDate, proposedLastWorkingDay, resignationLetter } = req.body;

      if (!inputEmployeeId || !resignationDate || !proposedLastWorkingDay) {
        console.warn("[EmployeeExitController] Missing required fields:", { inputEmployeeId, resignationDate, proposedLastWorkingDay });
        res.status(400).json({ success: false, error: "Required fields are missing" } as ApiResponse);
        return;
      }

      let resignationLetterUrl: string | undefined = undefined;

      if (resignationLetter && resignationLetter.fileBase64 && resignationLetter.fileName) {
        try {
          resignationLetterUrl = await uploadExitDocumentToR2(
            resignationLetter.fileBase64,
            resignationLetter.fileName,
            tenantId,
            inputEmployeeId
          );
        } catch (uploadError) {
          console.error("Failed to upload resignation letter:", uploadError);
          // Optional: handle upload error specifically, or just continue without it
        }
      }

      // Update body with sanitized ID and URL
      const sanitizedBody = { 
        ...req.body, 
        employeeId: inputEmployeeId,
        resignationLetterUrl
      };

      const exitRequest = await employeeExitService.createExitRequest(tenantId, sanitizedBody, userId);
      console.log("[EmployeeExitController] Exit request created successfully:", exitRequest.id);

      TenantLogger.info("Employee exit request created successfully", {
        tenantId,
        userId,
        metadata: { employeeId: inputEmployeeId }
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

  static async getMyExitRequests(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const employeeId = req.user?.employeeId;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      if (!employeeId) {
        res.status(400).json({ success: false, error: "User is not linked to an employee profile" } as ApiResponse);
        return;
      }

      const requests = await employeeExitService.getExitRequestsByEmployeeId(tenantId, employeeId);

      res.status(200).json({
        success: true,
        data: requests
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching my exit requests:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async getPendingApprovals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const employeeId = req.user?.employeeId || req.user?.id;

      if (!tenantId || !employeeId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const requests = await employeeExitService.getPendingApprovals(tenantId, employeeId);

      res.status(200).json({
        success: true,
        data: requests
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching pending approvals:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async getClearances(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const clearances = await employeeExitService.getClearances(tenantId);

      res.status(200).json({
        success: true,
        data: clearances
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching clearances:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async getClearancesByRequestId(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const clearances = await employeeExitService.getClearancesByRequestId(tenantId, id);

      res.status(200).json({
        success: true,
        data: clearances
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching clearances by request id:", error);
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

  static async updateEmployeeExit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;

      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const updated = await employeeExitService.updateExitRequest(tenantId, id, req.body, userId);

      res.status(200).json({ success: true, data: updated } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating exit request:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async updateEmployeeExitStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;
      const { status } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      if (!status) {
        res.status(400).json({ success: false, error: "Status is required" } as ApiResponse);
        return;
      }

      const updatedRequest = await employeeExitService.updateExitStatus(tenantId, id, status, userId);

      TenantLogger.info(`Employee exit request status updated to ${status}`, {
        tenantId,
        userId,
        metadata: { id, status }
      });

      res.status(200).json({
        success: true,
        message: `Exit request marked as ${status}`,
        data: updatedRequest
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating exit request status:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async updateClearanceStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;
      const { department, isCleared, comments, checklist } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const updatedClearance = await employeeExitService.updateClearanceStatus(tenantId, id, department, isCleared, comments, checklist, userId);

      res.status(200).json({
        success: true,
        message: `${department} clearance status updated`,
        data: updatedClearance
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error updating clearance status:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async processFnFSettlement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;
      const payload = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const settlement = await employeeExitService.processFnFSettlement(tenantId, id, payload, userId);

      res.status(200).json({
        success: true,
        message: `FnF Settlement processed successfully`,
        data: settlement
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error processing FnF settlement:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async calculateFnF(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const exitRequest = await employeeExitService.getExitRequestById(tenantId, id);
      if (!exitRequest) {
        res.status(404).json({ success: false, error: "Exit request not found" } as ApiResponse);
        return;
      }

      const actor = { tenantId, userId: req.user?.id as string };
      const dynamicPayrollResult = await employeeExitService.calculateDynamicFnF(actor, exitRequest);

      res.status(200).json({
        success: true,
        data: dynamicPayrollResult
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error calculating FnF:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }
  // Checklist Config Controllers
  static async getChecklistConfigs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const configs = await employeeExitService.getChecklistConfigs(tenantId);
      res.status(200).json({ success: true, data: configs } as ApiResponse);
    } catch (error) {
      console.error("Error fetching checklist configs:", error);
      res.status(500).json({ success: false, error: "Failed to fetch configs" } as ApiResponse);
    }
  }

  static async addChecklistConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { department, itemName } = req.body;
      if (!tenantId || !department || !itemName) {
        res.status(400).json({ success: false, error: "Missing required fields" } as ApiResponse);
        return;
      }

      const config = await employeeExitService.addChecklistConfig(tenantId, department, itemName);
      res.status(201).json({ success: true, data: config } as ApiResponse);
    } catch (error) {
      console.error("Error adding checklist config:", error);
      res.status(500).json({ success: false, error: "Failed to add config" } as ApiResponse);
    }
  }

  static async deleteChecklistConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      await employeeExitService.deleteChecklistConfig(tenantId, id);
      res.status(200).json({ success: true, message: "Deleted successfully" } as ApiResponse);
    } catch (error) {
      console.error("Error deleting checklist config:", error);
      res.status(500).json({ success: false, error: "Failed to delete config" } as ApiResponse);
    }
  }

  static async getInterview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      
      const fs = require('fs');
      fs.appendFileSync('debug.log', `[getInterview] id=${id}, tenant=${tenantId}\n`);
      
      if (!tenantId) {
        fs.appendFileSync('debug.log', `[getInterview] Unauthorized\n`);
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const interview = await employeeExitService.getExitInterview(tenantId, id);
      fs.appendFileSync('debug.log', `[getInterview] fetched interview: ${JSON.stringify(interview)}\n`);
      res.status(200).json({ success: true, data: interview } as ApiResponse);
    } catch (error: any) {
      console.error("Error fetching exit interview:", error);
      res.status(500).json({ success: false, error: "Internal server error", details: error.message } as ApiResponse);
    }
  }

  static async submitInterview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      const { id } = req.params;
      
      if (!tenantId || !userId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const interview = await employeeExitService.upsertExitInterview(tenantId, id, req.body, userId);
      res.status(200).json({ success: true, message: "Interview submitted successfully", data: interview } as ApiResponse);
    } catch (error: any) {
      console.error("Error submitting exit interview:", error);
      res.status(500).json({ success: false, error: "Internal server error", details: error.message } as ApiResponse);
    }
  }
  static async uploadDocument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      const { documentType, fileBase64, fileName, employeeId } = req.body;

      if (!tenantId) {
        res.status(401).json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      if (!documentType || !fileBase64 || !fileName || !employeeId) {
        res.status(400).json({ success: false, error: "Missing required fields for document upload" } as ApiResponse);
        return;
      }

      if (documentType !== 'relieving' && documentType !== 'experience') {
        res.status(400).json({ success: false, error: "Invalid document type" } as ApiResponse);
        return;
      }

      const fileUrl = await uploadExitDocumentToR2(
        fileBase64,
        fileName,
        tenantId,
        employeeId
      );

      const updated = await employeeExitService.updateExitDocumentUrl(tenantId, id, documentType, fileUrl);

      res.status(200).json({
        success: true,
        message: "Document uploaded successfully",
        data: updated
      } as ApiResponse);
    } catch (error: any) {
      console.error("Error uploading document:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message
      } as ApiResponse);
    }
  }

  static async downloadDocument(req: AuthRequest, res: Response) {
    try {
      const { url: finalUrl, filename, mode = 'attachment' } = req.query;

      if (!finalUrl || typeof finalUrl !== 'string') {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      const urlObj = new URL(finalUrl);
      let key = urlObj.pathname.startsWith("/") ? urlObj.pathname.slice(1) : urlObj.pathname;

      if (key.startsWith(BUCKET_NAME + '/')) {
        key = key.substring(BUCKET_NAME.length + 1);
      }
      
      key = decodeURIComponent(key);

      const filenameStr = typeof filename === 'string' ? filename : 'document.pdf';
      const ext = filenameStr.split('.').pop()?.toLowerCase() || 'pdf';
      const MIME_MAP: Record<string, string> = {
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      const resolvedContentType = MIME_MAP[ext] || 'application/octet-stream';

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
      });

      const s3Response = await s3Client.send(command);

      if (!s3Response.Body) {
        throw new Error("Empty response body from R2");
      }

      res.setHeader('Content-Type', resolvedContentType);
      res.setHeader('Content-Disposition', mode === 'inline' 
        ? `inline; filename="${filenameStr}"` 
        : `attachment; filename="${filenameStr}"`);

      const body = s3Response.Body as any;
      if (typeof body.pipe === 'function') {
        return body.pipe(res);
      } else {
        const bytes = await s3Response.Body.transformToByteArray();
        return res.send(Buffer.from(bytes));
      }
    } catch (error: any) {
      console.error("[EmployeeExitController] downloadDocument error:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to download document",
        details: error.message
      });
    }
  }
}
