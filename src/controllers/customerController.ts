import { Response } from "express";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  CreateCustomerData,
  UpdateCustomerData,
} from "../types";
import { CustomerModel } from "../models/customer.model";

export class CustomerController {
  /**
   * Get all customers (tenant-aware, with pagination and search)
   */
  static async getCustomers(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: "Tenant and authentication required",
        } as ApiResponse);
        return;
      }

      const { page = 1, limit = 20, search, isActive } = req.query;

      const { customers, total } = await CustomerModel.getCustomers(
        req.tenantId,
        Number(page),
        Number(limit),
        search as string,
        isActive !== undefined ? isActive === "true" : undefined
      );

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
      } as ApiResponse);
    } catch (error) {
      console.error("Get customers error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch customers",
      } as ApiResponse);
    }
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const customer = await CustomerModel.getCustomerById(req.tenantId!, id);

      if (!customer) {
        res
          .status(404)
          .json({ success: false, error: "Customer not found" } as ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: customer } as ApiResponse);
    } catch (error) {
      console.error("Get customer by ID error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch customer",
      } as ApiResponse);
    }
  }

  /**
   * Create customer (admin only)
   */


  static async createCustomer(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const customerData: CreateCustomerData = req.body;

    // 1. Validate required fields
    if (!customerData.companyName) {
      res.status(400).json({
        success: false,
        error: "Company name is required",
      } as ApiResponse);
      return;
    }

    // 2. SANITIZE EMAIL: Convert empty strings or whitespace-only strings to undefined.
    // This is the key fix to prevent unique constraint errors on empty strings.
    const sanitizedEmail = customerData.email?.trim() || undefined;

    // 3. Create the customer (model handles uniqueness check)
    const newCustomer = await CustomerModel.createCustomer(
      req.tenantId,
      {
        ...customerData,
        email: sanitizedEmail, // Use the sanitized value here
      },
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: newCustomer,
      message: "Customer created successfully",
    } as ApiResponse);

  } catch (error: any) {
    console.error("Create customer error:", error);

    if (error instanceof ValidationError) {
      res.status(400).json({ 
        success: false, 
        error: error.message 
      } as ApiResponse);
      return;
    }

    // Handle unique constraint errors from raw queries
    if (error.message && error.message.includes('already exists')) {
      res.status(400).json({
        success: false,
        error: error.message,
      } as ApiResponse);
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to create customer",
    } as ApiResponse);
  }
}

/**
 * Update customer (admin only)
 */
static async updateCustomer(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.tenantId || !req.user) {
      res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      } as ApiResponse);
      return;
    }

    const { id } = req.params;
    const updates: UpdateCustomerData = req.body;

    // Prevent updating immutable fields
    delete (updates as any).tenantId;
    delete (updates as any).createdAt;
    delete (updates as any).createdBy;

    // Update the customer (model handles all validation and uniqueness checks)
    const updatedCustomer = await CustomerModel.updateCustomer(
      req.tenantId,
      id,
      updates,
      req.user.id
    );

    res.status(200).json({
      success: true,
      data: updatedCustomer,
      message: "Customer updated successfully",
    } as ApiResponse);
  } catch (error: any) {
    console.error("Update customer error:", error);

    if (error instanceof NotFoundError) {
      res.status(404).json({ success: false, error: error.message } as ApiResponse);
      return;
    }

    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message } as ApiResponse);
      return;
    }

    // Handle unique constraint errors from raw queries
    if (error.message && error.message.includes('already exists')) {
      res.status(400).json({
        success: false,
        error: error.message,
      } as ApiResponse);
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to update customer",
    } as ApiResponse);
  }
}




  /**
   * Delete customer (admin only)
   */
  static async deleteCustomer(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await CustomerModel.deleteCustomer(req.tenantId!, id);

      res.status(200).json({
        success: true,
        message: "Customer deleted successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Delete customer error:", error);

      if (error.message && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: "Customer not found",
        } as ApiResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: "Failed to delete customer",
      } as ApiResponse);
    }
  }

  /**
   * Get customers for dropdown/select
   */
  static async getCustomersForSelect(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const customers = await CustomerModel.getCustomersForSelect(req.tenantId!);

      const formatted = customers.map((c) => ({
        value: c.id,
        label: c.companyName,
        email: c.email,
      }));

      res.status(200).json({ success: true, data: formatted } as ApiResponse);
    } catch (error) {
      console.error("Get customers for select error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch customers",
      } as ApiResponse);
    }
  }
}
