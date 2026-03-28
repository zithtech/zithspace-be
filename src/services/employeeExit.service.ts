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

    // Resolve User.id to Employee.id if necessary
    const user = await prisma.user.findUnique({
      where: { id: data.employeeId },
      select: { employeeId: true }
    });

    if (user?.employeeId) {
      console.log(`[ExitRequest] Mapping User.id ${data.employeeId} to Employee.id ${user.employeeId}`);
      finalEmployeeId = user.employeeId;
    }

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
        noticePeriodDay: new Date(data.noticePeriodDay),
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
