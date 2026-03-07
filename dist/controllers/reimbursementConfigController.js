"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReimbursementConfigurationController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
const MONTH_LIMIT = 1000;
const YEAR_LIMIT = 12000;
class ReimbursementConfigurationController {
    /**
     * CREATE
     */
    static async createConfig(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { origin, subOrigin, categoryType, amount, period, status } = req.body;
            if (!origin || !categoryType || !amount || !period)
                throw new types_1.ValidationError("Required fields missing");
            if (!["MONTH", "YEAR"].includes(period))
                throw new types_1.ValidationError("Period must be MONTH or YEAR");
            const config = await database_1.prisma.reimbursementConfiguration.create({
                data: {
                    tenantId: req.tenantId,
                    origin,
                    subOrigin,
                    categoryType,
                    amount,
                    period,
                    status: status || "ACTIVE",
                    createdById: req.user.id,
                },
            });
            res.status(201).json({
                success: true,
                data: config,
            });
        }
        catch (error) {
            res.status(error instanceof types_1.ValidationError ? 400 : 500).json({
                success: false,
                error: error.message,
            });
        }
    }
    /**
     * GET ALL (with calculated amount)
     */
    static async getConfigs(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const configs = await database_1.prisma.reimbursementConfiguration.findMany({
                where: { tenantId: req.tenantId },
                orderBy: { createdAt: "desc" },
            });
            // 🔥 Amount calculation logic
            const calculated = configs.map((config) => {
                let yearlyAmount = 0;
                let monthlyAmount = 0;
                if (config.period === "MONTH") {
                    monthlyAmount = Number(config.amount);
                    yearlyAmount = Number(config.amount) * 12;
                }
                else if (config.period === "YEAR") {
                    yearlyAmount = Number(config.amount);
                    monthlyAmount = Number(config.amount) / 12;
                }
                return {
                    ...config,
                    monthlyAmount,
                    yearlyAmount,
                };
            });
            res.status(200).json({
                success: true,
                data: calculated,
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to fetch configurations",
            });
        }
    }
    /**
     * GET BY ID (with calculation)
     */
    static async getConfigById(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const config = await database_1.prisma.reimbursementConfiguration.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!config)
                throw new types_1.NotFoundError("Configuration not found");
            let yearlyAmount = 0;
            let monthlyAmount = 0;
            if (config.period === "MONTH") {
                monthlyAmount = Number(config.amount);
                yearlyAmount = Number(config.amount) * 12;
            }
            else if (config.period === "YEAR") {
                yearlyAmount = Number(config.amount);
                monthlyAmount = Number(config.amount) / 12;
            }
            res.status(200).json({
                success: true,
                data: {
                    ...config,
                    monthlyAmount,
                    yearlyAmount,
                },
            });
        }
        catch (error) {
            res
                .status(error instanceof types_1.NotFoundError ? 404 : 500)
                .json({ success: false, error: error.message });
        }
    }
    /**
     * UPDATE
     */
    static async updateConfig(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const { origin, subOrigin, categoryType, amount, period, status } = req.body;
            const existing = await database_1.prisma.reimbursementConfiguration.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing)
                throw new types_1.NotFoundError("Configuration not found");
            if (period && !["MONTH", "YEAR"].includes(period))
                throw new types_1.ValidationError("Period must be MONTH or YEAR");
            const updated = await database_1.prisma.reimbursementConfiguration.update({
                where: { id },
                data: {
                    origin,
                    subOrigin,
                    categoryType,
                    amount,
                    period,
                    status,
                    updatedById: req.user.id,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Configuration updated successfully",
            });
        }
        catch (error) {
            res
                .status(error instanceof types_1.ValidationError
                ? 400
                : error instanceof types_1.NotFoundError
                    ? 404
                    : 500)
                .json({ success: false, error: error.message });
        }
    }
    /**
     * DELETE
     */
    static async deleteConfig(req, res) {
        try {
            if (!req.user || !req.tenantId)
                throw new types_1.ValidationError("Tenant context and authentication required");
            const { id } = req.params;
            const existing = await database_1.prisma.reimbursementConfiguration.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing)
                throw new types_1.NotFoundError("Configuration not found");
            await database_1.prisma.reimbursementConfiguration.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Configuration deleted successfully",
            });
        }
        catch (error) {
            res
                .status(error instanceof types_1.NotFoundError ? 404 : 500)
                .json({ success: false, error: error.message });
        }
    }
}
exports.ReimbursementConfigurationController = ReimbursementConfigurationController;
exports.default = ReimbursementConfigurationController;
//# sourceMappingURL=reimbursementConfigController.js.map