import { Response } from "express";
import { AuthRequest } from "../types";
import { noticePolicyService } from "../services/noticePolicy.service";
import TenantLogger from "@/utils/tenantLogger";

export const createNoticePolicy = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const {
      policy_name,
      code,
      description,
      level_type,
      level_id,
      notice_period_days,
      probotion_period_days,
      probation_notice_days,
      buyout_calculating_type,
      status,
    } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const data = {
      policyName: policy_name,
      code,
      description: description || undefined,
      levelType: level_type,
      levelId: level_id,
      noticePeriodDays: Number(notice_period_days),
      probationPeriodDays: probotion_period_days != null ? Number(probotion_period_days) : 0,
      probationNoticeDays: probation_notice_days != null ? Number(probation_notice_days) : 0,
      buyoutCalculatingType: buyout_calculating_type || undefined,
      status: status === true || status === 'true' || status === 1 || status === '1',
    };

    const policy = await noticePolicyService.createPolicy(tenantId, data, userId);
    return res.status(201).json({ success: true, message: "Policy created successfully", data: policy });
  } catch (error: any) {
    console.error("Error creating notice policy:", error);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'code';
      return res.status(409).json({ success: false, message: `A policy with this ${field} already exists.` });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getAllNoticePolicies = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const policies = await noticePolicyService.getPolicies(tenantId);
    TenantLogger.info(`Fetched ${policies.length} policies`, {
      tenantId,
      operation: 'GET_POLICIES'
    });
    return res.status(200).json({ success: true, message: "Policies fetched successfully", data: policies });
  } catch (error: any) {
    console.error("Error fetching notice policies:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const getNoticePolicyById = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const policy = await noticePolicyService.getPolicyById(tenantId, id);
    if (!policy) {
      return res.status(404).json({ success: false, message: "Policy not found" });
    }

    return res.status(200).json({ success: true, message: "Policy fetched successfully", data: policy });
  } catch (error: any) {
    console.error("Error fetching notice policy by id:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const updateNoticePolicy = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const { id } = req.params;
    const {
      policy_name,
      code,
      description,
      level_type,
      level_id,
      notice_period_days,
      probotion_period_days,
      probation_notice_days,
      buyout_calculating_type,
      status,
    } = req.body;

    if (!tenantId || !userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const data = {
      policyName: policy_name,
      code,
      description: description || undefined,
      levelType: level_type,
      levelId: level_id,
      noticePeriodDays: Number(notice_period_days),
      probationPeriodDays: probotion_period_days != null ? Number(probotion_period_days) : 0,
      probationNoticeDays: probation_notice_days != null ? Number(probation_notice_days) : 0,
      buyoutCalculatingType: buyout_calculating_type || undefined,
      status: status === true || status === 'true' || status === 1 || status === '1',
    };

    const updatedPolicy = await noticePolicyService.updatePolicy(tenantId, id, data, userId);
    return res.status(200).json({ success: true, message: "Policy updated successfully", data: updatedPolicy });
  } catch (error: any) {
    console.error("Error updating notice policy:", error);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'code';
      return res.status(409).json({ success: false, message: `A policy with this ${field} already exists.` });
    }
    if (error.message === "Policy not found or access denied") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

export const deleteNoticePolicy = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await noticePolicyService.deletePolicy(tenantId, id);
    return res.status(200).json({ success: true, message: "Policy deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting notice policy:", error);
    if (error.message === "Policy not found or access denied") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};
