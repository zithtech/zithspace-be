import { Response } from "express";
import { AuthRequest } from "../types";
import { exitApprovalWorkflowService } from "../services/exitApprovalWorkflow.service";
import TenantLogger from "@/utils/tenantLogger";

export const createStep = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { stepOrder, roleIds, mandatory, approvalType, levelType, levelId } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const data = {
      stepOrder: parseInt(stepOrder),
      roleIds: Array.isArray(roleIds) ? roleIds : [],
      mandatory: !!mandatory,
      approvalType: approvalType || "Sequential",
      levelType: levelType || "Department",
      levelId: levelId || null,
    };

    const step = await exitApprovalWorkflowService.createStep(tenantId, data, userId);
    return res.status(201).json({ success: true, message: "Approval step created successfully", data: step });
  } catch (error: any) {
    console.error("Error creating approval step:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getAllSteps = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const steps = await exitApprovalWorkflowService.getSteps(tenantId);
    TenantLogger.info(`Fetched ${steps.length} approval steps`, { 
      tenantId, 
      operation: 'GET_APPROVAL_STEPS' 
    });
    return res.status(200).json({ success: true, message: "Approval steps fetched successfully", data: steps });
  } catch (error: any) {
    console.error("Error fetching approval steps:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getStepById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const step = await exitApprovalWorkflowService.getStepById(tenantId, id);
    if (!step) {
      return res.status(404).json({ success: false, message: "Approval step not found" });
    }

    return res.status(200).json({ success: true, message: "Approval step fetched successfully", data: step });
  } catch (error: any) {
    console.error("Error fetching approval step by id:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const updateStep = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { stepOrder, roleIds, mandatory, approvalType, levelType, levelId } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const data: any = {};
    if (stepOrder !== undefined) data.stepOrder = parseInt(stepOrder);
    if (roleIds !== undefined) data.roleIds = Array.isArray(roleIds) ? roleIds : [];
    if (mandatory !== undefined) data.mandatory = !!mandatory;
    if (approvalType !== undefined) data.approvalType = approvalType;
    if (levelType !== undefined) data.levelType = levelType;
    if (levelId !== undefined) data.levelId = levelId;

    const updatedStep = await exitApprovalWorkflowService.updateStep(tenantId, id, data, userId);
    return res.status(200).json({ success: true, message: "Approval step updated successfully", data: updatedStep });
  } catch (error: any) {
    console.error("Error updating approval step:", error);
    if (error.message === "Approval step not found or access denied") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const deleteStep = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await exitApprovalWorkflowService.deleteStep(tenantId, id);
    return res.status(200).json({ success: true, message: "Approval step deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting approval step:", error);
    if (error.message === "Approval step not found or access denied") {
         return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};
