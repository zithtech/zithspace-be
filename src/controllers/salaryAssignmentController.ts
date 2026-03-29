import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";
import { calculateSalaryStructure, SalaryComponentInput } from "@/utils/salaryCalculation";

export class SalaryAssignmentController {
  // ✅ ASSIGN Salary Structure to Employee
  static async assignStructure(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { employeeId, structureId, baseSalary, salaryType } = req.body;

      if (!employeeId || !structureId || baseSalary === undefined || !salaryType) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields: employeeId, structureId, baseSalary, salaryType" 
        });
      }

      // 1. Verify Employee
      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, tenantId }
      });
      if (!employee) {
        return res.status(404).json({ success: false, error: "Employee not found" });
      }

      // 2. Verify Structure & Get Rules
      const structure = await prisma.salaryStructure.findFirst({
        where: { id: structureId, tenantId, isActive: true },
        include: { 
          components: {
            include: { component: true }
          }
        }
      });
      if (!structure) {
        return res.status(404).json({ success: false, error: "Active salary structure not found" });
      }

      // 3. Calculate Dynamic Breakdown
      const gross = salaryType === "YEARLY" ? Number(baseSalary) / 12 : Number(baseSalary);
      
      const componentInputs: SalaryComponentInput[] = structure.components.map(c => ({
        componentId: c.componentId,
        componentCode: c.component.componentCode,
        componentName: c.component.componentName, // Added
        type: c.component.type as "Earning" | "Deduction",
        calculationType: c.calculationType,
        percentageBasis: c.percentageBasis,
        value: Number(c.value)
      }));

      const breakdown = calculateSalaryStructure(gross, componentInputs);

      // 4. Update Assignment in Transaction
      const result = await prisma.$transaction(async (tx) => {
        // Deactivate existing assignment
        await tx.employeeSalaryAssignment.updateMany({
          where: { employeeId, tenantId, isActive: true },
          data: { isActive: false }
        });

        // Create new assignment
        const newAssignment = await tx.employeeSalaryAssignment.create({
          data: {
            tenantId: tenantId!,
            employeeId,
            structureId,
            baseSalary,
            salaryType,
            isActive: true
          }
        });

        // Store breakdown snapshot
        await tx.employeeSalaryAssignmentComponent.createMany({
          data: breakdown.map(b => ({
            assignmentId: newAssignment.id,
            componentId: b.componentId,
            amount: b.calculatedAmount,
            calculationType: b.calculationType,
            percentageBasis: b.percentageBasis,
            value: b.value
          }))
        });

        return tx.employeeSalaryAssignment.findUnique({
          where: { id: newAssignment.id },
          include: {
            employee: { select: { first_name: true, last_name: true, employee_code: true } },
            structure: { select: { name: true } },
            components: { include: { component: true } }
          }
        });
      });

      res.status(201).json({ 
        success: true, 
        data: result, 
        message: "Salary structure assigned successfully" 
      });
    } catch (err: any) {
      console.error("Assign Structure Error:", err);
      res.status(500).json({ 
        success: false, 
        error: err.message || "Internal Server Error" 
      });
    }
  }

  // ✅ UPDATE Salary Assignment
  static async updateAssignment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { tenantId } = req;
      const { structureId, baseSalary, salaryType } = req.body;

      if (!structureId || baseSalary === undefined || !salaryType) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields: structureId, baseSalary, salaryType" 
        });
      }

      // 1. Verify Assignment
      const existingAssignment = await prisma.employeeSalaryAssignment.findFirst({
        where: { id, tenantId },
        include: { components: true }
      });
      if (!existingAssignment) {
        return res.status(404).json({ success: false, error: "Assignment not found" });
      }

      // 2. Verify Structure & Get Rules
      const structure = await prisma.salaryStructure.findFirst({
        where: { id: structureId, tenantId, isActive: true },
        include: { 
          components: {
            include: { component: true }
          }
        }
      });
      if (!structure) {
        return res.status(404).json({ success: false, error: "Active salary structure not found" });
      }

      // 3. Calculate Dynamic Breakdown
      const gross = salaryType === "YEARLY" ? Number(baseSalary) / 12 : Number(baseSalary);
      
      const componentInputs: SalaryComponentInput[] = structure.components.map(c => ({
        componentId: c.componentId,
        componentCode: c.component.componentCode,
        componentName: c.component.componentName,
        type: c.component.type as "Earning" | "Deduction",
        calculationType: c.calculationType,
        percentageBasis: c.percentageBasis,
        value: Number(c.value)
      }));

      const breakdown = calculateSalaryStructure(gross, componentInputs);

      // 4. Update in Transaction
      const result = await prisma.$transaction(async (tx) => {
        // Remove old snapshot components
        await tx.employeeSalaryAssignmentComponent.deleteMany({
          where: { assignmentId: id }
        });

        // Update assignment
        await tx.employeeSalaryAssignment.update({
          where: { id },
          data: {
            structureId,
            baseSalary,
            salaryType,
          }
        });

        // Store new breakdown snapshot
        await tx.employeeSalaryAssignmentComponent.createMany({
          data: breakdown.map(b => ({
            assignmentId: id,
            componentId: b.componentId,
            amount: b.calculatedAmount,
            calculationType: b.calculationType,
            percentageBasis: b.percentageBasis,
            value: b.value
          }))
        });

        return tx.employeeSalaryAssignment.findUnique({
          where: { id },
          include: {
            employee: { select: { first_name: true, last_name: true, employee_code: true } },
            structure: { select: { name: true } },
            components: { include: { component: true } }
          } as any
        });
      });

      res.status(200).json({ 
        success: true, 
        data: result, 
        message: "Salary assignment updated successfully" 
      });
    } catch (err: any) {
      console.error("Update Assignment Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ DELETE Salary Assignment
  static async deleteAssignment(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { tenantId } = req;

      const assignment = await prisma.employeeSalaryAssignment.findFirst({
        where: { id, tenantId }
      });
      if (!assignment) {
        return res.status(404).json({ success: false, error: "Assignment not found" });
      }

      await prisma.$transaction([
        prisma.employeeSalaryAssignmentComponent.deleteMany({ where: { assignmentId: id } }),
        prisma.employeeSalaryAssignment.delete({ where: { id } })
      ]);

      res.status(200).json({ 
        success: true, 
        message: "Assignment deleted successfully" 
      });
    } catch (err: any) {
      console.error("Delete Assignment Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ GET Assignment By Employee ID
  static async getAssignmentByEmployee(req: AuthRequest, res: Response) {
    try {
      const { employeeId } = req.params;
      const { tenantId } = req;

      const assignment = await prisma.employeeSalaryAssignment.findFirst({
        where: { employeeId, tenantId, isActive: true },
        include: { 
          employee: { select: { first_name: true, last_name: true, employee_code: true } },
          structure: { select: { name: true } },
          components: {
            include: { component: true }
          }
        } as any
      });

      res.status(200).json({ 
        success: true, 
        data: assignment 
      });
    } catch (err: any) {
      console.error("Get Employee Assignment Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ GET All Assignments
  static async getAllAssignments(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const assignments = await prisma.employeeSalaryAssignment.findMany({
        where: { tenantId, isActive: true },
        include: { 
          employee: { select: { first_name: true, last_name: true, employee_code: true } },
          structure: { select: { name: true } },
          components: {
            include: { component: true }
          }
        } as any,
        orderBy: { updatedAt: 'desc' }
      });

      res.status(200).json({ 
        success: true, 
        data: assignments 
      });
    } catch (err: any) {
      console.error("Get All Assignments Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
