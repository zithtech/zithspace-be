import { Response } from "express";
import { AuthRequest } from "../types";
import { reasonForExitService } from "../services/reasonForExit.service";
import TenantLogger from "@/utils/tenantLogger";

export const createReasonForExit = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { name, code, is_active } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!name || !code) {
      return res.status(400).json({ success: false, message: "Name and Code are required" });
    }

    const reason = await reasonForExitService.createReason(tenantId, { name, code, is_active }, userId);
    
    TenantLogger.info("Reason for Exit created successfully", { 
        tenantId, 
        userId
    });

    return res.status(201).json({ 
        success: true, 
        message: "Reason for Exit created successfully", 
        data: reason 
    });
  } catch (error: any) {
    console.error("Error creating reason for exit:", error);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'code';
      return res.status(409).json({ success: false, message: `A reason for exit with this ${field} already exists.` });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getReasonForExits = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const reasons = await reasonForExitService.getReasons(tenantId);
    
    return res.status(200).json({ 
        success: true, 
        message: "Reasons for Exit fetched successfully", 
        data: reasons 
    });
  } catch (error: any) {
    console.error("Error fetching reasons for exit:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getReasonForExitById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const reason = await reasonForExitService.getReasonById(tenantId, id);
    if (!reason) {
      return res.status(404).json({ success: false, message: "Reason for Exit not found" });
    }

    return res.status(200).json({ 
        success: true, 
        message: "Reason for Exit fetched successfully", 
        data: reason 
    });
  } catch (error: any) {
    console.error("Error fetching reason for exit by id:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const updateReasonForExit = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, code, is_active } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const updatedReason = await reasonForExitService.updateReason(tenantId, id, { name, code, is_active }, userId);
    
    TenantLogger.info("Reason for Exit updated successfully", { 
        tenantId, 
        userId
    });

    return res.status(200).json({ 
        success: true, 
        message: "Reason for Exit updated successfully", 
        data: updatedReason 
    });
  } catch (error: any) {
    console.error("Error updating reason for exit:", error);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'code';
      return res.status(409).json({ success: false, message: `A reason for exit with this ${field} already exists.` });
    }
    if (error.message === "Reason for Exit not found or access denied") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const deleteReasonForExit = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await reasonForExitService.deleteReason(tenantId, id);
    
    TenantLogger.info("Reason for Exit deleted successfully", { 
        tenantId
    });

    return res.status(200).json({ success: true, message: "Reason for Exit deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting reason for exit:", error);
    if (error.message === "Reason for Exit not found or access denied") {
         return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};
