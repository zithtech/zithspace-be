"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnviromentsController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class EnviromentsController {
    /**
     * Get all environments (tenant-aware)
     */
    static async getEnviroments(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { page = 1, limit = 20, status, search } = req.query;
            const where = {
                tenantId: req.tenantId,
            };
            if (status && status !== "all")
                where.status = status;
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: "insensitive" } },
                    { code: { contains: search, mode: "insensitive" } },
                ];
            }
            const skip = (Number(page) - 1) * Number(limit);
            const [data, total] = await Promise.all([
                database_1.prisma.enviroments.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip,
                    take: Number(limit),
                }),
                database_1.prisma.enviroments.count({ where }),
            ]);
            res.status(200).json({
                success: true,
                data,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit)),
                },
            });
        }
        catch (error) {
            console.error("Get environments error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch environments",
            });
        }
    }
    /**
     * Create environment
     */
    static async createEnviroment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { name, code, status } = req.body;
            if (!name || !code) {
                throw new types_1.ValidationError("Name and code are required");
            }
            const existing = await database_1.prisma.enviroments.findFirst({
                where: {
                    tenantId: req.tenantId,
                    code: code.toUpperCase(),
                },
            });
            if (existing) {
                throw new types_1.ValidationError("Environment code already exists in this tenant");
            }
            const newEnv = await database_1.prisma.enviroments.create({
                data: {
                    tenantId: req.tenantId,
                    name,
                    code: code.toUpperCase(),
                    status: status || "ACTIVE",
                    createdBy: req.user.id,
                },
            });
            res.status(201).json({
                success: true,
                data: newEnv,
                message: "Environment created successfully",
            });
        }
        catch (error) {
            console.error("Create environment error:", error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to create environment",
            });
        }
    }
    /**
     * Update environment
     */
    static async updateEnviroment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const { name, code, status } = req.body;
            const existing = await database_1.prisma.enviroments.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                throw new types_1.NotFoundError("Environment not found");
            }
            const updated = await database_1.prisma.enviroments.update({
                where: { id },
                data: {
                    name,
                    code: code?.toUpperCase(),
                    status,
                    updatedBy: req.user.id,
                    updatedAt: new Date(),
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Environment updated successfully",
            });
        }
        catch (error) {
            console.error("Update environment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update environment",
            });
        }
    }
    /**
     * Delete environment (hard delete via status)
     */
    static async deleteEnviroment(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.enviroments.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                throw new types_1.NotFoundError("Environment not found");
            }
            // 🔥 HARD DELETE
            await database_1.prisma.enviroments.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Environment permanently deleted",
            });
        }
        catch (error) {
            console.error("Delete environment error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to delete environment",
            });
        }
    }
    /**
   * Get single environment by ID
   */
    static async getEnviromentById(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            const env = await database_1.prisma.enviroments.findFirst({
                where: {
                    id,
                    tenantId: req.tenantId,
                },
            });
            if (!env) {
                throw new types_1.NotFoundError("Environment not found");
            }
            res.status(200).json({
                success: true,
                data: env,
            });
        }
        catch (error) {
            console.error("Get environment by id error:", error);
            if (error instanceof types_1.NotFoundError) {
                res.status(404).json({
                    success: false,
                    error: error.message,
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to fetch environment",
            });
        }
    }
}
exports.EnviromentsController = EnviromentsController;
exports.default = EnviromentsController;
//# sourceMappingURL=enviromentsController.js.map