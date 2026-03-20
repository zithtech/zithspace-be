"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReimbursementConfigurationController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class ReimbursementConfigurationController {
    /* =====================================================
       CREATE (with tenantId check)
    ===================================================== */
    static async createConfig(req, res) {
        try {
            if (!req.user || !req.tenantId) // 👈 Added tenantId check
                throw new types_1.ValidationError("Authentication required");
            const { origin, subOrigin, categoryType, amount, period, status, approvers = [], } = req.body;
            console.log("========== APPROVER DEBUG ==========");
            console.log("Approvers from UI:", JSON.stringify(approvers));
            console.log("Current User ID:", req.user.id);
            if (!origin || !categoryType || !amount || !period)
                throw new types_1.ValidationError("Required fields missing");
            if (!["MONTH", "YEAR"].includes(period))
                throw new types_1.ValidationError("Period must be MONTH or YEAR");
            const result = await database_1.prisma.$transaction(async (tx) => {
                // 1️⃣ Create Policy
                const policy = await tx.reimbursementPolicy.create({
                    data: {
                        tenantId: req.tenantId,
                        originType: origin,
                        originId: subOrigin,
                        isActive: status !== "INACTIVE",
                        createdById: req.user.id,
                    },
                });
                // 2️⃣ Create Rule
                const rule = await tx.reimbursementPolicyRule.create({
                    data: {
                        tenantId: req.tenantId,
                        policyId: policy.id,
                        categoryId: categoryType,
                        maxAmount: Number(amount),
                        periodType: period,
                        isActive: status !== "INACTIVE",
                        createdById: req.user.id,
                    },
                });
                // 3️⃣ Create Approvers and collect them
                let createdApprovers = [];
                if (approvers.length > 0) {
                    createdApprovers = await Promise.all(approvers.map((approver) => {
                        console.log("Approver object from UI:", approver);
                        console.log("ApproverId storing in DB:", approver.approverId);
                        console.log(`Saving approver level ${approver.level}:`, {
                            approverId: approver.approverId,
                            approverType: approver.approverType
                        });
                        return tx.reimbursementPolicyApprover.create({
                            data: {
                                tenantId: req.tenantId,
                                policyRuleId: rule.id,
                                level: approver.level,
                                approverType: approver.approverType,
                                approverId: approver.approverId || null,
                                createdById: req.user.id,
                            },
                        });
                    }));
                }
                return { policy, rule, approvers: createdApprovers };
            });
            res.status(201).json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            res.status(error instanceof types_1.ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
    /* =====================================================
       GET ALL (with tenantId filter)
    ===================================================== */
    static async getConfigs(req, res) {
        try {
            if (!req.user || !req.tenantId) // 👈 Added tenantId check
                throw new types_1.ValidationError("Authentication required");
            const policies = await database_1.prisma.reimbursementPolicy.findMany({
                where: { tenantId: req.tenantId }, // 👈 Added tenant filter
                include: {
                    rules: {
                        include: {
                            approvers: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });
            const formatted = policies.map((policy) => {
                const rule = policy.rules[0];
                if (!rule)
                    return null;
                let monthlyAmount = 0;
                let yearlyAmount = 0;
                if (rule.periodType === "MONTH") {
                    monthlyAmount = Number(rule.maxAmount);
                    yearlyAmount = Number(rule.maxAmount) * 12;
                }
                else {
                    yearlyAmount = Number(rule.maxAmount);
                    monthlyAmount = Number(rule.maxAmount) / 12;
                }
                return {
                    id: policy.id,
                    origin: policy.originType,
                    subOrigin: policy.originId,
                    categoryType: rule.categoryId,
                    amount: rule.maxAmount,
                    period: rule.periodType,
                    status: policy.isActive ? "ACTIVE" : "INACTIVE",
                    approvers: rule.approvers,
                    monthlyAmount,
                    yearlyAmount,
                };
            }).filter(Boolean);
            res.status(200).json({
                success: true,
                data: formatted,
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to fetch configurations",
            });
        }
    }
    /* =====================================================
       GET BY ID (with tenantId check)
    ===================================================== */
    static async getConfigById(req, res) {
        try {
            const { id } = req.params;
            if (!req.user || !req.tenantId) // 👈 Added tenantId check
                throw new types_1.ValidationError("Authentication required");
            const policy = await database_1.prisma.reimbursementPolicy.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId // 👈 Added tenant filter
                },
                include: {
                    rules: {
                        include: { approvers: true },
                    },
                },
            });
            if (!policy)
                throw new types_1.NotFoundError("Configuration not found");
            const rule = policy.rules[0];
            let monthlyAmount = 0;
            let yearlyAmount = 0;
            if (rule.periodType === "MONTH") {
                monthlyAmount = Number(rule.maxAmount);
                yearlyAmount = Number(rule.maxAmount) * 12;
            }
            else {
                yearlyAmount = Number(rule.maxAmount);
                monthlyAmount = Number(rule.maxAmount) / 12;
            }
            res.status(200).json({
                success: true,
                data: {
                    id: policy.id,
                    origin: policy.originType,
                    subOrigin: policy.originId,
                    categoryType: rule.categoryId,
                    amount: rule.maxAmount,
                    period: rule.periodType,
                    status: policy.isActive ? "ACTIVE" : "INACTIVE",
                    approvers: rule.approvers,
                    monthlyAmount,
                    yearlyAmount,
                },
            });
        }
        catch (error) {
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
    /* =====================================================
       UPDATE (with tenantId check)
    ===================================================== */
    static async updateConfig(req, res) {
        try {
            const { id } = req.params;
            if (!req.user || !req.tenantId) // 👈 Added tenantId check
                throw new types_1.ValidationError("Authentication required");
            const { origin, subOrigin, categoryType, amount, period, status, approvers = [], } = req.body;
            const existing = await database_1.prisma.reimbursementPolicy.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId // 👈 Added tenant filter
                },
                include: { rules: true },
            });
            if (!existing)
                throw new types_1.NotFoundError("Configuration not found");
            await database_1.prisma.$transaction(async (tx) => {
                /* Update Policy */
                await tx.reimbursementPolicy.update({
                    where: { id },
                    data: {
                        originType: origin,
                        originId: subOrigin,
                        isActive: status !== "INACTIVE",
                        updatedById: req.user.id,
                    },
                });
                const ruleId = existing.rules[0].id;
                /* Update Rule */
                await tx.reimbursementPolicyRule.update({
                    where: { id: ruleId },
                    data: {
                        categoryId: categoryType,
                        maxAmount: Number(amount),
                        periodType: period,
                        isActive: status !== "INACTIVE",
                        updatedById: req.user.id,
                    },
                });
                /* Delete old approvers */
                await tx.reimbursementPolicyApprover.deleteMany({
                    where: { policyRuleId: ruleId },
                });
                /* Recreate approvers */
                for (const approver of approvers) {
                    await tx.reimbursementPolicyApprover.create({
                        data: {
                            tenantId: req.tenantId,
                            policyRuleId: ruleId,
                            level: approver.level,
                            approverType: approver.approverType,
                            approverId: approver.approverId || null,
                            createdById: req.user.id,
                        },
                    });
                }
            });
            res.status(200).json({
                success: true,
                message: "Configuration updated successfully",
            });
        }
        catch (error) {
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
    static async deleteConfig(req, res) {
        try {
            const { id } = req.params;
            if (!req.user || !req.tenantId) // 👈 Added tenantId check
                throw new types_1.ValidationError("Authentication required");
            const existing = await database_1.prisma.reimbursementPolicy.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId // 👈 Added tenant filter
                },
                include: {
                    rules: {
                        include: { approvers: true }
                    }
                },
            });
            if (!existing)
                throw new types_1.NotFoundError("Configuration not found");
            // Use transaction to delete all related records
            await database_1.prisma.$transaction(async (tx) => {
                // First, delete all approvers for each rule
                for (const rule of existing.rules) {
                    await tx.reimbursementPolicyApprover.deleteMany({
                        where: { policyRuleId: rule.id },
                    });
                }
                // Then delete all rules
                await tx.reimbursementPolicyRule.deleteMany({
                    where: { policyId: id },
                });
                // Finally delete the policy
                await tx.reimbursementPolicy.delete({
                    where: { id },
                });
            });
            res.status(200).json({
                success: true,
                message: "Configuration deleted permanently",
            });
        }
        catch (error) {
            res.status(error instanceof types_1.NotFoundError ? 404 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
}
exports.ReimbursementConfigurationController = ReimbursementConfigurationController;
exports.default = ReimbursementConfigurationController;
//# sourceMappingURL=reimbursementConfigController.js.map