import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class PayrollController {
  /**
   * Get leave summary for an employee for a specific month
   * @route GET /api/payroll/leave-summary
   */
  static async getLeaveSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { employeeId: userId, month } = req.query;

      if (!userId || !month) {
        res.status(400).json({
          success: false,
          error: "Employee ID and month are required",
        } as ApiResponse);
        return;
      }

      // Parse month (format: YYYY-MM)
      const [year, monthNum] = (month as string).split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0); // Last day of the month

      // 1. Try to find the user to get the employeeId. 
      // If not found, assume the passed ID might be the employeeId itself.
      let targetEmployeeId = userId as string;
      const user = await prisma.user.findUnique({
        where: { id: userId as string },
        select: { employeeId: true },
      });

      if (user && user.employeeId) {
        targetEmployeeId = user.employeeId;
      }

      // 2. Query LeaveLedger for this employee and month
      // We search by both mapped employeeId and original userId 
      // to accommodate cases where manual inserts might use the userId.
      const ledgerEntries = await prisma.leaveLedger.findMany({
        where: {
          tenantId: req.user.tenantId,
          OR: [
            { employeeId: targetEmployeeId },
            { employeeId: userId as string },
          ],
          transactionDate: {
            gte: new Date(`${year}-${monthNum}-01`),
            lt: new Date(`${year}-${monthNum + 1}-01`),
          },
        },
        include: {
          leaveType: true,
        },
      });

      // 3. Aggregate data
      let casualLeave = 0;
      let sickLeave = 0;
      let permission = 0;
      let totalLopDays = 0;
      let paidLeaveTotal = 0;

      ledgerEntries.forEach((entry) => {
        const units = Number(entry.units);
        const type = entry.leaveType?.name?.toLowerCase() || "";
        const isPaid = entry.leaveType?.isPaid ?? true;

        // TransactionType enum in schema.prisma has leave_debit
        const isDebit = entry.transactionType === "leave_debit";

        if (isDebit) {
          // If isPaid is false, it's LOP regardless of the name
          if (!isPaid) {
            totalLopDays += units;
          } else {
            // Categorize paid leaves by common name patterns
            if (type.includes("casual")) {
              casualLeave += units;
              paidLeaveTotal += units;
            } else if (type.includes("sick")) {
              sickLeave += units;
              paidLeaveTotal += units;
            } else if (type.includes("permission")) {
              permission += units;
              paidLeaveTotal += units;
            }
          }
        }
      });

      res.status(200).json({
        success: true,
        data: {
          casualLeave,
          sickLeave,
          permission,
          totalLopDays,
          paidLeaveTotal,
        },
      });
    } catch (error: any) {
      console.error("Error in getLeaveSummary:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      } as ApiResponse);
    }
  }
}
