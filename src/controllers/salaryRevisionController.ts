import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";

export class SalaryRevisionController {
  /**
   * @route   GET /api/salary-revision/current/:employeeId
   * @desc    Get current salary structure of an employee
   * @access  Private
   */
  static async getCurrentSalary(req: AuthRequest, res: Response) {
    try {
      const { employeeId } = req.params;
      const { tenantId } = req;

      if (!employeeId) {
        return res.status(400).json({ success: false, error: "Employee ID is required" });
      }

      // Fetch the active salary assignment with its components and the structure rules
      const assignment = await prisma.employeeSalaryAssignment.findFirst({
        where: { 
          employeeId, 
          tenantId, 
          isActive: true 
        },
        include: {
          structure: {
            include: {
              components: {
                include: { component: true },
                orderBy: { displayOrder: 'asc' }
              }
            }
          },
          components: {
            include: { component: true }
          }
        } as any
      });

      if (!assignment) {
        return res.status(404).json({ 
          success: false, 
          error: "No active salary assignment found for this employee. Please assign a salary structure first." 
        });
      }

      res.status(200).json({ success: true, data: assignment });
    } catch (err: any) {
      console.error("GetCurrentSalary Error:", err);
      res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
    }
  }

  /**
   * @route   POST /api/salary-revision
   * @desc    Create a new salary revision entry
   * @access  Private
   */
  static async createSalaryRevision(req: AuthRequest, res: Response) {
    try {
      const { tenantId, user } = req;
      const { 
        employeeId, 
        currentSalary, 
        revisionType, 
        revisionAmount, 
        newSalary, 
        effectiveFrom 
      } = req.body;

      if (!employeeId || currentSalary === undefined || !revisionType || revisionAmount === undefined || newSalary === undefined || !effectiveFrom) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      // Note: Using 'any' for prisma.salaryRevision because it's newly added and client not yet generated
      const revision = await (prisma as any).salaryRevision.create({
        data: {
          tenantId: tenantId!,
          employeeId,
          currentSalary,
          revisionType,
          revisionAmount,
          newSalary,
          effectiveFrom: new Date(effectiveFrom),
          createdById: user!.id,
          status: "PENDING"
        }
      });

      res.status(201).json({ 
        success: true, 
        data: revision, 
        message: "Salary revision recorded successfully" 
      });
    } catch (err: any) {
      console.error("CreateSalaryRevision Error:", err);
      res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
    }
  }

  /**
   * @route   GET /api/salary-revision
   * @desc    Get all salary revisions for the tenant
   * @access  Private
   */
  static async getAllRevisions(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      
      const revisions = await (prisma as any).salaryRevision.findMany({
        where: { tenantId },
        include: {
          employee: { 
            select: { 
              first_name: true, 
              last_name: true, 
              employee_code: true 
            } 
          },
          createdBy: { 
            select: { 
              name: true 
            } 
          }
        },
        orderBy: { createdAt: "desc" }
      });

      res.status(200).json({ success: true, data: revisions });
    } catch (err: any) {
      console.error("GetAllRevisions Error:", err);
      res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
    }
  }
}
