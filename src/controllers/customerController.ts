import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
  CreateCustomerData,
  UpdateCustomerData,
} from "@/types";

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

      const { page = 1, limit = 20, search } = req.query;

      const where: any = { tenantId: req.tenantId };

      if (search) {
        where.OR = [
          { companyName: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
          { phone: { contains: search as string, mode: "insensitive" } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
        }),
        prisma.customer.count({ where }),
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

      const customer = await prisma.customer.findFirst({
        where: { id, tenantId: req.tenantId },
      });

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

      // <-- Put the validation here -->
      const customerData: CreateCustomerData = req.body;

      // Validate required fields
      if (!customerData.companyName) {
        res.status(400).json({
          success: false,
          error: "Company name is required",
        } as ApiResponse);
        return;
      }

      // Check email uniqueness only if email is provided
      if (customerData.email) {
        const existing = await prisma.customer.findFirst({
          where: {
            tenantId: req.tenantId,
            email: customerData.email,
          },
        });

        if (existing) {
          throw new ValidationError(
            "Customer with this email already exists in this tenant",
          );
        }
      }

      // Check if email already exists for this tenant
      const existing = await prisma.customer.findFirst({
        where: { tenantId: req.tenantId, email: customerData.email },
      });

      if (existing) {
        throw new ValidationError(
          "Customer with this email already exists in this tenant",
        );
      }

      // Create the customer
      const newCustomer = await prisma.customer.create({
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
      } as ApiResponse);
    } catch (error: any) {
      console.error("Create customer error:", error);

      if (error instanceof ValidationError) {
        res
          .status(400)
          .json({ success: false, error: error.message } as ApiResponse);
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

      // <-- Put the UpdateCustomerData assignment here -->
      const updates: UpdateCustomerData = req.body;

      // Remove fields that shouldn't be updated directly
      delete (updates as any).tenantId;
      delete (updates as any).createdAt;
      delete (updates as any).createdBy;

      // Check if customer exists in this tenant
      const existingCustomer = await prisma.customer.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existingCustomer) {
        throw new NotFoundError("Customer not found in this tenant");
      }

      // If email is being updated, check for duplicates
      if (updates.email && updates.email !== existingCustomer.email) {
        const duplicate = await prisma.customer.findFirst({
          where: {
            tenantId: req.tenantId,
            email: updates.email,
            id: { not: id },
          },
        });

        if (duplicate) {
          throw new ValidationError(
            "Another customer with this email already exists",
          );
        }
      }

      // Update customer
      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: { ...updates, updatedBy: req.user.id, updatedAt: new Date() },
      });

      res.status(200).json({
        success: true,
        data: updatedCustomer,
        message: "Customer updated successfully",
      } as ApiResponse);
    } catch (error: any) {
      console.error("Update customer error:", error);

      if (error instanceof NotFoundError) {
        res
          .status(404)
          .json({ success: false, error: error.message } as ApiResponse);
        return;
      }

      if (error instanceof ValidationError) {
        res
          .status(400)
          .json({ success: false, error: error.message } as ApiResponse);
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

      const existing = await prisma.customer.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res
          .status(404)
          .json({ success: false, error: "Customer not found" } as ApiResponse);
        return;
      }

      // Soft delete is optional; for now, we do a hard delete:
      await prisma.customer.delete({ where: { id } });

      res.status(200).json({
        success: true,
        message: "Customer deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Delete customer error:", error);
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
      const customers = await prisma.customer.findMany({
        where: { tenantId: req.tenantId },
        select: { id: true, companyName: true, email: true },
        orderBy: { companyName: "asc" },
      });

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
