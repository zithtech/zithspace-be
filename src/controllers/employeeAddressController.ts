import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { AddressType } from "@prisma/client";

export class EmployeeAddressController {
  /* ================= CREATE EMPLOYEE ADDRESS ================= */
  static async createEmployeeAddress(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const {
        employeeId,
        addressType,
        doorNo,
        area,
        city,
        state,
        pincode,
        country,
      } = req.body;

      // Required fields validation
      if (!employeeId || !addressType) {
        res.status(400).json({
          success: false,
          error: "employeeId and addressType are required",
        } as ApiResponse);
        return;
      }

      // ENUM validation
      if (!Object.values(AddressType).includes(addressType)) {
        res.status(400).json({
          success: false,
          error: "Invalid addressType. Allowed values: CURRENT, PERMANENT",
        } as ApiResponse);
        return;
      }

      const address = await prisma.employeeAddress.create({
        data: {
          employeeId,
          tenantId: req.tenantId,
          addressType,
          doorNo,
          area,
          city,
          state,
          pincode,
          country,
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: address,
        message: "Employee address created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error creating employee address:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create employee address",
      } as ApiResponse);
    }
  }

  /* ================= GET ALL EMPLOYEE ADDRESSES ================= */
  static async getEmployeeAddresses(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      const addresses = await prisma.employeeAddress.findMany({
        where: { tenantId: req.tenantId },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        success: true,
        data: addresses,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employee addresses:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee addresses",
      } as ApiResponse);
    }
  }

  /* ================= GET EMPLOYEE ADDRESS BY ID ================= */
  static async getEmployeeAddressById(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const address = await prisma.employeeAddress.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!address) {
        res.status(404).json({
          success: false,
          error: "Employee address not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: address,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching employee address:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch employee address",
      } as ApiResponse);
    }
  }

  /* ================= UPDATE EMPLOYEE ADDRESS ================= */
  static async updateEmployeeAddress(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;
      const { addressType } = req.body;

      const existing = await prisma.employeeAddress.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee address not found",
        } as ApiResponse);
        return;
      }

      // ENUM validation (if provided)
      if (addressType && !Object.values(AddressType).includes(addressType)) {
        res.status(400).json({
          success: false,
          error: "Invalid addressType. Allowed values: CURRENT, PERMANENT",
        } as ApiResponse);
        return;
      }

      const updatedAddress = await prisma.employeeAddress.update({
        where: { id },
        data: {
          ...req.body,
          updatedById: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updatedAddress,
        message: "Employee address updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error updating employee address:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update employee address",
      } as ApiResponse);
    }
  }

  /* ================= DELETE EMPLOYEE ADDRESS ================= */
  static async deleteEmployeeAddress(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.tenantId) {
        res.status(400).json({
          success: false,
          error: "Tenant context missing",
        } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employeeAddress.findFirst({
        where: { id, tenantId: req.tenantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Employee address not found",
        } as ApiResponse);
        return;
      }

      await prisma.employeeAddress.delete({ where: { id } });

      res.status(200).json({
        success: true,
        message: "Employee address deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error deleting employee address:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete employee address",
      } as ApiResponse);
    }
  }
}
