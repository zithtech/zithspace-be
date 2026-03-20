import { prisma } from "@/config/database";
import { EmployeeExit, Prisma } from "@prisma/client";
import { v4 as uuidv4 } from 'uuid';

export class EmployeeExitService {
  async createExitRequest(
    tenantId: string,
    data: any,
    createdById: string
  ): Promise<EmployeeExit> {
    return await prisma.employeeExit.create({
      data: {
        id: uuidv4(),
        tenant: { connect: { id: tenantId } },
        employee: { connect: { id: data.employeeId } },
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
        createdBy: { connect: { id: createdById } },
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

    // Resolve reporting manager names
    const managerIds = Array.from(new Set(requests.map(r => r.reportingManagerId).filter(Boolean))) as string[];
    const managers = await prisma.employee.findMany({
      where: { id: { in: managerIds } },
      select: { id: true, first_name: true, last_name: true }
    });

    const managerMap = new Map(managers.map(m => [m.id, `${m.first_name} ${m.last_name}`]));

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
      const manager = await prisma.employee.findUnique({
        where: { id: request.reportingManagerId },
        select: { first_name: true, last_name: true }
      });
      if (manager) {
        reportingManagerName = `${manager.first_name} ${manager.last_name}`;
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
