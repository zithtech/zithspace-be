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

    /* ===============================
       1️⃣ GET POLICIES
    =============================== */

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
            accrualInterval: true, // ⭐ added
          },
        },
      },
    });

    /* ===============================
       2️⃣ GET EMPLOYEES
    =============================== */

    const employees = await prisma.employee.findMany({
      where: {
        tenantId,
        status: true,
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        created_at: true,
        workDetail: {
          select: {
            positionId: true,
            workJoiningDate: true,
          },
          orderBy: {
            createdAt: 'desc'
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

    /* ===============================
       3️⃣ GET POSITIONS
    =============================== */

    const positions = await prisma.position.findMany({
      where: { tenantId },
      select: {
        id: true,
        department: { select: { id: true, name: true } },
        subDepartment: { select: { id: true, name: true } },
        grade: { select: { id: true, name: true } },
      },
    });

    const positionMap = new Map();
    positions.forEach((pos) => {
      positionMap.set(pos.id, pos);
    });

    const now = new Date();

    /* ===============================
       4️⃣ LOOP EMPLOYEES
    =============================== */

    for (const emp of employees) {
      const positionId = emp.workDetail[0]?.positionId;
      if (!positionId) continue;

      const position = positionMap.get(positionId);
      if (!position) continue;

      const matchedPolicies = policies.filter((policy) => {
        return (
          (policy.origin === "Position" &&
            policy.subOriginId === positionId) ||
          (policy.origin === "Department" &&
            policy.subOriginId === position.department?.id) ||
          (policy.origin === "Sub-department" &&
            policy.subOriginId === position.subDepartment?.id) ||
          (policy.origin === "Grade" &&
            policy.subOriginId === position.grade?.id)
        );
      });

      /* ===============================
         5️⃣ PROCESS POLICY
      =============================== */

      for (const policy of matchedPolicies) {
        for (const leaveType of policy.leaveTypes) {

          const joinDate = new Date(emp.workDetail[0]?.workJoiningDate || emp.created_at);

          let monthsWorked =
            (now.getFullYear() - joinDate.getFullYear()) * 12 +
            (now.getMonth() - joinDate.getMonth());

          // If the current day of the month is before the joining day, a full month hasn't passed.
          if (now.getDate() < joinDate.getDate()) {
            monthsWorked--;
          }

          if (monthsWorked < 0) continue; // Do not process employees who haven't joined yet

          const interval = leaveType.accrualInterval || 1;

          // Determine how many credits this employee should have by now.
          // The logic is: 1 credit on joining (month 0), then 1 for each completed interval.
          const creditsShouldExist = 1 + Math.floor(monthsWorked / interval);

          // Count how many credits have actually been given.
          const creditsGiven = await prisma.leaveLedger.count({
            where: {
              tenantId,
              employeeId: emp.id,
              leaveTypeId: leaveType.leaveTypeId,
              transactionType: "monthly_credit",
            },
          });

          const creditsToGive = creditsShouldExist - creditsGiven;

          // If the employee has enough or more credits, they are up-to-date.
          if (creditsToGive <= 0) {
            continue;
          }

          // If we are here, credit(s) are due. Calculate the total units to credit.
          const totalUnitsToCredit = new Prisma.Decimal(leaveType.unit).times(creditsToGive);

          const lastLedger = await prisma.leaveLedger.findFirst({
            where: {
              tenantId,
              employeeId: emp.id,
              leaveTypeId: leaveType.leaveTypeId,
            },
            orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
          });

          const previousBalance = lastLedger
            ? new Prisma.Decimal(lastLedger.balanceAfter)
            : new Prisma.Decimal(0);

          const newBalance = previousBalance.plus(totalUnitsToCredit);

          // Create a single ledger entry for all due credits
          await prisma.leaveLedger.create({
            data: {
              tenantId,
              employeeId: emp.id,
              leaveTypeId: leaveType.leaveTypeId,
              transactionType: "monthly_credit",
              referenceId: `accrual-catch-up-${creditsToGive}-credits`,
              units: totalUnitsToCredit,
              balanceAfter: newBalance,
              transactionDate: now, // Use current date for the transaction
              policyVersion: 1,
            },
          });
        }
      }
    }

    /* ===============================
       RESPONSE
    =============================== */

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