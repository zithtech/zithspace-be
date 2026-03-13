import { AuthRequest } from "@/types";
import { prisma } from "@/config/database";
import { not } from "joi";

// ✅ CREATE Employment Details

export async function createEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    const { employment } = req.body;

    await tx.employeeWorkDetail.create({
      data: {
        employeeId,
        positionId: employment.positionId || null,
        team: employment.team || null,
        employeeType: employment.employeeType || null,

        workType: employment.workType || null,
        hybridMode: employment.hybridMode || null,
        fixedDays: employment.fixedDays || [],
        totalDays: employment.totalDays || null,
        totalHours: employment.totalHours || null,
        notice_period: employment.noticePeriod || null,
        // workJoiningDate: employment.employeeJoiningDate
        //   ? new Date(employment.employeeJoiningDate)
        //   : null,
        workJoiningDate: employment.employeeJoiningDate || "",

        workLocation: employment.workLocation || null,
        workShift: employment.workShift || null, // Stores the JSON string from frontend
        createdById: req.user?.id,
      },
    });

    await tx.employeeAdditionalDetail.create({
      data: {
        employeeId,
        employeeGrade: employment.employeeGrade || null,
        promotionStatus: employment.promotionStatus || null,
        createdById: employeeId,
        updatedById: employeeId,
      },
    });

    await tx.employeeTimeline.create({
      data: {
        employeeId,
        joiningDate: new Date(employment.joiningDate) || null,
        //joiningDate: employment.joiningDate,
        trainingCompletionDate: new Date(employment.trainingCompletion) || null,
        //trainingCompletionDate: employment.trainingCompletion,
        createdById: employeeId,
        updatedById: employeeId,
      },
    });

    await tx.employeeProjectMapping.createMany({
      data: employment.projects.map((project: string) => ({
        employeeId,
        projectName: project || null,
        reportingManager: employment.reportingManager || null,
        createdById: employeeId,
        updatedById: employeeId,
      })),
    });

    return {
      success: true,
      message: "Employment details created successfully",
    };
  } catch (error) {
    console.error("Error in createEmploymentDetails:", error);
    throw error;
  }
}

// ✅ GET Employment Details
export async function getEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const workDetails = await prisma.employeeWorkDetail.findFirst({
      where: { employeeId },
    });

    const additionalDetails = await prisma.employeeAdditionalDetail.findFirst({
      where: { employeeId },
    });

    const timeline = await prisma.employeeTimeline.findFirst({
      where: { employeeId },
    });

    const projects = await prisma.employeeProjectMapping.findMany({
      where: { employeeId },
    });

    if (!workDetails) {
      throw new Error("Employment details not found");
    }

    return {
      positionId: workDetails.positionId,
      team: workDetails.team,
      employeeType: workDetails.employeeType,
      workLocation: workDetails.workLocation,
      workShift: workDetails.workShift,
      workType: workDetails.workType || null,
      hybridMode: workDetails.hybridMode || null,
      fixedDays: workDetails.fixedDays || [],
      totalDays: workDetails.totalDays || null,
      totalHours: workDetails.totalHours || null,
      noticePeriod: workDetails.notice_period || null,
      employeeJoiningDate: workDetails.workJoiningDate || null,
      employeeGrade: additionalDetails?.employeeGrade || null,
      promotionStatus: additionalDetails?.promotionStatus || null,
      joiningDate: timeline?.joiningDate || null,
      trainingCompletion: timeline?.trainingCompletionDate || null,
      projects: projects.map((p) => p.projectName),
      reportingManager: projects[0]?.reportingManager || null,
    };
  } catch (error) {
    console.error("Error in getEmploymentDetails:", error);
    throw error;
  }
}

export async function getAllEmploymentDetails(req: AuthRequest) {
  try {
    if (!req.user?.id || !req.tenantId) {
      throw new Error("Unauthorized");
    }

    const employees = await prisma.employee.findMany({
      where: {
        tenantId: req.tenantId,
        status: true,
      },
      include: {
        workDetail: {
          orderBy: { createdAt: "desc" },
        },
        additionalDetails: {
          orderBy: { createdAt: "desc" },
        },
        employeeTimeline: {
          orderBy: { createdAt: "desc" },
        },
        projectMappings: true,
      },
    });

    return employees.map((employee) => {
      const latestWorkDetail = employee.workDetail[0] || null;
      const latestAdditionalDetail = employee.additionalDetails[0] || null;
      const latestTimeline = employee.employeeTimeline[0] || null;

      return {
        id: employee.id,
        employeeCode: employee.employee_code,
        firstName: employee.first_name,
        lastName: employee.last_name,

        positionId: latestWorkDetail?.positionId || null,
        team: latestWorkDetail?.team || null,
        employeeType: latestWorkDetail?.employeeType || null,
        workLocation: latestWorkDetail?.workLocation || null,
        workShift: latestWorkDetail?.workShift || null,
        employeeJoiningDate: latestWorkDetail?.workJoiningDate || null,
        noticePeriod: latestWorkDetail?.notice_period || null,
        workType: latestWorkDetail?.workType || null,
        hybridMode: latestWorkDetail?.hybridMode || null,
        fixedDays: latestWorkDetail?.fixedDays || [],
        totalDays: latestWorkDetail?.totalDays || null,
        totalHours: latestWorkDetail?.totalHours || null,

        employeeGrade: latestAdditionalDetail?.employeeGrade || null,
        promotionStatus: latestAdditionalDetail?.promotionStatus || null,

        joiningDate: latestTimeline?.joiningDate || null,
        trainingCompletion: latestTimeline?.trainingCompletionDate || null,

        projects: employee.projectMappings.map(
          (project) => project.projectName,
        ),
        reportingManager: employee.projectMappings[0]?.reportingManager || null,
      };
    });
  } catch (error) {
    console.error("Error in getAllEmploymentDetails:", error);
    throw error;
  }
}

