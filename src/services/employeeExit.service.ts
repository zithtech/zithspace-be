import {
  createEmployeeExit,
  getEmployeeExits,
  getEmployeeExitById,
  deleteEmployeeExit,
  updateEmployeeExit,
  getEmployeeExitsByEmployeeId,
  updateEmployeeExitStatus,
  getPendingApprovals,
  getClearances,
  getClearancesByRequestId,
  updateClearanceStatus,
  processFnFSettlement,
  getChecklistConfigs,
  addChecklistConfig,
  deleteChecklistConfig,
  EmployeeExitRequest,
  getExitInterview,
  upsertExitInterview,
  updateExitDocumentUrl
} from "../models/employeeExit.model";

import { getByEmployee } from "../modules/payroll/services/assignment.service";
import { computeItem, daysInMonth } from "../modules/payroll/services/payRunCalc";
import { getBalances } from "../modules/leave-v2/repositories/leaveRequest.repo";
import { withTenant } from "../modules/payroll/db/pool";

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

  async getClearancesByRequestId(tenantId: string, exitRequestId: string): Promise<any[]> {
    return await getClearancesByRequestId(tenantId, exitRequestId);
  }

  async updateExitRequest(tenantId: string, id: string, data: any, updatedById: string): Promise<any> {
    return await updateEmployeeExit(tenantId, id, data, updatedById);
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

  async calculateDynamicFnF(actor: { tenantId: string; userId: string }, exitRequest: any): Promise<any> {
    // 1. Fetch active salary assignment
    const assignment = await getByEmployee(actor, exitRequest.employee_id);
    if (!assignment) {
      throw new Error("No active salary assignment found for this employee.");
    }

    // 2. Determine LWD and days calculation
    const lwd = new Date(exitRequest.proposed_last_working_day || exitRequest.resignation_date);
    const year = lwd.getFullYear();
    const month = lwd.getMonth() + 1; // 1-indexed
    const paidDays = lwd.getDate();
    const totalDays = daysInMonth(year, month);
    const lopDays = totalDays - paidDays;

    // 3. Compute prorated salary lines
    const lines = assignment.components.map(c => ({
      componentId: c.componentId,
      code: c.code,
      name: c.name,
      category: c.category,
      isProRata: true, // Typically all basic/HRA components are prorated in FnF
      fullAmount: c.calculatedAmount
    }));

    const computed = computeItem(totalDays, lopDays, lines);

    // 4. Map deductions (PF, ESI, TDS)
    let pf = 0;
    let esi = 0;
    let tax = 0;

    for (const l of computed.lines) {
      if (l.category === 'deduction') {
        const codeUpper = l.code.toUpperCase();
        if (codeUpper.includes('PF') || codeUpper.includes('PROVIDENT')) pf += l.amount;
        else if (codeUpper.includes('ESI')) esi += l.amount;
        else if (codeUpper.includes('TAX') || codeUpper.includes('TDS')) tax += l.amount;
      }
    }

    // 5. Fetch Leave Encashment (assuming paid leave types)
    let leaveEncashment = 0;
    try {
      await withTenant(actor.tenantId, async (client) => {
        const balances = await getBalances(client, exitRequest.employee_id);
        // Usually basic salary / 30 * encashable days. 
        // For simplicity, we just return the days and let Finance calculate, 
        // or we do a basic approximation if we know the 'BASIC' component.
        let basicDailyRate = 0;
        const basicComp = computed.lines.find(c => c.code.toUpperCase().includes('BASIC'));
        if (basicComp) {
          basicDailyRate = basicComp.fullAmount / 30; // full amount divided by standard 30 days
        }

        let encashableDays = 0;
        for (const b of balances) {
          if (b.available > 0) {
            encashableDays += b.available;
          }
        }
        leaveEncashment = Math.round(encashableDays * basicDailyRate);
      });
    } catch (e) {
      console.warn("Could not fetch leave balances for encashment:", e);
    }

    return {
      payrollRunId: `FNF-${exitRequest.employee_id.substring(0, 8)}-${month}-${year}`,
      pendingSalary: computed.gross,
      leaveEncashment,
      bonus: 0,
      incentives: 0,
      loanRecovery: 0,
      salaryAdvanceRecovery: 0,
      tax,
      pf,
      esi,
      assetDeduction: 0, // Manual adjustment by Finance
      noticeRecovery: exitRequest.buyout_amount ? parseFloat(exitRequest.buyout_amount) : 0,
    };
  }

  async updateExitDocumentUrl(tenantId: string, id: string, documentType: string, url: string) {
    return await updateExitDocumentUrl(tenantId, id, documentType, url);
  }
}

export const employeeExitService = new EmployeeExitService();
