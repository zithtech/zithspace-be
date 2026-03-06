import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";

export const getLeaveAllocationWithEmployees = async (
  req: Request,
  res: Response
) => {
  try {
    const tenantId = (req as any).tenantId;
    const { origin, subOriginId } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "Tenant missing",
      });
    }


    const policies = await prisma.leaveOriginStructure.findMany({
      where: {
        tenantId,
        ...(origin && subOriginId
          ? {
              origin: origin as string,
              subOriginId: subOriginId as string,
            }
          : {}),
      },
      select: {
        id: true,
        tenantId: true,
        origin: true,
        subOriginId: true,
        leaveTypes: {
          where: { status: "Active" },
          select: {
            id: true,
            leaveTypeId: true,
            unit: true,
          },
        },
      },
    });

    const employees = await prisma.employee.findMany({
      where: {
        tenantId,
        status: true,
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        workDetail: {
          select: {
            positionId: true,
          },
          take: 1,
        },
      },
      orderBy: {
        first_name: "asc",
      },
    });

    const formattedEmployees = employees.map((emp) => ({
      employeeId: emp.id,
      fullName: `${emp.first_name} ${emp.last_name}`,
      positionId: emp.workDetail[0]?.positionId || null,
    }));


    const positions = await prisma.position.findMany({
      where: { tenantId },
      select: {
        id: true,
        department: {
          select: { id: true, name: true },
        },
        subDepartment: {
          select: { id: true, name: true },
        },
        grade: {
          select: { id: true, name: true },
        },
      },
    });
const positionMap = new Map();
    positions.forEach((pos) => {
      positionMap.set(pos.id, pos);
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const ledgerEntries: any[] = [];
    // 4️⃣ Loop employees
    for (const emp of employees) {
      const positionId = emp.workDetail[0]?.positionId;
      if (!positionId) continue;

      const position = positionMap.get(positionId);
      if (!position) continue;

      // 5️⃣ Find matching policies (OR condition)
      const matchedPolicies = policies.filter((policy) => {
        return (
          (policy.origin === "Position" &&
            policy.subOriginId === positionId) ||
          (policy.origin === "Department" &&
            policy.subOriginId === position.department?.id) ||
          (policy.origin === "SubDepartment" &&
            policy.subOriginId === position.subDepartment?.id) ||
          (policy.origin === "Grade" &&
            policy.subOriginId === position.grade?.id)
        );
      });

      // 6️⃣ Insert leave types

for (const policy of matchedPolicies) {
  for (const leaveType of policy.leaveTypes) {

    const creditUnits = new Prisma.Decimal(leaveType.unit);

    // 1️⃣ Get latest balance for this employee + leaveType 
    const lastLedger = await prisma.leaveLedger.findFirst({
      where: {
        tenantId,
        employeeId: emp.id,
        leaveTypeId: leaveType.leaveTypeId,
      },
      orderBy: {
        transactionDate: "desc",
      },
    });

    const previousBalance = lastLedger
      ? new Prisma.Decimal(lastLedger.balanceAfter)
      : new Prisma.Decimal(0);

    const newBalance = previousBalance.plus(creditUnits);

    // 2️⃣ Prevent duplicate monthly credit
    const alreadyCredited = await prisma.leaveLedger.findFirst({
      where: {
        tenantId,
        employeeId: emp.id,
        leaveTypeId: leaveType.leaveTypeId,
        transactionType: "monthly_credit",
        transactionDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    if (alreadyCredited) continue;

    // 3️⃣ Create Ledger Entry
    await prisma.leaveLedger.create({
      data: {
        tenantId,
        employeeId: emp.id,
        leaveTypeId: leaveType.leaveTypeId,
        transactionType: "monthly_credit",
        referenceId: null,
        units: creditUnits,
        balanceAfter: newBalance,
        transactionDate: monthStart,
        expiryDate: null, // Or set next month expiry if required
        policyVersion: 1, // You can dynamically store policy version here
        createdById: null,
        updatedById: null,
      },
    });
  }
}
    }


    return res.status(200).json({
      success: true,
      data: {
        policies,
        employees: formattedEmployees,
        positions,
      },
    });

  } catch (error: any) {
    console.error("Error fetching allocation + employees:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};