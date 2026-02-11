// import { Response } from "express";
// import { tenantAwarePrisma } from "@/config/database";
// import { AuthRequest, ApiResponse } from "@/types";

// export class PerformanceController {

//   /**
//    * Full employee performance (tickets + attendance)
//    */
//   static async getEmployeeFullPerformance(
//     req: AuthRequest,
//     res: Response
//   ): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context required",
//         } as ApiResponse);
//         return;
//       }

//       const { employeeId } = req.params;

//       const last30Days = new Date();
//       last30Days.setDate(last30Days.getDate() - 30);

//       const data = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {

//         /* ================= TICKET STATS ================= */
//         const tickets = await client.ticket.groupBy({
//           by: ["status"],
//           where: {
//             tenantId: req.tenantId,
//             assigneeId: employeeId,
//             createdAt: { gte: last30Days },
//             isDeleted: false,
//           },
//           _count: true,
//         });

//         let completed = 0;
//         let inProgress = 0;
//         let pending = 0;

//         tickets.forEach((t: any) => {
//           const status = t.status.toLowerCase();
//           const count = t._count;

//           if (["completed", "dev_complete", "live"].includes(status)) {
//             completed += count;
//           } else if (["in_progress", "in_testing", "in_review"].includes(status)) {
//             inProgress += count;
//           } else { // not_started, open, blocked, etc.
//             pending += count;
//           }
//         });

//         /* ================= ATTENDANCE STATS ================= */
//         const attendance = await client.attendance.findMany({
//           where: {
//             tenantId: req.tenantId,
//             userId: employeeId,
//             date: { gte: last30Days },
//             clockIn: { not: null },
//             clockOut: { not: null }
//           }
//         });

//         let totalMinutes = 0;
//         let lateLogins = 0;
//         let earlyLogouts = 0; // Note: Early logout logic is based on a fixed time (6 PM)

//         attendance.forEach((r: any) => {
//           totalMinutes += r.effectiveWorkMinutes || 0;

//           if (r.lateMinutes && r.lateMinutes > 0) {
//             lateLogins++;
//           }

//           if (r.clockOut) {
//             const clockOutHour = new Date(r.clockOut).getHours();
//             // Assuming standard shift ends at 6 PM (18:00)
//             if (clockOutHour < 18) earlyLogouts++;
//           }
//         });

//         const avgHours =
//           attendance.length > 0
//             ? (totalMinutes / attendance.length / 60).toFixed(1)
//             : "0";

//         return {
//           tickets: {
//             completed,
//             inProgress,
//             pending,
//           },
//           attendance: {
//             avgHours,
//             lateLogins,
//             earlyLogouts,
//           },
//         };
//       });

//       res.status(200).json({
//         success: true,
//         data,
//       } as ApiResponse);

//     } catch (error) {
//       console.error("Performance error:", error);
//       res.status(500).json({
//         success: false,
//         error: "Failed to fetch performance",
//       } as ApiResponse);
//     }
//   }










//    /**
//    * Last 30 days BOD/EOD stats for employee
//    */
//   static async getDailyUpdateStats(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context required",
//         } as ApiResponse);
//         return;
//       }

//       const { employeeId } = req.params;

//       const last30Days = new Date();
//       last30Days.setDate(last30Days.getDate() - 30);

//       const data = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {

//         const updates = await client.dailyUpdate.findMany({
//           where: {
//             tenantId: req.tenantId,
//             userId: employeeId,
//             date: { gte: last30Days }
//           }
//         });

//         let bodSubmitted = 0;
//         let eodSubmitted = 0;
//         let missed = 0;

//         updates.forEach((u: any) => {
//           if (u.updateType === 'BOD') bodSubmitted++;
//           if (u.updateType === 'EOD') eodSubmitted++;
//           if (u.is_missed) missed++;
//         });

//         return {
//           bodSubmitted,
//           eodSubmitted,
//           missed
//         };
//       });

//       res.status(200).json({
//         success: true,
//         data
//       } as ApiResponse);

//     } catch (error) {
//       console.error("Daily update stats error:", error);
//       res.status(500).json({
//         success: false,
//         error: "Failed to fetch daily update stats",
//       } as ApiResponse);
//     }
//   }

  
//   /**
//    * Employee leave stats (last 30 days)
//    */
//   static async getLeaveStats(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.tenantId || !req.user) {
//         res.status(400).json({
//           success: false,
//           error: "Tenant context required",
//         } as ApiResponse);
//         return;
//       }

//       const { employeeId } = req.params;

//       const last30Days = new Date();
//       last30Days.setDate(last30Days.getDate() - 30);

//       const result = await tenantAwarePrisma.withTenant(req.tenantId, async (client) => {

//         // 1. Fetch leave types to know which are paid
//         const leaveTypes = await client.leaveType.findMany({
//           where: { tenantId: req.tenantId, isActive: true },
//           select: { name: true, isPaid: true }
//         });
//         const leaveTypePaidMap = new Map(leaveTypes.map(lt => [lt.name, lt.isPaid]));

//         // 2. Fetch approved leaves for the user in the last 30 days
//         const leaves = await client.leave.findMany({
//           where: {
//             tenantId: req.tenantId,
//             userId: employeeId,
//             status: "approved",
//             startDate: { gte: last30Days }
//           }
//         });

//         let leavesTaken = 0;
//         let permissions = 0;
//         let paid = 0;
//         let unpaid = 0;

//         leaves.forEach((l: any) => {
//           const duration = parseFloat(l.duration.toString());

//           if (l.type.toLowerCase() === "permission") {
//             permissions++;
//           } else {
//             leavesTaken += duration;
//           }

//           // Check if the leave type is paid from our map
//           if (leaveTypePaidMap.get(l.type)) {
//             paid += duration;
//           } else {
//             unpaid += duration;
//           }
//         });

//         return {
//           leavesTaken,
//           permissions,
//           paid,
//           unpaid
//         };
//       });

//       res.status(200).json({
//         success: true,
//         data: result
//       } as ApiResponse);

//     } catch (error) {
//       console.error("Leave stats error:", error);
//       res.status(500).json({
//         success: false,
//         error: "Failed to fetch leave stats",
//       } as ApiResponse);
//     }
//   }
// }
