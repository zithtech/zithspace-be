"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerController = void 0;
const types_1 = require("../types");
const customer_model_1 = require("../models/customer.model");
const transactionHistory_1 = require("../utils/transactionHistory");
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
            const { page = 1, limit = 20, search, isActive } = req.query;
            const { customers, total } = await customer_model_1.CustomerModel.getCustomers(req.tenantId, Number(page), Number(limit), search, isActive !== undefined ? isActive === "true" : undefined);
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
            const customer = await customer_model_1.CustomerModel.getCustomerById(req.tenantId, id);
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
            // 3. Create the customer (model handles uniqueness check)
            const newCustomer = await customer_model_1.CustomerModel.createCustomer(req.tenantId, {
                ...customerData,
                email: sanitizedEmail, // Use the sanitized value here
            }, req.user.id);
            res.status(201).json({
                success: true,
                data: newCustomer,
                message: "Customer created successfully",
            });
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.FINANCE,
                module: transactionHistory_1.Module.INVOICES,
                page: transactionHistory_1.Page.INVOICE_CUSTOMER_LIST,
                action: transactionHistory_1.Action.CREATE,
                actionLabel: `Created customer ${newCustomer.companyName}`,
                entityType: transactionHistory_1.EntityType.INVOICE_CUSTOMER,
                entityId: newCustomer.id,
                entityLabel: newCustomer.companyName,
                afterData: {
                    companyName: newCustomer.companyName,
                    email: newCustomer.email,
                    isActive: newCustomer.isActive,
                },
            });
        }
        catch (error) {
            console.error("Create customer error:", error);
            if (error instanceof types_1.ValidationError) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
                return;
            }
            // Handle unique constraint errors from raw queries
            if (error.message && error.message.includes('already exists')) {
                res.status(400).json({
                    success: false,
                    error: error.message,
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
            // Update the customer (model handles all validation and uniqueness checks)
            const updatedCustomer = await customer_model_1.CustomerModel.updateCustomer(req.tenantId, id, updates, req.user.id);
            res.status(200).json({
                success: true,
                data: updatedCustomer,
                message: "Customer updated successfully",
            });
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.FINANCE,
                module: transactionHistory_1.Module.INVOICES,
                page: transactionHistory_1.Page.INVOICE_CUSTOMER_LIST,
                action: transactionHistory_1.Action.UPDATE,
                actionLabel: `Updated customer ${updatedCustomer.companyName}`,
                entityType: transactionHistory_1.EntityType.INVOICE_CUSTOMER,
                entityId: id,
                entityLabel: updatedCustomer.companyName,
                afterData: {
                    companyName: updatedCustomer.companyName,
                    isActive: updatedCustomer.isActive,
                },
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
            // Handle unique constraint errors from raw queries
            if (error.message && error.message.includes('already exists')) {
                res.status(400).json({
                    success: false,
                    error: error.message,
                });
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
            const customer = await customer_model_1.CustomerModel.getCustomerById(req.tenantId, id);
            const customerName = customer ? customer.companyName : id;
            await customer_model_1.CustomerModel.deleteCustomer(req.tenantId, id);
            // ─── Activity log ───────────────────────────────────────────────
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.FINANCE,
                module: transactionHistory_1.Module.INVOICES,
                page: transactionHistory_1.Page.INVOICE_CUSTOMER_LIST,
                action: transactionHistory_1.Action.DELETE,
                actionLabel: `Deleted customer ${customerName}`,
                entityType: transactionHistory_1.EntityType.INVOICE_CUSTOMER,
                entityId: id,
                entityLabel: customerName,
            });
            res.status(200).json({
                success: true,
                message: "Customer deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete customer error:", error);
            if (error.message && error.message.includes('not found')) {
                res.status(404).json({
                    success: false,
                    error: "Customer not found",
                });
                return;
            }
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
            const customers = await customer_model_1.CustomerModel.getCustomersForSelect(req.tenantId);
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