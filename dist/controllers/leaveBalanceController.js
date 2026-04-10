"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaveBalances = void 0;
const database_1 = require("@/config/database");
const client_1 = require("@prisma/client");
const getLeaveBalances = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        const { employeeId: queryEmployeeId } = req.query;
        // 1️⃣ Validate request
        if (!tenantId || !userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        let employeeId;
        // If an employeeId is passed in the query, use it (for admins/managers).
        // Otherwise, use the logged-in user's employeeId.
        if (queryEmployeeId) {
            // TODO: Add role check to ensure only admins/managers can do this
            employeeId = queryEmployeeId;
        }
        else {
            // 2️⃣ Get employeeId from User table
            const user = await database_1.prisma.user.findFirst({
                where: {
                    id: userId,
                    tenantId,
                },
                select: {
                    employeeId: true,
                    workEmail: true,
                },
            });
            employeeId = user?.employeeId;
            // Fallback: Try to find employee by email if not linked
            if (!employeeId && user?.workEmail) {
                const employee = await database_1.prisma.employee.findFirst({
                    where: {
                        tenantId,
                    },
                    select: { id: true },
                });
                if (employee) {
                    employeeId = employee.id;
                    // Auto-link for future
                    await database_1.prisma.user.update({
                        where: { id: userId },
                        data: { employeeId: employee.id },
                    });
                }
            }
        }
        if (!employeeId) {
            return res.status(404).json({
                success: false,
                message: "Employee not found for the user or query.",
            });
        }
        // 3️⃣ Get leave types
        const leaveTypes = await database_1.prisma.leaveType.findMany({
            where: { tenantId },
            select: {
                id: true,
                name: true,
            },
        });
        // ✨ NEW: Get total allocations for the current year
        const currentYearStart = new Date(new Date().getFullYear(), 0, 1);
        const allocations = await database_1.prisma.leaveLedger.groupBy({
            by: ["leaveTypeId"],
            where: {
                tenantId,
                employeeId,
                units: {
                    gt: 0,
                },
                transactionDate: {
                    gte: currentYearStart,
                },
            },
            _sum: {
                units: true,
            },
        });
        const allocationMap = new Map(allocations.map((a) => [a.leaveTypeId, a._sum.units || 0]));
        // ✨ NEW: Get pending leave requests to calculate provisional balance
        const pendingLeaves = await database_1.prisma.leaveRequest.findMany({
            where: {
                tenantId,
                employeeId,
                status: "PENDING",
            },
            select: {
                leaveTypeId: true,
                totalUnits: true,
            },
        });
        const pendingUnitsMap = new Map();
        for (const leave of pendingLeaves) {
            const current = pendingUnitsMap.get(leave.leaveTypeId) || new client_1.Prisma.Decimal(0);
            pendingUnitsMap.set(leave.leaveTypeId, current.plus(leave.totalUnits));
        }
        // 4️⃣ Get latest ledger for each leave type
        const balances = await Promise.all(leaveTypes.map(async (leaveType) => {
            const lastLedger = await database_1.prisma.leaveLedger.findFirst({
                where: {
                    tenantId,
                    employeeId,
                    leaveTypeId: leaveType.id,
                },
                orderBy: [
                    { transactionDate: "desc" },
                    { createdAt: "desc" },
                ],
            });
            const allocatedSum = allocationMap.get(leaveType.id);
            // The sum can be a Decimal object or 0. Ensure it's a number.
            const totalAllocation = allocatedSum ? Number(allocatedSum.toString()) : 0;
            const ledgerBalance = lastLedger
                ? new client_1.Prisma.Decimal(lastLedger.balanceAfter)
                : new client_1.Prisma.Decimal(0);
            const pendingUnits = pendingUnitsMap.get(leaveType.id) || new client_1.Prisma.Decimal(0);
            const finalBalance = ledgerBalance.minus(pendingUnits);
            // ✅ PASTE LOGS HERE
            return {
                employeeId,
                leaveTypeId: leaveType.id,
                leaveTypeName: leaveType.name,
                balance: Number(finalBalance.toString()),
                total: totalAllocation,
            };
        }));
        // 5️⃣ Response
        return res.status(200).json({
            success: true,
            employeeId,
            data: balances,
        });
    }
    catch (error) {
        console.error("Leave Balance Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
exports.getLeaveBalances = getLeaveBalances;
//# sourceMappingURL=leaveBalanceController.js.map