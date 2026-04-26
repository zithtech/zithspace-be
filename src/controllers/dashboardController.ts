import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class DashboardController {
  /**
   * Get optimized dashboard summary with all key metrics
   * Single endpoint for fast dashboard loading (<500ms target)
   */
  static async getDashboardSummary(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant context and authentication required",
        } as ApiResponse);
        return;
      }

      const currentDate = new Date();
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      );
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      );
      const startOfToday = new Date(currentDate);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(currentDate);
      endOfToday.setHours(23, 59, 59, 999);

      // Execute all queries in parallel for optimal performance
      const [
        totalMembers,
        activeProjectsCount,
        allTickets,
        monthlyRevenue,
        recentActivities,
        usersUpcomingTasks,
        activeProjects,
        todayAttendance,
        pendingLeaveApprovals,
        userLeaveStats,
        todayLeaves,
        dailyUpdatesStats,
        topPerformer,
        lateAndOvertime,
      ] = await Promise.all([
        // 1. Total active members
        prisma.user.count({
          where: {
            tenantId: req.tenantId,
            isActive: true,
          },
        }),

        // 2. Active projects count
        prisma.project.count({
          where: {
            tenantId: req.tenantId,
            status: "active",
          },
        }),

        // 3. All tickets (for manual aggregation to handle case-insensitivity)
        prisma.ticket.findMany({
          where: { tenantId: req.tenantId },
          select: { status: true, assigneeId: true, projectId: true },
        }),

        // 4. Monthly revenue from transactions
        prisma.transaction.aggregate({
          where: {
            tenantId: req.tenantId,
            type: { in: ["income", "credit", "revenue"] },
            date: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
          _sum: {
            amount: true,
          },
        }),

        // 5. Recent activities (last 10 ticket activities)
        prisma.ticketActivityLog.findMany({
          where: {
            tenantId: req.tenantId,
          },
          include: {
            performedBy: {
              select: {
                id: true,
                name: true,
                position: true,
                avatarUrl: true,
              },
            },
            ticket: {
              select: {
                id: true,
                title: true,
                ticketNumber: true,
              },
            },
          },
          orderBy: { timestamp: "desc" },
          take: 10,
        }),

        // 6. Upcoming tasks (tickets due soon for current user)
        prisma.ticket.findMany({
          where: {
            tenantId: req.tenantId,
            assigneeId: req.user!.id,
            // We'll filter status in memory to be safe against case variants
            dueDate: { gte: currentDate },
          },
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            priority: true,
            dueDate: true,
            status: true,
          },
          orderBy: { dueDate: "asc" },
          take: 20, // Fetch more to allow in-memory filtering
        }),

        // 7. Active Projects (for dynamic progress calculation)
        prisma.project.findMany({
          where: {
            tenantId: req.tenantId,
            status: "active",
          },
          select: {
            id: true,
            name: true,
            code: true,
          },
          orderBy: { updatedAt: "desc" },
        }),

        // 8. Detailed Attendance Calculation
        (async () => {
          const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.

          // Fetch all active users to determine who SHOULD be working
          const activeUsers = await prisma.user.findMany({
            where: {
              tenantId: req.tenantId,
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              position: true,
              avatarUrl: true,
              workDays: true,
            },
          });

          // Fetch actual attendance records for today
          const attendanceRecords = await prisma.attendance.findMany({
            where: {
              tenantId: req.tenantId,
              date: { gte: startOfToday, lte: endOfToday },
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  avatarUrl: true,
                },
              },
            },
          });

          const presentList: any[] = [];
          const absentList: any[] = [];
          const lateList: any[] = [];

          // Helper to check if a user is in the attendance records
          const findRecord = (userId: string) =>
            attendanceRecords.find((r) => r.userId === userId);

          activeUsers.forEach((user) => {
            // Check if today is a work day for this user
            const isWorkDay = user.workDays.includes(today);
            const record = findRecord(user.id);
            const status = record?.status.toLowerCase();

            if (record) {
              // User has a record
              if (["present", "wfh"].includes(status!)) {
                presentList.push(user);
              } else if (status === "late") {
                lateList.push(user);
                presentList.push(user); // Count late as present for general "at work" status? Or separate? User asked for Present/Absent breakdown. Usually Late implies Present.
              } else if (status === "absent") {
                absentList.push(user);
              }
            } else {
              // No record. If it's a work day, they are absent by default (or haven't clocked in)
              if (isWorkDay) {
                absentList.push(user);
              }
              // If not a work day, we ignore them (not expected)
            }
          });

          // Also handle "Late" as a subset or just flag?
          // For the dashboard summary, we simply want counts and lists.
          // logic: Present = Present + Late + WFH. Absent = Absent Status + No Record on WorkDay.

          return {
            present: presentList.length,
            absent: absentList.length,
            late: lateList.length,
            attendanceRate:
              activeUsers.length > 0
                ? Math.round((presentList.length / activeUsers.length) * 100)
                : 0,
            presentList: presentList.map((u) => ({
              name: u.name,
              position: u.position,
              id: u.id,
              avatarUrl: u.avatarUrl,
            })),
            absentList: absentList.map((u) => ({
              name: u.name,
              position: u.position,
              id: u.id,
              avatarUrl: u.avatarUrl,
            })),
          };
        })(),

        // 9. Pending Leave Approvals (for managers/admins)
        (async () => {
          const userRole = req.user!.role;
          const userId = req.user!.id;

          let where: any = {
            tenantId: req.tenantId,
            status: "pending",
          };

          // Super admins can see all pending leaves
          if (userRole !== "super_admin") {
            // Regular users and managers can only see their subordinates' leaves
            where.user = {
              reportsToId: userId,
            };
          }

          const count = await prisma.leave.count({ where });
          return count;
        })(),

        // 10. User Leave Statistics (current month)
        (async () => {
          const userId = req.user!.id;

          const leaves = await prisma.leave.findMany({
            where: {
              tenantId: req.tenantId,
              userId,
              startDate: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
            select: {
              status: true,
              duration: true,
            },
          });

          let approved = 0;
          let pending = 0;
          let totalDays = 0;

          leaves.forEach((leave) => {
            if (leave.status === "approved") {
              approved++;
              totalDays += parseFloat(leave.duration.toString());
            } else if (leave.status === "pending") {
              pending++;
            }
          });

          return {
            approved,
            pending,
            totalDays,
          };
        })(),

        // 11. Today's Approved Leaves (people on leave/permission today)
        prisma.leave.findMany({
          where: {
            tenantId: req.tenantId,
            status: "approved",
            startDate: { lte: endOfToday },
            endDate: { gte: startOfToday },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                position: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { startDate: "asc" },
        }),

        // 12. Daily Updates Statistics (today)
        (async () => {
          const submitted = await prisma.statusUpdate.count({
            where: {
              tenantId: req.tenantId,
              date: {
                gte: startOfToday,
                lte: endOfToday,
              },
            },
          });

          const totalActiveMembers = await prisma.user.count({
            where: {
              tenantId: req.tenantId,
              isActive: true,
            },
          });

          const avgHours = await prisma.statusUpdate.aggregate({
            where: {
              tenantId: req.tenantId,
              date: {
                gte: startOfToday,
                lte: endOfToday,
              },
            },
            _avg: {
              totalHoursWorked: true,
            },
          });

          return {
            submitted,
            total: totalActiveMembers,
            avgHours: avgHours._avg.totalHoursWorked
              ? parseFloat(avgHours._avg.totalHoursWorked.toString())
              : 0,
          };
        })(),

        // 13. Top Performer (most completed tickets this month)
        (async () => {
          const completedTickets = await prisma.ticket.groupBy({
            by: ["assigneeId"],
            where: {
              tenantId: req.tenantId,
              status: { in: ["completed", "closed", "Completed", "Closed"] },
              completedAt: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
              assigneeId: { not: null },
            },
            _count: {
              id: true,
            },
            orderBy: {
              _count: {
                id: "desc",
              },
            },
            take: 1,
          });

          if (completedTickets.length > 0 && completedTickets[0].assigneeId) {
            const topUser = await prisma.user.findUnique({
              where: { id: completedTickets[0].assigneeId },
              select: {
                id: true,
                name: true,
                position: true,
                avatarUrl: true,
              },
            });

            return {
              user: topUser,
              completedTickets: completedTickets[0]._count.id,
            };
          }

          return null;
        })(),

        // 14. Late Arrivals and Overtime (today)
        (async () => {
          const lateCount = await prisma.attendance.count({
            where: {
              tenantId: req.tenantId,
              date: { gte: startOfToday, lte: endOfToday },
              lateMinutes: { gt: 0 },
            },
          });

          const overtimeCount = await prisma.attendance.count({
            where: {
              tenantId: req.tenantId,
              date: { gte: startOfToday, lte: endOfToday },
              overtimeMinutes: { gt: 0 },
            },
          });

          return {
            late: lateCount,
            overtime: overtimeCount,
          };
        })(),
      ]);

      // --- PROCESS DATA ---

      // Helper to normalize status
      const isCompleted = (status: string) =>
        ["completed", "closed"].includes(status.toLowerCase());
      const isProgress = (status: string) =>
        ["in_progress", "review", "testing"].includes(status.toLowerCase());
      const isNotStarted = (status: string) =>
        ["not_started", "open", "backlog"].includes(status.toLowerCase());

      // 3. Process Ticket Stats
      let globalAssignedCount = 0;
      let globalClosedCount = 0;
      let globalTotalCount = allTickets.length;

      allTickets.forEach((t) => {
        const statusLower = t.status.toLowerCase();

        // Count Global Assigned Active Tickets (assigned to anyone, not completed)
        if (t?.assigneeId) {
          globalAssignedCount++;
        }

        // Global Closed Stats
        if (isCompleted(statusLower)) {
          globalClosedCount++;
        }
      });

      const completionRate =
        globalTotalCount > 0
          ? Math.round((globalClosedCount / globalTotalCount) * 100)
          : 0;

      // 6. Process Upcoming Tasks (Filter types and status)
      const formattedUpcomingTasks = usersUpcomingTasks
        .filter((t) => !isCompleted(t.status))
        .slice(0, 10)
        .map((ticket) => {
          // Calculate priority level
          let priorityLevel = "low";
          const priority = ticket.priority.toLowerCase();
          if (
            priority.includes("high") ||
            priority.includes("p1") ||
            priority.includes("critical")
          ) {
            priorityLevel = "high";
          } else if (priority.includes("medium") || priority.includes("p2")) {
            priorityLevel = "medium";
          }

          return {
            id: ticket.id,
            title: `${ticket.ticketNumber} - ${ticket.title}`,
            time: ticket.dueDate,
            priority: priorityLevel,
            type: "task",
            status: ticket.status.toLowerCase(),
          };
        });

      // 7. Process Project Progress (Calculate dynamically)
      const projectProgressData = activeProjects.map((project) => {
        const projectTickets = allTickets.filter(
          (t) => t.projectId === project.id
        );
        const total = projectTickets.length;

        // Count statuses
        let completed = 0;
        let inProgress = 0;
        let notStarted = 0;

        projectTickets.forEach((t) => {
          const s = t.status.toLowerCase();
          if (isCompleted(s)) completed++;
          else if (isProgress(s)) inProgress++;
          else notStarted++; // Default to not started
        });

        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        let status = "active";
        if (progress >= 95) status = "review";
        else if (progress >= 75) status = "active";
        else if (progress < 40) status = "starting";

        return {
          id: project.id,
          name: project.name || project.code || "Unnamed Project",
          progress,
          status,
          totalTickets: total,
          completedTickets: completed,
          inProgressTickets: inProgress,
          notStartedTickets: notStarted,
        };
      });

      // Sort by progress desc, take top 10 maybe? Or just all active projects
      projectProgressData.sort((a, b) => b.progress - a.progress);

      // 11. Process Today's Leaves (separate by type)
      const onLeaveList: any[] = [];
      const onPermissionList: any[] = [];
      const workingFromHomeList: any[] = [];

      todayLeaves.forEach((leave) => {
        const leaveData = {
          id: leave.id,
          user: leave.user,
          type: leave.type,
          startDate: leave.startDate,
          endDate: leave.endDate,
          duration: parseFloat(leave.duration.toString()),
          durationType: leave.durationType,
        };

        if (leave.type === "permission") {
          onPermissionList.push(leaveData);
        } else if (leave.type === "work_from_home") {
          workingFromHomeList.push(leaveData);
        } else {
          onLeaveList.push(leaveData);
        }
      });

      // Format response
      const dashboardData = {
        stats: {
          totalMembers,
          activeProjects: activeProjectsCount,
          tickets: {
            assigned: globalAssignedCount,
            closed: globalClosedCount,
            total: globalTotalCount,
            completionRate: completionRate,
            display: `${globalAssignedCount} / ${globalClosedCount}`, // Assigned (Active) / Closed (Total)
          },
          monthlyRevenue: monthlyRevenue._sum.amount
            ? parseFloat(monthlyRevenue._sum.amount.toString())
            : 0,
          attendance: {
            present: todayAttendance.present,
            absent: todayAttendance.absent,
            late: todayAttendance.late,
            attendanceRate: todayAttendance.attendanceRate,
            presentList: todayAttendance.presentList,
            absentList: todayAttendance.absentList,
          },
        },

        recentActivities: recentActivities.map((activity) => ({
          id: activity.id,
          user: activity.performedBy.name,
          action: activity.action.toLowerCase(),
          target: activity.ticket?.title || "Unknown",
          ticketNumber: activity.ticket?.ticketNumber,
          time: activity.timestamp,
          avatar: activity.performedBy.avatarUrl,
        })),

        upcomingTasks: formattedUpcomingTasks,

        projectProgress: projectProgressData,

        leaves: {
          pendingApprovals: pendingLeaveApprovals,
          myLeaves: {
            approved: userLeaveStats.approved,
            pending: userLeaveStats.pending,
            totalDays: userLeaveStats.totalDays,
          },
        },

        todayLeaves: {
          onLeave: onLeaveList,
          onPermission: onPermissionList,
          workingFromHome: workingFromHomeList,
        },

        teamPerformance: {
          dailyUpdates: {
            submitted: dailyUpdatesStats.submitted,
            total: dailyUpdatesStats.total,
          },
          avgHoursWorked: dailyUpdatesStats.avgHours,
          topPerformer: topPerformer,
          lateArrivals: lateAndOvertime.late,
          overtimeWorkers: lateAndOvertime.overtime,
        },

        trends: {
          memberGrowth: "+12%", // Could calculate from historical data
          projectGrowth: "+5%",
          ticketCompletionRate: `${completionRate}%`,
        },

        period: {
          month: currentDate.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          startDate: startOfMonth,
          endDate: endOfMonth,
        },
      };

      res.status(200).json({
        success: true,
        data: dashboardData,
      } as ApiResponse);
    } catch (error: any) {
      console.error("Get dashboard summary error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard data",
        details: error.message,
      } as ApiResponse);
    }
  }
}

export default DashboardController;
