"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingApprovals = exports.cancelLeaveRequest = exports.updateLeaveStatus = exports.getLeaveRequests = exports.applyLeave = void 0;
const client_1 = require("@prisma/client");
const database_1 = require("@/config/database");
/* =========================================
   APPLY LEAVE
========================================= */
const applyLeave = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        const { leaveTypeId, fromDate, toDate, reason } = req.body;
        // 👇 Paste here — line ~123
        console.log("leave_type_id:", leaveTypeId);
        console.log("Full body:", req.body);
        if (!tenantId || !userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const user = await database_1.prisma.user.findUnique({
            where: { id: userId, tenantId },
            select: { employeeId: true },
        });
        if (!user?.employeeId) {
            return res.status(404).json({
                success: false,
                message: "Employee profile not found",
            });
        }
        const employeeId = user.employeeId;
        const start = new Date(fromDate);
        const end = new Date(toDate);
        if (start > end) {
            return res.status(400).json({
                success: false,
                message: "From date cannot be greater than To date",
            });
        }
        /* Overlapping leave check */
        const overlappingLeave = await database_1.prisma.leaveRequest.findFirst({
            where: {
                tenantId,
                employeeId,
                status: { in: ["PENDING", "APPROVED"] },
                OR: [
                    {
                        fromDate: { lte: end },
                        toDate: { gte: start },
                    },
                ],
            },
        });
        if (overlappingLeave) {
            return res.status(409).json({
                success: false,
                message: "Overlapping leave request exists",
            });
        }
        const LOP_LEAVE_TYPE_ID = "lop";
        /* Calculate leave days */
        let totalDays;
        if (leaveTypeId === LOP_LEAVE_TYPE_ID) {
            let count = 0;
            const curDate = new Date(start.getTime());
            while (curDate <= end) {
                const dayOfWeek = curDate.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0=Sun, 6=Sat
                    count++;
                }
                curDate.setDate(curDate.getDate() + 1);
            }
            totalDays = count;
            if (totalDays === 0) {
                return res.status(400).json({
                    success: false,
                    message: "LOP cannot be applied only on weekends. No working days in selected range.",
                });
            }
        }
        else {
            const diffTime = end.getTime() - start.getTime();
            totalDays = diffTime / (1000 * 60 * 60 * 24) + 1;
        }
        const totalUnits = new client_1.Prisma.Decimal(totalDays);
        /* Check leave balance */
        const lastLedger = await database_1.prisma.leaveLedger.findFirst({
            where: {
                tenantId,
                employeeId,
                leaveTypeId,
            },
            orderBy: {
                transactionDate: "desc",
            },
        });
        const balance = lastLedger
            ? new client_1.Prisma.Decimal(lastLedger.balanceAfter)
            : new client_1.Prisma.Decimal(0);
        let finalLeaveTypeId = leaveTypeId;
        if (leaveTypeId !== LOP_LEAVE_TYPE_ID) {
            if (balance.lessThan(totalUnits)) {
                finalLeaveTypeId = LOP_LEAVE_TYPE_ID;
            }
        }
        // Paste this BEFORE prisma.leaveRequest.create()
        const leaveTypeExists = await database_1.prisma.leaveType.findUnique({
            where: { id: leaveTypeId },
        });
        console.log("leaveTypeExists:", leaveTypeExists);
        const leaveRequest = await database_1.prisma.leaveRequest.create({
            data: {
                tenantId: req.user.tenantId,
                fromDate: new Date(fromDate),
                toDate: new Date(toDate),
                totalUnits: totalDays,
                reason: reason,
                createdById: req.user.id,
                employee: {
                    connect: { id: employeeId }
                },
                leaveType: {
                    connect: { id: leaveTypeId }
                }
            }
        });
        return res.json({
            success: true,
            message: "Leave applied successfully",
            data: leaveRequest,
        });
    }
    catch (error) {
        console.error("Apply Leave Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        });
    }
};
exports.applyLeave = applyLeave;
/* =========================================
   GET LEAVE REQUESTS
========================================= */
const getLeaveRequests = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        if (!tenantId || !userId) {
            return res.status(400).json({
                success: false,
                message: "Missing tenant or user",
            });
        }
        const user = await database_1.prisma.user.findUnique({
            where: { id: userId, tenantId },
            select: { employeeId: true },
        });
        if (!user?.employeeId) {
            return res.status(404).json({
                success: false,
                message: "Employee profile not found",
            });
        }
        let whereCondition = { tenantId };
        const team = await database_1.prisma.employeeProjectMapping.findMany({
            where: {
                reportingManager: userId,
            },
            select: {
                employeeId: true,
            },
        });
        const teamEmployeeIds = team.map((t) => t.employeeId);
        whereCondition.OR = [
            { employeeId: user.employeeId },
            ...(teamEmployeeIds.length > 0 ? [{
                    employeeId: { in: teamEmployeeIds },
                    status: { in: ["APPROVED", "REJECTED"] }
                }] : [])
        ];
        const leaveRequests = await database_1.prisma.leaveRequest.findMany({
            where: whereCondition,
            include: {
                employee: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                    },
                },
                leaveType: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                approvedByUser: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        const formatted = leaveRequests.map((leave) => ({
            ...leave,
            leaveType: leave.leaveType || {
                id: "lop",
                name: "Loss Of Pay (LOP)",
            },
        }));
        return res.json({
            success: true,
            data: formatted,
        });
    }
    catch (error) {
        console.error("Get Leave Requests Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
exports.getLeaveRequests = getLeaveRequests;
/* =========================================
   APPROVE / REJECT LEAVE
========================================= */
const updateLeaveStatus = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const approverId = req.user?.id;
        const { id } = req.params;
        const { status } = req.body;
        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status",
            });
        }
        const leaveRequest = await database_1.prisma.leaveRequest.findUnique({
            where: { id },
        });
        if (!leaveRequest || leaveRequest.tenantId !== tenantId) {
            return res.status(404).json({
                success: false,
                message: "Leave request not found",
            });
        }
        if (leaveRequest.status !== "PENDING") {
            return res.status(400).json({
                success: false,
                message: "Leave already processed",
            });
        }
        /* Reject Leave */
        if (status === "REJECTED") {
            const updated = await database_1.prisma.leaveRequest.update({
                where: { id },
                data: {
                    status: "REJECTED",
                    approvedById: approverId,
                    approvedAt: new Date(),
                },
            });
            return res.json({
                success: true,
                message: "Leave rejected",
                data: updated,
            });
        }
        /* Approve Leave + Ledger */
        const result = await database_1.prisma.$transaction(async (tx) => {
            const updated = await tx.leaveRequest.update({
                where: { id },
                data: {
                    status: "APPROVED",
                    approvedById: approverId,
                    approvedAt: new Date(),
                },
            });
            const lastLedger = await tx.leaveLedger.findFirst({
                where: {
                    tenantId,
                    employeeId: leaveRequest.employeeId,
                    leaveTypeId: leaveRequest.leaveTypeId,
                },
                orderBy: {
                    transactionDate: "desc",
                },
            });
            const previousBalance = lastLedger
                ? new client_1.Prisma.Decimal(lastLedger.balanceAfter)
                : new client_1.Prisma.Decimal(0);
            const newBalance = previousBalance.minus(new client_1.Prisma.Decimal(leaveRequest.totalUnits));
            await tx.leaveLedger.create({
                data: {
                    tenantId,
                    employeeId: leaveRequest.employeeId,
                    leaveTypeId: leaveRequest.leaveTypeId,
                    transactionType: "leave_debit",
                    referenceId: leaveRequest.id,
                    units: new client_1.Prisma.Decimal(leaveRequest.totalUnits).negated(),
                    balanceAfter: newBalance,
                    transactionDate: new Date(),
                    policyVersion: 1,
                    createdById: approverId,
                },
            });
            return updated;
        });
        return res.json({
            success: true,
            message: "Leave approved successfully",
            data: result,
        });
    }
    catch (error) {
        console.error("Update Leave Status Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
exports.updateLeaveStatus = updateLeaveStatus;
/* =========================================
   CANCEL LEAVE
========================================= */
const cancelLeaveRequest = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        const { id } = req.params;
        const leaveRequest = await database_1.prisma.leaveRequest.findUnique({
            where: { id },
        });
        if (!leaveRequest || leaveRequest.tenantId !== tenantId) {
            return res.status(404).json({
                success: false,
                message: "Leave not found",
            });
        }
        if (leaveRequest.createdById !== userId) {
            return res.status(403).json({
                success: false,
                message: "You cannot cancel this leave",
            });
        }
        if (leaveRequest.status !== "PENDING") {
            return res.status(400).json({
                success: false,
                message: "Only pending leave can be cancelled",
            });
        }
        const updated = await database_1.prisma.leaveRequest.update({
            where: { id },
            data: {
                status: "CANCELLED",
            },
        });
        return res.json({
            success: true,
            message: "Leave cancelled successfully",
            data: updated,
        });
    }
    catch (error) {
        console.error("Cancel Leave Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
exports.cancelLeaveRequest = cancelLeaveRequest;
/* =========================================
   GET PENDING APPROVALS (MANAGER / ADMIN)
========================================= */
const getPendingApprovals = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.user?.id;
        if (!tenantId || !userId) {
            return res.status(400).json({
                success: false,
                message: "Missing tenant or user",
            });
        }
        const user = await database_1.prisma.user.findUnique({
            where: { id: userId, tenantId },
            select: { employeeId: true, role: true },
        });
        if (!user?.employeeId) {
            return res.status(404).json({
                success: false,
                message: "Employee profile not found",
            });
        }
        /* Find employees reporting to this manager */
        const team = await database_1.prisma.employeeProjectMapping.findMany({
            where: {
                reportingManager: userId,
            },
            select: {
                employeeId: true,
            },
        });
        const employeeIds = team.map((t) => t.employeeId);
        if (employeeIds.length === 0) {
            return res.json({
                success: true,
                data: [],
            });
        }
        const approvals = await database_1.prisma.leaveRequest.findMany({
            where: {
                tenantId,
                employeeId: { in: employeeIds },
                status: "PENDING",
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        profile_pic: true,
                    },
                },
                leaveType: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        const formatted = approvals.map((leave) => ({
            ...leave,
            leaveType: leave.leaveType || {
                id: "lop",
                name: "Loss Of Pay (LOP)",
            },
        }));
        return res.json({
            success: true,
            data: formatted,
        });
    }
    catch (error) {
        console.error("Get Approvals Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
exports.getPendingApprovals = getPendingApprovals;
//# sourceMappingURL=leaverequestcontroller.js.map