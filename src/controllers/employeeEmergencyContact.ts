import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";

export class EmployeeEmergencyContactController {
  /* ================= CREATE EMERGENCY CONTACT ================= */
  static async createContact(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { employeeId, relationship, name, mobile } = req.body;

      if (!employeeId || !relationship || !name || !mobile) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
        } as ApiResponse);
        return;
      }

      // check employee exists
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
      });

      if (!employee) {
        res.status(404).json({
          success: false,
          error: "Employee not found",
        } as ApiResponse);
        return;
      }

      const contact = await prisma.employeeEmergencyContact.create({
        data: {
          employeeId,
          relationship,
          name,
          mobile,
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        data: contact,
        message: "Emergency contact created successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error creating emergency contact:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create emergency contact",
      } as ApiResponse);
    }
  }

  /* ================= GET CONTACTS BY EMPLOYEE ================= */
  static async getContactsByEmployee(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { employeeId } = req.params;

      const contacts = await prisma.employeeEmergencyContact.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        success: true,
        data: contacts,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching emergency contacts:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch emergency contacts",
      } as ApiResponse);
    }
  }

  /* ================= GET CONTACT BY ID ================= */
  static async getContactById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const contact = await prisma.employeeEmergencyContact.findUnique({
        where: { id },
      });

      if (!contact) {
        res.status(404).json({
          success: false,
          error: "Emergency contact not found",
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: contact,
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching emergency contact:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch emergency contact",
      } as ApiResponse);
    }
  }

  /* ================= UPDATE EMERGENCY CONTACT ================= */
  static async updateContact(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res
          .status(401)
          .json({ success: false, error: "Unauthorized" } as ApiResponse);
        return;
      }

      const { id } = req.params;

      const existing = await prisma.employeeEmergencyContact.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Emergency contact not found",
        } as ApiResponse);
        return;
      }

      const updated = await prisma.employeeEmergencyContact.update({
        where: { id },
        data: {
          relationship: req.body.relationship,
          name: req.body.name,
          mobile: req.body.mobile,
          updatedById: req.user.id,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
        message: "Emergency contact updated successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error updating emergency contact:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update emergency contact",
      } as ApiResponse);
    }
  }

  /* ================= DELETE EMERGENCY CONTACT ================= */
  static async deleteContact(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await prisma.employeeEmergencyContact.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          error: "Emergency contact not found",
        } as ApiResponse);
        return;
      }

      await prisma.employeeEmergencyContact.delete({
        where: { id },
      });

      res.status(200).json({
        success: true,
        message: "Emergency contact deleted successfully",
      } as ApiResponse);
    } catch (error) {
      console.error("Error deleting emergency contact:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete emergency contact",
      } as ApiResponse);
    }
  }
}
