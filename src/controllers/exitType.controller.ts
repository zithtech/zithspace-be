import { Response } from "express";
import { AuthRequest } from "../types";
import { exitTypeService } from "../services/exitType.service";
import TenantLogger from "@/utils/tenantLogger";

export const createExitType = async (req: AuthRequest, res: Response) => {
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

    const exitType = await exitTypeService.createType(tenantId, { name, code, is_active }, userId);
    
    TenantLogger.info("Exit Type created successfully", { 
        tenantId, 
        userId
    });

    return res.status(201).json({ 
        success: true, 
        message: "Exit Type created successfully", 
        data: exitType 
    });
  } catch (error: any) {
    console.error("Error creating exit type:", error);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'code';
      return res.status(409).json({ success: false, message: `An exit type with this ${field} already exists.` });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getExitTypes = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const exitTypes = await exitTypeService.getTypes(tenantId);
    
    return res.status(200).json({ 
        success: true, 
        message: "Exit Types fetched successfully", 
        data: exitTypes 
    });
  } catch (error: any) {
    console.error("Error fetching exit types:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getExitTypeById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const exitType = await exitTypeService.getTypeById(tenantId, id);
    if (!exitType) {
      return res.status(404).json({ success: false, message: "Exit Type not found" });
    }

    return res.status(200).json({ 
        success: true, 
        message: "Exit Type fetched successfully", 
        data: exitType 
    });
  } catch (error: any) {
    console.error("Error fetching exit type by id:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const updateExitType = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, code, is_active } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const updatedExitType = await exitTypeService.updateType(tenantId, id, { name, code, is_active }, userId);
    
    TenantLogger.info("Exit Type updated successfully", { 
        tenantId, 
        userId
    });

    return res.status(200).json({ 
        success: true, 
        message: "Exit Type updated successfully", 
        data: updatedExitType 
    });
  } catch (error: any) {
    console.error("Error updating exit type:", error);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'code';
      return res.status(409).json({ success: false, message: `An exit type with this ${field} already exists.` });
    }
    if (error.message === "Exit Type not found or access denied") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const deleteExitType = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await exitTypeService.deleteType(tenantId, id);
    
    TenantLogger.info("Exit Type deleted successfully", { 
        tenantId
    });

    return res.status(200).json({ success: true, message: "Exit Type deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting exit type:", error);
    if (error.message === "Exit Type not found or access denied") {
         return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};