// ✅ UPDATE Employment Details
export async function updateEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { employment } = req.body;

    if (!employment) {
      throw new Error("Employment details are missing from the request body");
    }

    // Verify employee exists and belongs to tenant
    const employee = await tx.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // ✅ Update Work Details
    const existingWorkDetails = await tx.employeeWorkDetail.findFirst({
      where: { employeeId },
    });

    if (existingWorkDetails) {
      await tx.employeeWorkDetail.update({
        where: { id: existingWorkDetails.id },
        data: {
          positionId: employment.positionId,
          team: employment.team,
          employeeType: employment.employeeType,
          workLocation: employment.workLocation,
          workShift: employment.workShift, // Stores the JSON string from frontend
          workType: employment.workType || null,
          hybridMode: employment.hybridMode || null,
          fixedDays: employment.fixedDays || [],
          totalDays: employment.totalDays || null,
          totalHours: employment.totalHours || null,
          workJoiningDate: employment.employeeJoiningDate || null,
          notice_period: employment.noticePeriod || null,

          // workJoiningDate: employment.employeeJoiningDate
          //   ? new Date(employment.employeeJoiningDate)
          //   : null,

          updatedById: req.user.id,
        },
      });
    } else {
      await tx.employeeWorkDetail.create({
        data: {
          employeeId,
          positionId: employment.positionId || null,
          team: employment.team || null,
          employeeType: employment.employeeType || null,
          workLocation: employment.workLocation || null,
          workShift: employment.workShift || null,
          workType: employment.workType || null,
          hybridMode: employment.hybridMode || null,
          fixedDays: employment.fixedDays || [],
          totalDays: employment.totalDays || null,
          totalHours: employment.totalHours || null,
          notice_period: employment.noticePeriod || null,
          workJoiningDate: employment.employeeJoiningDate
            ? employment?.employeeJoiningDate
            : null,
          createdById: req.user.id,
        },
      });
    }

    // ✅ Update Additional Details
    const existingAdditionalDetails =
      await tx.employeeAdditionalDetail.findFirst({
        where: { employeeId },
      });

    if (existingAdditionalDetails) {
      await tx.employeeAdditionalDetail.update({
        where: { id: existingAdditionalDetails.id },
        data: {
          employeeGrade: employment.employeeGrade,
          promotionStatus: employment.promotionStatus,
          updatedById: employeeId,
        },
      });
    } else {
      await tx.employeeAdditionalDetail.create({
        data: {
          employeeId,
          employeeGrade: employment.employeeGrade,
          promotionStatus: employment.promotionStatus,
          createdById: employeeId,
          updatedById: employeeId,
        },
      });
    }

    // ✅ Update Timeline
    const existingTimeline = await tx.employeeTimeline.findFirst({
      where: { employeeId },
    });

    if (existingTimeline) {
      await tx.employeeTimeline.update({
        where: { id: existingTimeline.id },
        data: {
          joiningDate: new Date(employment.joiningDate),
          trainingCompletionDate: new Date(employment.trainingCompletion),
          updatedById: req.user.id,
        },
      });
    } else {
      await tx.employeeTimeline.create({
        data: {
          employeeId,
          joiningDate: new Date(employment.joiningDate),
          trainingCompletionDate: new Date(employment.trainingCompletion),
          createdById: req.user.id,
          updatedById: req.user.id,
        },
      });
    }

    // ✅ Update Projects (Delete old and create new)
    await tx.employeeProjectMapping.deleteMany({
      where: { employeeId },
    });

    if (employment.projects && employment.projects.length > 0) {
      await tx.employeeProjectMapping.createMany({
        data: employment.projects.map((project: string) => ({
          employeeId,
          projectName: project,
          reportingManager: employment.reportingManager || null,
          createdById: employeeId,
          updatedById: employeeId,
        })),
      });
    }

    return {
      success: true,
      message: "Employment details updated successfully",
    };
  } catch (error) {
    console.error("Error in updateEmploymentDetails:", error);
    throw error;
  }
}

// ✅ DELETE Employment Details (Soft delete - removes employment records but keeps employee)
export async function deleteEmploymentDetails(
  req: AuthRequest,
  employeeId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Delete all employment-related records
    await prisma.employeeWorkDetail.deleteMany({
      where: { employeeId },
    });

    await prisma.employeeAdditionalDetail.deleteMany({
      where: { employeeId },
    });

    await prisma.employeeTimeline.deleteMany({
      where: { employeeId },
    });

    await prisma.employeeProjectMapping.deleteMany({
      where: { employeeId },
    });

    return {
      success: true,
      message: "Employment details deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteEmploymentDetails:", error);
    throw error;
  }
}

// ✅ DELETE Specific Project Mapping
export async function deleteProjectMapping(
  req: AuthRequest,
  employeeId: string,
  projectName: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    await prisma.employeeProjectMapping.deleteMany({
      where: {
        employeeId,
        projectName,
      },
    });

    return {
      success: true,
      message: "Project mapping deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteProjectMapping:", error);
    throw error;
  }
}
