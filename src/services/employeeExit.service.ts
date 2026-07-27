import {
  createEmployeeExit,
  getEmployeeExits,
  getEmployeeExitById,
  deleteEmployeeExit,
  getEmployeeExitsByEmployeeId,
  updateEmployeeExitStatus,
  getPendingApprovals,
  getClearances,
  updateClearanceStatus,
  processFnFSettlement,
  getChecklistConfigs,
  addChecklistConfig,
  deleteChecklistConfig,
  EmployeeExitRequest,
  getExitInterview,
  upsertExitInterview
} from "../models/employeeExit.model";

export class EmployeeExitService {
  async createExitRequest(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<EmployeeExitRequest> {
    return await createEmployeeExit(tenantId, data, createdById);
  }

  async getExitRequests(tenantId: string): Promise<EmployeeExitRequest[]> {
    return await getEmployeeExits(tenantId);
  }

  async getExitRequestById(tenantId: string, id: string): Promise<EmployeeExitRequest | null> {
    return await getEmployeeExitById(tenantId, id);
  }

  async getExitRequestsByEmployeeId(tenantId: string, employeeId: string): Promise<EmployeeExitRequest[]> {
    return await getEmployeeExitsByEmployeeId(tenantId, employeeId);
  }

  async getPendingApprovals(tenantId: string, employeeId: string): Promise<EmployeeExitRequest[]> {
    return await getPendingApprovals(tenantId, employeeId);
  }

  async getClearances(tenantId: string): Promise<any[]> {
    return await getClearances(tenantId);
  }

  async deleteExitRequest(tenantId: string, id: string): Promise<any> {
    const existing = await this.getExitRequestById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Request not found or access denied");
    }
    return await deleteEmployeeExit(tenantId, id);
  }

  async updateExitStatus(tenantId: string, id: string, status: string, updatedById: string): Promise<any> {
    const existing = await this.getExitRequestById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Request not found or access denied");
    }
    return await updateEmployeeExitStatus(tenantId, id, status, updatedById);
  }

  async updateClearanceStatus(tenantId: string, id: string, department: string, isCleared: boolean, comments: string, checklist: any, updatedById: string): Promise<any> {
    const existing = await this.getExitRequestById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Request not found or access denied");
    }
    return await updateClearanceStatus(tenantId, id, department, isCleared, comments, checklist, updatedById);
  }

  async processFnFSettlement(tenantId: string, id: string, payload: any, processedById: string): Promise<any> {
    const existing = await this.getExitRequestById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Request not found or access denied");
    }
    return await processFnFSettlement(tenantId, id, payload, processedById);
  }

  async getChecklistConfigs(tenantId: string): Promise<any[]> {
    return await getChecklistConfigs(tenantId);
  }

  async addChecklistConfig(tenantId: string, department: string, itemName: string): Promise<any> {
    return await addChecklistConfig(tenantId, department, itemName);
  }

  async deleteChecklistConfig(tenantId: string, id: string): Promise<any> {
    return await deleteChecklistConfig(tenantId, id);
  }

  async getExitInterview(tenantId: string, exitRequestId: string): Promise<any> {
    return await getExitInterview(tenantId, exitRequestId);
  }

  async upsertExitInterview(tenantId: string, exitRequestId: string, data: any, interviewerId: string): Promise<any> {
    return await upsertExitInterview(tenantId, exitRequestId, data, interviewerId);
  }
}

export const employeeExitService = new EmployeeExitService();
