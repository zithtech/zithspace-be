"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteLeaveAdjustment = exports.updateLeaveAdjustment = exports.getLeaveAdjustments = exports.createLeaveAdjustment = void 0;
const client_1 = require("@prisma/client");
const database_1 = require("@/config/database");
const createLeaveAdjustment = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const createdById = req.user?.id;
        if (!tenantId || !createdById) {
            return res.status(401).json({
                error: "Unauthorized or missing tenant context",
            });
        }
        const { employeeId, leaveTypeId, adjustmentType, amount, unit, reason, approvedById, compOffWorkDate, expiryDate, } = req.body;
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount < 0) {
            return res.status(400).json({
                error: "A valid, non-negative amount is required.",
            });
        }
        const result = await database_1.prisma.$transaction(async (tx) => {
            // 1️⃣ Create Leave Adjustment
            const adjustment = await tx.leaveAdjustment.create({
                data: {
                    tenantId,
                    employeeId,
                    leaveTypeId,
                    adjustmentType,
                    amount: numericAmount,
                    unit,
                    reason,
                    approvedById,
                    compOffWorkDate: compOffWorkDate ? new Date(compOffWorkDate) : null,
                    expiryDate: expiryDate ? new Date(expiryDate) : null,
                    createdById,
                },
            });
            // 2️⃣ Get last ledger balance
            const lastLedger = await tx.leaveLedger.findFirst({
                where: {
                    tenantId,
                    employeeId,
                    leaveTypeId,
                },
                orderBy: {
                    createdAt: "desc",
                },
            });
            const previousBalance = lastLedger
                ? new client_1.Prisma.Decimal(lastLedger.balanceAfter)
                : new client_1.Prisma.Decimal(0);
            // 3️⃣ Determine units
            const units = adjustmentType === "Credit"
                ? new client_1.Prisma.Decimal(numericAmount)
                : new client_1.Prisma.Decimal(numericAmount).negated();
            // 4️⃣ Calculate new balance
            const newBalance = previousBalance.plus(units);
            // Prevent negative leave balance
            if (newBalance.lessThan(0)) {
                throw new Error("Leave balance cannot be negative");
            }
            // 5️⃣ Insert ledger entry
            await tx.leaveLedger.create({
                data: {
                    tenantId,
                    employeeId,
                    leaveTypeId,
                    transactionType: "adjustment_credit",
                    referenceId: adjustment.id,
                    units,
                    balanceAfter: newBalance,
                    transactionDate: new Date(),
                    expiryDate: expiryDate ? new Date(expiryDate) : null,
                    policyVersion: 1,
                    createdById,
                },
            });
            return adjustment;
        });
        res.status(201).json({
            success: true,
            data: result,
            message: "Leave adjustment created successfully",
        });
    }
    catch (error) {
        console.error("Error creating leave adjustment:", error);
        res.status(500).json({
            error: "Failed to create leave adjustment",
            ...(process.env.NODE_ENV === "development" && {
                details: error instanceof Error ? error.message : String(error),
            }),
        });
    }
};
exports.createLeaveAdjustment = createLeaveAdjustment;
const getLeaveAdjustments = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(401).json({
                error: "Unauthorized or missing tenant context",
            });
        }
        const leaveAdjustments = await database_1.prisma.leaveAdjustment.findMany({
            where: {
                tenantId,
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        employee_code: true,
                    },
                },
                approvedBy: {
                    select: {
                        id: true,
                        name: true,
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
        res.status(200).json({
            success: true,
            data: leaveAdjustments,
        });
    }
    catch (error) {
        console.error("Error fetching leave adjustments:", error);
        res.status(500).json({
            error: "Failed to fetch leave adjustments",
            ...(process.env.NODE_ENV === "development" && {
                details: error instanceof Error ? error.message : String(error),
            }),
        });
    }
};
exports.getLeaveAdjustments = getLeaveAdjustments;
const updateLeaveAdjustment = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const updatedById = req.user?.id;
        const { id } = req.params;
        const { leaveTypeId, adjustmentType, amount, unit, reason, approvedById, compOffWorkDate, expiryDate, } = req.body;
        if (!tenantId || !updatedById) {
            return res.status(401).json({
                error: "Unauthorized or missing tenant context",
            });
        }
        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount < 0) {
            return res.status(400).json({
                error: "A valid, non-negative amount is required.",
            });
        }
        const existingAdjustment = await database_1.prisma.leaveAdjustment.findFirst({
            where: { id, tenantId },
        });
        if (!existingAdjustment) {
            return res.status(404).json({
                error: "Leave adjustment not found.",
            });
        }
        const leaveAdjustment = await database_1.prisma.leaveAdjustment.update({
            where: { id },
            data: {
                leaveTypeId,
                adjustmentType,
                amount: numericAmount,
                unit,
                reason,
                approvedById,
                compOffWorkDate: compOffWorkDate ? new Date(compOffWorkDate) : null,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                updatedById,
            },
        });
        res.status(200).json({
            success: true,
            data: leaveAdjustment,
            message: "Leave adjustment updated successfully",
        });
    }
    catch (error) {
        console.error("Error updating leave adjustment:", error);
        res.status(500).json({
            error: "Failed to update leave adjustment",
            ...(process.env.NODE_ENV === "development" && {
                details: error instanceof Error ? error.message : String(error),
            }),
        });
    }
};
exports.updateLeaveAdjustment = updateLeaveAdjustment;
const deleteLeaveAdjustment = async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { id } = req.params;
        if (!tenantId) {
            return res.status(401).json({
                error: "Unauthorized or missing tenant context",
            });
        }
        const existingAdjustment = await database_1.prisma.leaveAdjustment.findFirst({
            where: { id, tenantId },
        });
        if (!existingAdjustment) {
            return res.status(404).json({
                error: "Leave adjustment not found.",
            });
        }
        await database_1.prisma.leaveAdjustment.delete({
            where: { id },
        });
        res.status(200).json({
            success: true,
            message: "Leave adjustment deleted successfully",
        });
    }
    catch (error) {
        console.error("Error deleting leave adjustment:", error);
        res.status(500).json({
            error: "Failed to delete leave adjustment",
            ...(process.env.NODE_ENV === "development" && {
                details: error instanceof Error ? error.message : String(error),
            }),
        });
    }
};
exports.deleteLeaveAdjustment = deleteLeaveAdjustment;
//# sourceMappingURL=leaveAdjustmentController.js.map