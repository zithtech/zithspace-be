
import { prisma } from "@/config/database";

export async function getEmployeeLeaveSummary(tenantId: string, employeeId: string, month: number, year: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of the month

  const ledgerEntries = await prisma.leaveLedger.findMany({
    where: {
      tenantId,
      employeeId,
      transactionDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      leaveType: true,
    },
  });

  let casualLeave = 0;
  let sickLeave = 0;
  let permission = 0;
  let totalLopDays = 0;
  let paidLeaveTotal = 0;

  ledgerEntries.forEach((entry) => {
    const units = Number(entry.units);
    const type = entry.leaveType?.name?.toLowerCase() || "";
    const isPaid = entry.leaveType?.isPaid ?? true;
    const isDebit = entry.transactionType === "leave_debit";

    if (isDebit) {
      if (!isPaid) {
        totalLopDays += units;
      } else {
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

  return {
    casualLeave,
    sickLeave,
    permission,
    totalLopDays,
    paidLeaveTotal,
  };
}
