import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class PayslipFieldController {
  /** =========================
   * GET ALL PAYSILP FIELDS
   ========================== */
  static async getFields(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId!;
    const fields = await prisma.payslipField.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, data: fields } as ApiResponse);
  }

  /** =========================
   * GET FIELD BY ID
   ========================== */
  static async getFieldById(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid field id");

    const field = await prisma.payslipField.findFirst({
      where: { id, tenantId: req.tenantId },
    });

    if (!field) throw new NotFoundError("Payslip field not found");

    res.json({ success: true, data: field } as ApiResponse);
  }

  /** =========================
   * CREATE FIELD
   ========================== */
  static async createField(req: AuthRequest, res: Response) {
    const { label, value, type, options, status } = req.body;

    if (!label || !type) throw new ValidationError("Label and type are required");

    // Check unique label per tenant
    const exists = await prisma.payslipField.findFirst({
      where: { tenantId: req.tenantId, label },
    });
    if (exists) throw new ValidationError("Field with this label already exists");

    const field = await prisma.payslipField.create({
      data: {
        tenantId: req.tenantId!,
        label,
        value: value || "",
        type,
        options: options ? JSON.stringify(options) : null,
        status: status ?? true,
        createdById: req.user!.id,
      },
    });

    res.status(201).json({ success: true, data: field, message: "Field created successfully" } as ApiResponse);
  }

  /** =========================
   * UPDATE FIELD
   ========================== */
  static async updateField(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid field id");

    const field = await prisma.payslipField.findFirst({
      where: { id, tenantId: req.tenantId },
    });
    if (!field) throw new NotFoundError("Payslip field not found");

    const { label, value, options, status } = req.body;

    // Check label uniqueness if changed
    if (label && label !== field.label) {
      const exists = await prisma.payslipField.findFirst({
        where: { tenantId: req.tenantId, label },
      });
      if (exists) throw new ValidationError("Field with this label already exists");
    }

    const updated = await prisma.payslipField.update({
      where: { id },
      data: {
        label,
        value,
        options: options ? JSON.stringify(options) : field.options,
        status,
        updatedById: req.user!.id,
      },
    });

    res.json({ success: true, data: updated, message: "Field updated successfully" } as ApiResponse);
  }

  /** =========================
   * DELETE FIELD
   ========================== */
  static async deleteField(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid field id");

    const field = await prisma.payslipField.findFirst({
      where: { id, tenantId: req.tenantId },
    });
    if (!field) throw new NotFoundError("Payslip field not found");

    await prisma.payslipField.delete({ where: { id } });

    res.json({ success: true, message: "Field deleted successfully" } as ApiResponse);
  }

  /** =========================
   * TOGGLE FIELD STATUS
   ========================== */
  static async toggleStatus(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid field id");

    const field = await prisma.payslipField.findFirst({
      where: { id, tenantId: req.tenantId },
    });
    if (!field) throw new NotFoundError("Payslip field not found");

    const updated = await prisma.payslipField.update({
      where: { id },
      data: { status: !field.status, updatedById: req.user!.id },
    });

    res.json({ success: true, data: updated, message: "Field status updated" } as ApiResponse);
  }
}
