"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class CustomerController {
    /**
     * Get all customers (tenant-aware, with pagination and search)
     */
    //   static async getCustomers(req: AuthRequest, res: Response): Promise<void> {
    //     try {
    //       if (!req.tenantId || !req.user) {
    //         res.status(400).json({
    //           success: false,
    //           error: "Tenant and authentication required",
    //         } as ApiResponse);
    //         return;
    //       }
    //       const { page = 1, limit = 20, search } = req.query;
    //       const where: any = { tenantId: req.tenantId };
    //       if (search) {
    //         where.OR = [
    //           { companyName: { contains: search as string, mode: "insensitive" } },
    //           { email: { contains: search as string, mode: "insensitive" } },
    //           { phone: { contains: search as string, mode: "insensitive" } },
    //         ];
    //       }
    //       const skip = (Number(page) - 1) * Number(limit);
    //       const [customers, total] = await Promise.all([
    //         prisma.customer.findMany({
    //           where,
    //           skip,
    //           take: Number(limit),
    //           orderBy: { createdAt: "desc" },
    //         }),
    //         prisma.customer.count({ where }),
    //       ]);
    //       res.status(200).json({
    //         success: true,
    //         data: customers,
    //         pagination: {
    //           page: Number(page),
    //           limit: Number(limit),
    //           total,
    //           pages: Math.ceil(total / Number(limit)),
    //           hasNext: Number(page) * Number(limit) < total,
    //           hasPrev: Number(page) > 1,
    //         },
    //       } as ApiResponse);
    //     } catch (error) {
    //       console.error("Get customers error:", error);
    //       res.status(500).json({
    //         success: false,
    //         error: "Failed to fetch customers",
    //       } as ApiResponse);
    //     }
    //   }
    static async getCustomers(req, res) {
        // try {
        //   // TEMP: For testing, skip auth/tenant check
        //   // Remove or comment out this check:
        //   // if (!req.tenantId || !req.user) { ... }
        //   const { page = 1, limit = 20, search } = req.query;
        //   // TEMP: Use all customers without filtering by tenant
        //   const where: any = {}; // no tenantId required
        //   if (search) {
        //     where.OR = [
        //       { companyName: { contains: search as string, mode: "insensitive" } },
        //       { email: { contains: search as string, mode: "insensitive" } },
        //       { phone: { contains: search as string, mode: "insensitive" } },
        //     ];
        //   }
        //   const skip = (Number(page) - 1) * Number(limit);
        //   const [customers, total] = await Promise.all([
        //     prisma.customer.findMany({
        //       where,
        //       skip,
        //       take: Number(limit),
        //       orderBy: { createdAt: "desc" },
        //     }),
        //     prisma.customer.count({ where }),
        //   ]);
        //   res.status(200).json({
        //     success: true,
        //     data: customers,
        //     pagination: {
        //       page: Number(page),
        //       limit: Number(limit),
        //       total,
        //       pages: Math.ceil(total / Number(limit)),
        //       hasNext: Number(page) * Number(limit) < total,
        //       hasPrev: Number(page) > 1,
        //     },
        //   } as ApiResponse);
        // } catch (error) {
        //   console.error("Get customers error:", error);
        //   res.status(500).json({
        //     success: false,
        //     error: "Failed to fetch customers",
        //   } as ApiResponse);
        // }
        try {
            const { page = 1, limit = 20, search } = req.query;
            const where = {}; // for testing, fetch all customers
            if (search) {
                where.OR = [
                    { companyName: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search, mode: "insensitive" } },
                ];
            }
            const skip = (Number(page) - 1) * Number(limit);
            console.log("Prisma query where:", where);
            console.log("Skip:", skip, "Limit:", limit);
            const [customers, total] = await Promise.all([
                database_1.prisma.customer.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    orderBy: { createdAt: "desc" },
                }),
                database_1.prisma.customer.count({ where }),
            ]);
            console.log("Fetched customers:", customers);
            res.status(200).json({
                success: true,
                data: customers,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit)),
                    hasNext: Number(page) * Number(limit) < total,
                    hasPrev: Number(page) > 1,
                },
            });
        }
        catch (error) {
            console.error("Get customers error:", error); // log full error
            res.status(500).json({
                success: false,
                error: "Failed to fetch customers",
            });
        }
    }
    /**
     * Get customer by ID
     */
    static async getCustomerById(req, res) {
        try {
            const { id } = req.params;
            const customer = await database_1.prisma.customer.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!customer) {
                res
                    .status(404)
                    .json({ success: false, error: "Customer not found" });
                return;
            }
            res.status(200).json({ success: true, data: customer });
        }
        catch (error) {
            console.error("Get customer by ID error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch customer",
            });
        }
    }
    /**
     * Create customer (admin only)
     */
    static async createCustomer(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            // <-- Put the validation here -->
            const customerData = req.body;
            // Validate required fields
            if (!customerData.companyName || !customerData.email) {
                res.status(400).json({
                    success: false,
                    error: "Company name and email are required",
                });
                return;
            }
            // Check if email already exists for this tenant
            const existing = await database_1.prisma.customer.findFirst({
                where: { tenantId: req.tenantId, email: customerData.email },
            });
            if (existing) {
                throw new types_1.ValidationError("Customer with this email already exists in this tenant");
            }
            // Create the customer
            const newCustomer = await database_1.prisma.customer.create({
                data: {
                    ...customerData,
                    tenantId: req.tenantId,
                    createdBy: req.user.id,
                    updatedBy: req.user.id,
                },
            });
            res.status(201).json({
                success: true,
                data: newCustomer,
                message: "Customer created successfully",
            });
        }
        catch (error) {
            console.error("Create customer error:", error);
            if (error instanceof types_1.ValidationError) {
                res
                    .status(400)
                    .json({ success: false, error: error.message });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to create customer",
            });
        }
    }
    /**
     * Update customer (admin only)
     */
    static async updateCustomer(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context and authentication required",
                });
                return;
            }
            const { id } = req.params;
            // <-- Put the UpdateCustomerData assignment here -->
            const updates = req.body;
            // Remove fields that shouldn't be updated directly
            delete updates.tenantId;
            delete updates.createdAt;
            delete updates.createdBy;
            // Check if customer exists in this tenant
            const existingCustomer = await database_1.prisma.customer.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existingCustomer) {
                throw new types_1.NotFoundError("Customer not found in this tenant");
            }
            // If email is being updated, check for duplicates
            if (updates.email && updates.email !== existingCustomer.email) {
                const duplicate = await database_1.prisma.customer.findFirst({
                    where: {
                        tenantId: req.tenantId,
                        email: updates.email,
                        id: { not: id },
                    },
                });
                if (duplicate) {
                    throw new types_1.ValidationError("Another customer with this email already exists");
                }
            }
            // Update customer
            const updatedCustomer = await database_1.prisma.customer.update({
                where: { id },
                data: { ...updates, updatedBy: req.user.id, updatedAt: new Date() },
            });
            res.status(200).json({
                success: true,
                data: updatedCustomer,
                message: "Customer updated successfully",
            });
        }
        catch (error) {
            console.error("Update customer error:", error);
            if (error instanceof types_1.NotFoundError) {
                res
                    .status(404)
                    .json({ success: false, error: error.message });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res
                    .status(400)
                    .json({ success: false, error: error.message });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to update customer",
            });
        }
    }
    /**
     * Delete customer (admin only)
     */
    static async deleteCustomer(req, res) {
        try {
            const { id } = req.params;
            const existing = await database_1.prisma.customer.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existing) {
                res
                    .status(404)
                    .json({ success: false, error: "Customer not found" });
                return;
            }
            // Soft delete is optional; for now, we do a hard delete:
            await database_1.prisma.customer.delete({ where: { id } });
            res.status(200).json({
                success: true,
                message: "Customer deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete customer error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete customer",
            });
        }
    }
    /**
     * Get customers for dropdown/select
     */
    static async getCustomersForSelect(req, res) {
        try {
            const customers = await database_1.prisma.customer.findMany({
                where: { tenantId: req.tenantId },
                select: { id: true, companyName: true, email: true },
                orderBy: { companyName: "asc" },
            });
            const formatted = customers.map((c) => ({
                value: c.id,
                label: c.companyName,
                email: c.email,
            }));
            res.status(200).json({ success: true, data: formatted });
        }
        catch (error) {
            console.error("Get customers for select error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch customers",
            });
        }
    }
}
exports.CustomerController = CustomerController;
//# sourceMappingURL=customerController.js.map