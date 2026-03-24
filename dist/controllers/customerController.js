"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class CustomerController {
    /**
     * Get all customers (tenant-aware, with pagination and search)
     */
    static async getCustomers(req, res) {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({
                    success: false,
                    error: "Tenant and authentication required",
                });
                return;
            }
            const { page = 1, limit = 20, search } = req.query;
            const where = { tenantId: req.tenantId };
            if (search) {
                where.OR = [
                    { companyName: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search, mode: "insensitive" } },
                ];
            }
            const skip = (Number(page) - 1) * Number(limit);
            const [customers, total] = await Promise.all([
                database_1.prisma.customer.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    orderBy: { createdAt: "desc" },
                }),
                database_1.prisma.customer.count({ where }),
            ]);
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
            console.error("Get customers error:", error);
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
            const customerData = req.body;
            // 1. Validate required fields
            if (!customerData.companyName) {
                res.status(400).json({
                    success: false,
                    error: "Company name is required",
                });
                return;
            }
            // 2. SANITIZE EMAIL: Convert empty strings or whitespace-only strings to undefined.
            // This is the key fix to prevent unique constraint errors on empty strings.
            const sanitizedEmail = customerData.email?.trim() || undefined;
            // 3. Check email uniqueness only if a valid email string exists
            if (sanitizedEmail) {
                const existing = await database_1.prisma.customer.findFirst({
                    where: {
                        tenantId: req.tenantId,
                        email: sanitizedEmail,
                    },
                });
                if (existing) {
                    throw new types_1.ValidationError("Customer with this email already exists in this tenant");
                }
            }
            // 4. Create the customer
            const newCustomer = await database_1.prisma.customer.create({
                data: {
                    ...customerData,
                    email: sanitizedEmail, // Use the sanitized value here
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
            // Handle Prisma Unique Constraint Errors (P2002)
            if (error.code === 'P2002') {
                res.status(400).json({
                    success: false,
                    error: "A customer with this email already exists in this tenant.",
                });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
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
            const updates = req.body;
            // Prevent updating immutable fields
            delete updates.tenantId;
            delete updates.createdAt;
            delete updates.createdBy;
            // Fetch existing customer
            const existingCustomer = await database_1.prisma.customer.findFirst({
                where: { id, tenantId: req.tenantId },
            });
            if (!existingCustomer) {
                throw new types_1.NotFoundError("Customer not found in this tenant");
            }
            // Normalize updates: convert empty strings to null, ignore undefined
            const normalizedUpdates = {};
            Object.entries(updates).forEach(([key, value]) => {
                if (value === "") {
                    normalizedUpdates[key] = null;
                }
                else if (value !== undefined) {
                    normalizedUpdates[key] = value;
                }
            });
            // Company name uniqueness check
            if (normalizedUpdates.companyName &&
                normalizedUpdates.companyName !== existingCustomer.companyName) {
                const existingCompany = await database_1.prisma.customer.findFirst({
                    where: {
                        tenantId: req.tenantId,
                        companyName: normalizedUpdates.companyName,
                        NOT: { id },
                    },
                });
                if (existingCompany) {
                    throw new types_1.ValidationError("Another customer with this company name already exists");
                }
            }
            // Email uniqueness check
            if (normalizedUpdates.email &&
                normalizedUpdates.email !== existingCustomer.email) {
                const duplicateEmail = await database_1.prisma.customer.findFirst({
                    where: {
                        tenantId: req.tenantId,
                        email: normalizedUpdates.email,
                        NOT: { id },
                    },
                });
                if (duplicateEmail) {
                    throw new types_1.ValidationError("Another customer with this email already exists");
                }
            }
            // Update the customer
            const updatedCustomer = await database_1.prisma.customer.update({
                where: { id },
                data: {
                    ...normalizedUpdates,
                    updatedBy: req.user.id,
                    updatedAt: new Date(),
                },
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
                res.status(404).json({ success: false, error: error.message });
                return;
            }
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({ success: false, error: error.message });
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