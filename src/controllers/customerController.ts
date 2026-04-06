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

      const { page = 1, limit = 20, search, isActive } = req.query;

      const where: any = { tenantId: req.tenantId };

      if (search) {
        where.OR = [
          { companyName: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } },
          { phone: { contains: search as string, mode: "insensitive" } },
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === "true";
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

    // 3. Check email uniqueness only if a valid email string exists
    if (sanitizedEmail) {
      const existing = await prisma.customer.findFirst({
        where: {
          tenantId: req.tenantId,
          email: sanitizedEmail,
        },
      });

      if (existing) {
        throw new ValidationError(
          "Customer with this email already exists in this tenant",
        );
      }
    }

    // 4. Create the customer
    const newCustomer = await prisma.customer.create({
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
    } as ApiResponse);

  } catch (error: any) {
    console.error("Create customer error:", error);

    // Handle Prisma Unique Constraint Errors (P2002)
    if (error.code === 'P2002') {
      res.status(400).json({
        success: false,
        error: "A customer with this email already exists in this tenant.",
      } as ApiResponse);
      return;
    }

    if (error instanceof ValidationError) {
      res.status(400).json({ 
        success: false, 
        error: error.message 
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

    // Fetch existing customer
    const existingCustomer = await prisma.customer.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!existingCustomer) {
      throw new NotFoundError("Customer not found in this tenant");
    }

    // Normalize updates: convert empty strings to null, ignore undefined
    const normalizedUpdates: any = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value === "") {
        normalizedUpdates[key] = null;
      } else if (value !== undefined) {
        normalizedUpdates[key] = value;
      }
    });

    // Company name uniqueness check
    if (
      normalizedUpdates.companyName &&
      normalizedUpdates.companyName !== existingCustomer.companyName
    ) {
      const existingCompany = await prisma.customer.findFirst({
        where: {
          tenantId: req.tenantId,
          companyName: normalizedUpdates.companyName,
          NOT: { id },
        },
      });
      if (existingCompany) {
        throw new ValidationError(
          "Another customer with this company name already exists"
        );
      }
    }

    // Email uniqueness check
    if (
      normalizedUpdates.email &&
      normalizedUpdates.email !== existingCustomer.email
    ) {
      const duplicateEmail = await prisma.customer.findFirst({
        where: {
          tenantId: req.tenantId,
          email: normalizedUpdates.email,
          NOT: { id },
        },
      });
      if (duplicateEmail) {
        throw new ValidationError(
          "Another customer with this email already exists"
        );
      }
    }

    // Update the customer
    const updatedCustomer = await prisma.customer.update({
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
        where: { tenantId: req.tenantId, isActive: true },
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
