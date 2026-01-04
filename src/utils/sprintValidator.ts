import { prisma } from "@/config/database";
import { ReleasePlan } from "@prisma/client";

/**
 * Sprint Validator - Enforces sprint lifecycle rules
 * 
 * Rules:
 * 1. Only ONE active sprint per project at a time
 * 2. Cannot create new sprint if active sprint exists
 * 3. Cannot start sprint if another is active
 * 4. Must complete current sprint before starting new one
 * 5. Demo/Release plans are independent (no restrictions)
 */
export class SprintValidator {
  /**
   * Check if project has an active sprint
   */
  static async hasActiveSprint(
    projectId: string,
    tenantId: string
  ): Promise<boolean> {
    const activeSprint = await prisma.releasePlan.findFirst({
      where: {
        projectId,
        tenantId,
        type: "sprint_plan",
        status: "active",
      },
    });

    return !!activeSprint;
  }

  /**
   * Get active sprint for project
   */
  static async getActiveSprint(
    projectId: string,
    tenantId: string
  ): Promise<
    | (ReleasePlan & {
        tickets: Array<{
          id: string;
          ticketNumber: string;
          title: string;
          status: string;
          storyPoint: number;
          priority: string;
          assignee?: { id: string; name: string; workEmail: string } | null;
        }>;
      })
    | null
  > {
    const activeSprint = await prisma.releasePlan.findFirst({
      where: {
        projectId,
        tenantId,
        type: "sprint_plan",
        status: "active",
      },
      include: {
        tickets: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            status: true,
            storyPoint: true,
            priority: true,
            assignee: {
              select: {
                id: true,
                name: true,
                workEmail: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    return activeSprint as any;
  }

  /**
   * Validate if new sprint can be created
   */
  static async validateNewSprint(
    projectId: string,
    tenantId: string
  ): Promise<{ valid: boolean; error?: string; activeSprint?: ReleasePlan }> {
    const activeSprint = await prisma.releasePlan.findFirst({
      where: {
        projectId,
        tenantId,
        type: "sprint_plan",
        status: "active",
      },
    });

    if (activeSprint) {
      return {
        valid: false,
        error:
          "Cannot create a new sprint while another sprint is active. Please complete the current sprint first.",
        activeSprint,
      };
    }

    return { valid: true };
  }

  /**
   * Validate if sprint can be started
   */
  static async validateStartSprint(
    sprintId: string,
    projectId: string,
    tenantId: string
  ): Promise<{ valid: boolean; error?: string; sprint?: ReleasePlan }> {
    // Check if this sprint exists and is in planning status
    const sprint = await prisma.releasePlan.findFirst({
      where: { id: sprintId, tenantId },
    });

    if (!sprint) {
      return { valid: false, error: "Sprint not found" };
    }

    if (sprint.type !== "sprint_plan") {
      return {
        valid: false,
        error: "Only sprint plans can be started. This is a " + sprint.type,
      };
    }

    // Map "planned" status to "planning" for backward compatibility
    const sprintStatus = sprint.status === "planned" ? "planning" : sprint.status;

    if (sprintStatus !== "planning" && sprint.status !== "planned") {
      return {
        valid: false,
        error: `Sprint is already ${sprint.status}. Only planning sprints can be started.`,
        sprint,
      };
    }

    // Check for other active sprints in same project
    const hasActive = await this.hasActiveSprint(projectId, tenantId);

    if (hasActive) {
      return {
        valid: false,
        error:
          "Another sprint is already active in this project. Complete it before starting a new sprint.",
      };
    }

    return { valid: true, sprint };
  }

  /**
   * Validate if sprint can be completed
   */
  static async validateCompleteSprint(
    sprintId: string,
    tenantId: string
  ): Promise<{ valid: boolean; error?: string; sprint?: ReleasePlan }> {
    const sprint = await prisma.releasePlan.findFirst({
      where: { id: sprintId, tenantId },
    });

    if (!sprint) {
      return { valid: false, error: "Sprint not found" };
    }

    if (sprint.type !== "sprint_plan") {
      return {
        valid: false,
        error: "Only sprint plans can be completed",
      };
    }

    if (sprint.status !== "active") {
      return {
        valid: false,
        error: `Sprint is ${sprint.status}. Only active sprints can be completed.`,
        sprint,
      };
    }

    return { valid: true, sprint };
  }

  /**
   * Calculate sprint metrics
   */
  static async calculateSprintMetrics(sprintId: string, tenantId: string) {
    const sprint = await prisma.releasePlan.findFirst({
      where: { id: sprintId, tenantId },
      include: {
        tickets: {
          select: {
            id: true,
            status: true,
            storyPoint: true,
          },
        },
      },
    });

    if (!sprint) {
      return null;
    }

    const totalTickets = sprint.tickets.length;
    const completedTickets = sprint.tickets.filter(
      (t) => t.status === "completed"
    ).length;
    const inProgressTickets = sprint.tickets.filter(
      (t) => t.status === "in_progress"
    ).length;
    const notStartedTickets = sprint.tickets.filter(
      (t) => t.status === "not_started" || t.status === "open"
    ).length;

    const totalPoints = sprint.tickets.reduce(
      (sum, t) => sum + (t.storyPoint || 0),
      0
    );
    const completedPoints = sprint.tickets
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + (t.storyPoint || 0), 0);
    const inProgressPoints = sprint.tickets
      .filter((t) => t.status === "in_progress")
      .reduce((sum, t) => sum + (t.storyPoint || 0), 0);

    const progress =
      totalTickets > 0 ? Math.round((completedTickets / totalTickets) * 100) : 0;

    return {
      totalTickets,
      completedTickets,
      inProgressTickets,
      notStartedTickets,
      totalPoints,
      completedPoints,
      inProgressPoints,
      progress,
    };
  }

  /**
   * Get sprint velocity (average story points from last N completed sprints)
   */
  static async getProjectVelocity(
    projectId: string,
    tenantId: string,
    lastNSprints: number = 5
  ) {
    const completedSprints = await prisma.releasePlan.findMany({
      where: {
        projectId,
        tenantId,
        type: "sprint_plan",
        status: "completed",
      },
      orderBy: {
        completedAt: "desc",
      },
      take: lastNSprints,
      select: {
        id: true,
        version: true,
        completedPoints: true,
        committedPoints: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (completedSprints.length === 0) {
      return {
        avgVelocity: 0,
        sprints: [],
        totalSprints: 0,
      };
    }

    const totalCompletedPoints = completedSprints.reduce(
      (sum, sprint) => sum + (sprint.completedPoints || 0),
      0
    );
    const avgVelocity = Math.round(totalCompletedPoints / completedSprints.length);

    return {
      avgVelocity,
      sprints: completedSprints.map((sprint) => ({
        name: sprint.version,
        completedPoints: sprint.completedPoints,
        committedPoints: sprint.committedPoints,
        startDate: sprint.startedAt,
        endDate: sprint.completedAt,
      })),
      totalSprints: completedSprints.length,
    };
  }
}
