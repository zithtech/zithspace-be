"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaveAllocationWithEmployees = void 0;
const client_1 = require("@prisma/client");
const database_1 = require("@/config/database");
const getLeaveAllocationWithEmployees = async (req, res) => {
    try {
        const tenantId = req.tenantId;
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
        const policies = await database_1.prisma.leaveOriginStructure.findMany({
            where: {
                tenantId,
                ...(origin && subOriginId
                    ? {
                        origin: origin,
                        subOriginId: subOriginId,
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
                        accrualInterval: true,
                    },
                },
            },
        });
        /* ===============================
           2️⃣ GET EMPLOYEES
        =============================== */
        const employees = await database_1.prisma.employee.findMany({
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
                },
            },
            orderBy: {
                first_name: "asc",
            },
        });
        const formattedEmployees = employees.map((emp) => ({
            employeeId: emp.id,
            fullName: `${emp.first_name} ${emp.last_name}`,
            positionId: emp.workDetail?.[0]?.positionId || null,
        }));
        /* ===============================
           3️⃣ GET POSITIONS
        =============================== */
        const positions = await database_1.prisma.position.findMany({
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
           4️⃣ PROCESS EMPLOYEES (BATCH)
        =============================== */
        const batchSize = 10;
        for (let i = 0; i < employees.length; i += batchSize) {
            const batch = employees.slice(i, i + batchSize);
            await Promise.all(batch.map(async (emp) => {
                const positionId = emp.workDetail?.[0]?.positionId;
                if (!positionId)
                    return;
                const position = positionMap.get(positionId);
                if (!position)
                    return;
                const matchedPolicies = policies.filter((policy) => {
                    return ((policy.origin === "Position" &&
                        policy.subOriginId === positionId) ||
                        (policy.origin === "Department" &&
                            policy.subOriginId === position.department?.id) ||
                        (policy.origin === "Sub-department" &&
                            policy.subOriginId === position.subDepartment?.id) ||
                        (policy.origin === "Grade" &&
                            policy.subOriginId === position.grade?.id));
                });
                for (const policy of matchedPolicies) {
                    for (const leaveType of policy.leaveTypes) {
                        /* ===============================
                           CHECK MONTHLY DUPLICATE CREDIT
                        =============================== */
                        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                        const existingCredit = await database_1.prisma.leaveLedger.findFirst({
                            where: {
                                tenantId,
                                employeeId: emp.id,
                                leaveTypeId: leaveType.leaveTypeId,
                                transactionType: "monthly_credit",
                                transactionDate: {
                                    gte: startOfMonth,
                                    lte: endOfMonth,
                                },
                            },
                        });
                        if (existingCredit)
                            return;
                        /* ===============================
                           CALCULATE LEAVE CREDIT
                        =============================== */
                        const totalUnitsToCredit = new client_1.Prisma.Decimal(leaveType.unit);
                        const lastLedger = await database_1.prisma.leaveLedger.findFirst({
                            where: {
                                tenantId,
                                employeeId: emp.id,
                                leaveTypeId: leaveType.leaveTypeId,
                            },
                            orderBy: [
                                { transactionDate: "desc" },
                                { createdAt: "desc" },
                            ],
                        });
                        const previousBalance = lastLedger
                            ? new client_1.Prisma.Decimal(lastLedger.balanceAfter)
                            : new client_1.Prisma.Decimal(0);
                        const newBalance = previousBalance.plus(totalUnitsToCredit);
                        /* ===============================
                           INSERT LEDGER ENTRY
                        =============================== */
                        await database_1.prisma.leaveLedger.create({
                            data: {
                                tenantId,
                                employeeId: emp.id,
                                leaveTypeId: leaveType.leaveTypeId,
                                transactionType: "monthly_credit",
                                referenceId: "monthly-accrual",
                                units: totalUnitsToCredit,
                                balanceAfter: newBalance,
                                transactionDate: now,
                                policyVersion: 1,
                            },
                        });
                    }
                }
            }));
        }
        /* ===============================
           RESPONSE
        =============================== */
        return res.status(200).json({
            success: true,
            message: "Leave allocation completed",
            totalEmployees: employees.length,
            data: {
                policies,
                employees: formattedEmployees,
                positions,
            },
        });
    }
    catch (error) {
        console.error("Error fetching allocation + employees:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
exports.getLeaveAllocationWithEmployees = getLeaveAllocationWithEmployees;
//# sourceMappingURL=leaveAllocationController.js.map