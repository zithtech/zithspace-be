import { Response } from "express";
import prisma from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  ValidationError,
  NotFoundError,
} from "@/types";

export class EmployeeFieldController {
  
  static async getFields(req: AuthRequest, res: Response) {
  const companyIdHeader = req.get("x-company-id"); // ✅ correct

  if (!companyIdHeader) {
    throw new ValidationError("Company id is required");
  }

  const companyId = Number(companyIdHeader);
  if (isNaN(companyId)) {
    throw new ValidationError("Invalid company id");
  }

  const fields = await prisma.employeeField.findMany({
    where: {
      tenantId: req.tenantId,
      companyId,
    },
    orderBy: { id: "asc" },
  });

  res.json({
    success: true,
    data: fields,
  } as ApiResponse);
}


  /** =========================
   * CREATE FIELD
   ========================== */
  static async createField(req: AuthRequest, res: Response) {
    const { companyId, systemKey, displayName, isVisible = true } = req.body;

    if (!companyId || !systemKey)
      throw new ValidationError("companyId and systemKey are required");

    const exists = await prisma.employeeField.findFirst({
      where: {
        tenantId: req.tenantId,
        companyId,
        systemKey,
      },
    });

    if (exists) {
      throw new ValidationError("Field already exists");
    }

    const field = await prisma.employeeField.create({
      data: {
        tenantId: req.tenantId!,
        companyId,
        systemKey,
        displayName: displayName || systemKey,
        isVisible,
        createdById: req.user!.id,
      },
    });

    res.status(201).json({
      success: true,
      data: field,
      message: "Employee field created",
    } as ApiResponse);
  }

  /** =========================
   * UPDATE FIELD (label only)
   ========================== */
  static async updateField(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    const { displayName } = req.body;

    if (!id) throw new ValidationError("Invalid field id");

    const field = await prisma.employeeField.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!field) throw new NotFoundError("Field not found");

    const updated = await prisma.employeeField.update({
      where: { id },
      data: {
        displayName,
        updatedById: req.user!.id,
      },
    });

    res.json({
      success: true,
      data: updated,
      message: "Field updated",
    } as ApiResponse);
  }

  
 /** =========================
 * TOGGLE FIELD VISIBILITY
 ========================== */
static async toggleVisibility(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  if (!id) throw new ValidationError("Invalid field id");

  const field = await prisma.employeeField.findFirst({
    where: {
      id,
      tenantId: req.tenantId,
    },
  });

  if (!field) throw new NotFoundError("Field not found");

  const updated = await prisma.employeeField.update({
    where: { id },
    data: {
      isVisible: !field.isVisible,
      updatedById: req.user!.id,
    },
  });

  res.json({
    success: true,
    data: updated,
    message: "Field visibility updated",
  } as ApiResponse);
}

  /** =========================
   * DELETE FIELD
   ========================== */
  static async deleteField(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid field id");

    const field = await prisma.employeeField.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!field) throw new NotFoundError("Field not found");

    await prisma.employeeField.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Employee field deleted",
    } as ApiResponse);
  }

}


