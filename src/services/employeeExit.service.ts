import { prisma } from "@/config/database";
import { EmployeeExit, Prisma } from "@prisma/client";
import { randomUUID } from 'crypto';

export class EmployeeExitService {
  async createExitRequest(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<EmployeeExit> {
    let finalEmployeeId = data.employeeId;

    if (!finalEmployeeId) {
      throw new Error("Employee ID is required");
    }

    // --- ID Resolution Strategy ---
    // 1. Check if the provided ID is already a valid Employee ID
    const employeeExist = await prisma.employee.findUnique({
      where: { id: finalEmployeeId },
      select: { id: true }
    });

    if (!employeeExist) {
       // 2. If not an Employee ID, check if it is a User ID (Member ID)
       const userWithEmployee = await prisma.user.findUnique({
         where: { id: finalEmployeeId },
         select: { employeeId: true, name: true }
       });

       if (userWithEmployee?.employeeId) {
         // Found mapping from User to Employee
         finalEmployeeId = userWithEmployee.employeeId;
       } else if (userWithEmployee) {
         // Found User record but it has no employee linkage!
         throw new Error(`User "${userWithEmployee.name}" does not have an associated Employee record. Please link them first.`);
       } else {
         // Provided ID is neither a valid Employee ID nor a valid User ID
         throw new Error("The selected employee ID is invalid or cannot be resolved.");
       }
    }
    // ------------------------------
    return await prisma.employeeExit.create({
      data: {
        id: randomUUID(),
        tenantId,
        employeeId: finalEmployeeId,
        departmentId: data.departmentId || null,
        positionId: data.positionId || null,
        reportingManagerId: data.reportingManagerId && data.reportingManagerId !== "" ? data.reportingManagerId : null,
        exitTypeId: data.exitTypeId || null,
        exitReasonId: data.exitReasonId || null,
        resignationDate: new Date(data.resignationDate),
        proposedLastWorkingDay: new Date(data.proposedLastWorkingDay),
        // noticePeriodDay: new Date(data.noticePeriodDay),
        noticePeriodDay: data.noticePeriodDay ? new Date(data.noticePeriodDay) : null,
        waiveNoticePeriod: !!data.waiveNoticePeriod,
        buyoutRequired: !!data.buyoutRequired,
        buyoutAmount: data.buyoutAmount ? new Prisma.Decimal(data.buyoutAmount) : null,
        explanation: data.explanation || null,
        status: data.status || "PENDING",
        createdById,
      },
    });
  }

  async getExitRequests(tenantId: string): Promise<any[]> {
    const requests = await prisma.employeeExit.findMany({
      where: {
        tenantId,
      },
      include: {
        employee: {
          select: {
            first_name: true,
            last_name: true,
            employee_code: true,
          }
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Resolve reporting manager names (check User first, then Employee)
    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const managerIds = Array.from(new Set(requests.map(r => r.reportingManagerId).filter(id => id && isUuid(id)))) as string[];

    const userManagers = await prisma.user.findMany({
      where: { id: { in: managerIds } },
      select: { id: true, name: true }
    });

    const foundUserIds = new Set(userManagers.map(u => u.id));
    const remainingIds = managerIds.filter(id => !foundUserIds.has(id));

    const empManagers = await prisma.employee.findMany({
      where: { id: { in: remainingIds } },
      select: { id: true, first_name: true, last_name: true }
    });

    const managerMap = new Map<string, string>();
    userManagers.forEach(u => managerMap.set(u.id, u.name));
    empManagers.forEach(e => managerMap.set(e.id, `${e.first_name} ${e.last_name}`));

    return requests.map(r => ({
      ...r,
      reportingManagerName: r.reportingManagerId ? (managerMap.get(r.reportingManagerId) || r.reportingManagerId) : null
    }));
  }

  async getExitRequestById(tenantId: string, id: string): Promise<any | null> {
    const request = await prisma.employeeExit.findUnique({
      where: {
        id,
      },
      include: {
        employee: {
          select: {
            first_name: true,
            last_name: true,
            employee_code: true,
          }
        },
      }
    });

    if (!request || request.tenantId !== tenantId) {
      return null;
    }

    let reportingManagerName = null;
    if (request.reportingManagerId) {
      // Validate UUID before query
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.reportingManagerId);

      if (isUuid) {
        // Check User table first
        const userManager = await prisma.user.findUnique({
          where: { id: request.reportingManagerId },
          select: { name: true }
        });

        if (userManager) {
          reportingManagerName = userManager.name;
        } else {
          // Fallback to Employee table
          const manager = await prisma.employee.findUnique({
            where: { id: request.reportingManagerId },
            select: { first_name: true, last_name: true }
          });
          if (manager) {
            reportingManagerName = `${manager.first_name} ${manager.last_name}`;
          }
        }
      } else {
        reportingManagerName = request.reportingManagerId;
      }
    }

    return {
      ...request,
      reportingManagerName
    };
  }

  async deleteExitRequest(tenantId: string, id: string): Promise<EmployeeExit> {
    const existing = await this.getExitRequestById(tenantId, id);
    if (!existing) {
      throw new Error("Exit Request not found or access denied");
    }

    return await prisma.employeeExit.delete({
      where: {
        id,
      },
    });
  }
}

export const employeeExitService = new EmployeeExitService();
