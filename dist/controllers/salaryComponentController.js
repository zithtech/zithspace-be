"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalaryComponentController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class SalaryComponentController {
    /** =========================
     * GET ALL COMPONENTS
     ========================== */
    // static async getSalaryComponents(req: AuthRequest, res: Response): Promise<void> {
    //   try {
    //     if (!req.tenantId) {
    //       throw new ValidationError("Tenant required");
    //     }
    //     const { search, type, status } = req.query;
    //     const where: any = {
    //       tenantId: req.tenantId,
    //     };
    //     if (type) where.type = type;
    //     if (status === "Active") where.status = true;
    //     if (status === "Inactive") where.status = false;
    //     if (search) {
    //       where.OR = [
    //         {
    //           componentName: {
    //             contains: search as string,
    //             mode: "insensitive",
    //           },
    //         },
    //         {
    //           componentCode: {
    //             contains: search as string,
    //             mode: "insensitive",
    //           },
    //         },
    //       ];
    //     }
    //     const components = await prisma.salaryComponent.findMany({
    //       where,
    //       orderBy: { createdAt: "desc" },
    //     });
    //     res.json({
    //       success: true,
    //       data: components,
    //     } as ApiResponse);
    //   } catch (error) {
    //     throw error;
    //   }
    // }
    static async getSalaryComponents(req, res) {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { search, type, status } = req.query;
        const where = { tenantId: req.tenantId };
        if (type)
            where.type = type;
        if (status === "Active")
            where.status = true;
        if (status === "Inactive")
            where.status = false;
        if (search) {
            where.OR = [
                { componentName: { contains: search, mode: "insensitive" } },
                { componentCode: { contains: search, mode: "insensitive" } },
            ];
        }
        const [data, total] = await Promise.all([
            database_1.prisma.salaryComponent.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            database_1.prisma.salaryComponent.count({ where }),
        ]);
        res.json({
            success: true,
            data,
            pagination: {
                current: page,
                pageSize: limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    /** =========================
     * GET COMPONENT BY ID
     ========================== */
    static async getSalaryComponentById(req, res) {
        try {
            const id = Number(req.params.id);
            if (!id) {
                throw new types_1.ValidationError("Invalid component id");
            }
            const component = await database_1.prisma.salaryComponent.findFirst({
                where: {
                    key: id,
                    tenantId: req.tenantId,
                },
            });
            if (!component) {
                throw new types_1.NotFoundError("Salary component not found");
            }
            res.json({
                success: true,
                data: component,
            });
        }
        catch (error) {
            throw error;
        }
    }
    /** =========================
     * CREATE COMPONENT
     ========================== */
    static async createSalaryComponent(req, res) {
        try {
            const { componentName, componentCode, type, status } = req.body;
            if (!componentName || !componentCode) {
                throw new types_1.ValidationError("Component name & code are required");
            }
            const existing = await database_1.prisma.salaryComponent.findFirst({
                where: {
                    tenantId: req.tenantId,
                    componentCode,
                },
            });
            if (existing) {
                throw new types_1.ValidationError("Component code already exists");
            }
            const component = await database_1.prisma.salaryComponent.create({
                data: {
                    tenantId: req.tenantId,
                    componentName,
                    componentCode,
                    type,
                    status,
                    createdById: req.user.id,
                },
            });
            res.status(201).json({
                success: true,
                data: component,
                message: "Salary component created successfully",
            });
        }
        catch (error) {
            throw error;
        }
    }
    /** =========================
     * UPDATE COMPONENT
     ========================== */
    static async updateSalaryComponent(req, res) {
        try {
            const id = Number(req.params.id);
            const { componentName, componentCode, type, status } = req.body;
            if (!id) {
                throw new types_1.ValidationError("Invalid component id");
            }
            const existing = await database_1.prisma.salaryComponent.findFirst({
                where: {
                    key: id,
                    tenantId: req.tenantId,
                },
            });
            if (!existing) {
                throw new types_1.NotFoundError("Salary component not found");
            }
            const updated = await database_1.prisma.salaryComponent.update({
                where: { key: id },
                data: {
                    componentName,
                    componentCode,
                    type,
                    status,
                    updatedById: req.user.id,
                },
            });
            res.json({
                success: true,
                data: updated,
                message: "Salary component updated successfully",
            });
        }
        catch (error) {
            throw error;
        }
    }
    /** =========================
     * UPDATE STATUS ONLY
     ========================== */
    static async updateSalaryStatus(req, res) {
        try {
            const id = Number(req.params.id);
            const { status } = req.body;
            if (!id) {
                throw new types_1.ValidationError("Invalid component id");
            }
            if (typeof status !== "boolean") {
                throw new types_1.ValidationError("Status must be boolean");
            }
            const component = await database_1.prisma.salaryComponent.update({
                where: {
                    key: id,
                },
                data: {
                    status,
                    updatedById: req.user.id,
                },
            });
            res.json({
                success: true,
                data: component,
                message: "Status updated successfully",
            });
        }
        catch (error) {
            throw error;
        }
    }
    /** =========================
   * DELETE COMPONENT
   ========================== */
    static async deleteSalaryComponent(req, res) {
        try {
            const id = Number(req.params.id);
            if (!id) {
                throw new types_1.ValidationError("Invalid component id");
            }
            const existing = await database_1.prisma.salaryComponent.findFirst({
                where: {
                    key: id,
                    tenantId: req.tenantId,
                },
            });
            if (!existing) {
                throw new types_1.NotFoundError("Salary component not found");
            }
            await database_1.prisma.salaryComponent.delete({
                where: {
                    key: id,
                },
            });
            res.json({
                success: true,
                message: "Salary component deleted successfully",
            });
        }
        catch (error) {
            throw error;
        }
    }
}
exports.SalaryComponentController = SalaryComponentController;
//# sourceMappingURL=salaryComponentController.js.map