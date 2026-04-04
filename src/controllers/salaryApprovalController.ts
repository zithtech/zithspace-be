import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";
import * as ExcelJS from 'exceljs';
import { decrypt } from "./bankAndPayrolllController";
import { emailService } from "@/utils/emailService";
import { s3Client } from "@/utils/r2Client";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export class SalaryApprovalController {
  // ✅ 1. CREATE/UPDATE Workflow
  static async upsertWorkflow(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { id, name, description, steps } = req.body;

      if (!name || !steps || !Array.isArray(steps)) {
        return res.status(400).json({ success: false, error: "Name and steps required" });
      }

      const workflow = await prisma.$transaction(async (tx) => {
        let nextVersion = 1;
        
        if (id) {
          // Find current version
          const current = await tx.salaryApprovalWorkflow.findUnique({
            where: { id, tenantId: tenantId! }
          });
          if (current) {
            nextVersion = current.version + 1;
            // Archive the old version
            await tx.salaryApprovalWorkflow.update({
              where: { id },
              data: { isActive: false }
            });
          }
        }

        // Always CREATE a new record for versioning
        const wf = await tx.salaryApprovalWorkflow.create({
          data: { 
            tenantId: tenantId!, 
            name, 
            description,
            version: nextVersion,
            isActive: true 
          }
        });

        // Add steps
        await (tx.salaryApprovalStep as any).createMany({
          data: (steps as any[]).map((s: any, index: number) => ({
            workflowId: wf.id,
            stepOrder: s.stepOrder || (index + 1),
            approverType: s.approverType,
            positionId: s.positionId,
            specificUserId: s.specificUserId,
            fallbackUserId: s.fallbackUserId
          } as any))
        });

        return wf;
      });

      res.status(200).json({ success: true, data: workflow });
    } catch (err: any) {
      console.error("Workflow Save Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 2. GET Workflows
  static async getWorkflows(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const workflows = await prisma.salaryApprovalWorkflow.findMany({
        where: { tenantId: tenantId!, isActive: true, isDeleted: false },
        include: { 
          steps: { 
            orderBy: { stepOrder: 'asc' },
            include: {
              position: true,
              specificUser: true,
              fallbackUser: true
            } as any
          } 
        }
      });
      res.status(200).json({ success: true, data: workflows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 3. SUBMIT for Approval (Transition DRAFT -> PENDING)
  static async submitForApproval(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { salaryPayoutIds } = req.body;

      if (!salaryPayoutIds || !Array.isArray(salaryPayoutIds)) {
        return res.status(400).json({ success: false, error: "salaryPayoutIds array required" });
      }

      // Find active workflow
      const workflow = await prisma.salaryApprovalWorkflow.findFirst({
        where: { tenantId: tenantId!, isActive: true },
        include: { steps: { orderBy: { stepOrder: 'asc' } } }
      });

      if (!workflow || workflow.steps.length === 0) {
        return res.status(400).json({ success: false, error: "No active approval workflow found for this tenant" });
      }

      const results = await prisma.$transaction(async (tx) => {
        return await Promise.all(salaryPayoutIds.map(async (id) => {
          const payout = await tx.salaryPayout.update({
            where: { id, tenantId },
            data: {
              status: "PENDING",
              currentStep: 1,
              workflowId: workflow.id
            }
          });

          // Log submission
          await tx.salaryApprovalLog.create({
            data: {
              tenantId: tenantId!,
              salaryPayoutId: id,
              stepNumber: 0,
              action: "SUBMITTED",
              performedById: req.user!.id,
              remarks: "Submitted for approval"
            }
          });

          return payout;
        }));
      });

      res.status(200).json({ success: true, data: results });
    } catch (err: any) {
      console.error("Submit Approval Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 4. APPROVE/REJECT Step
  static async processStep(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { salaryPayoutId, action, remarks } = req.body; // action: APPROVE, REJECT

      if (!salaryPayoutId || !action) {
        return res.status(400).json({ success: false, error: "salaryPayoutId and action required" });
      }

      const payout = await prisma.salaryPayout.findUnique({
        where: { id: salaryPayoutId },
        include: { 
          employee: { 
            include: { 
              users: true,
              workDetail: { include: { position: true } } 
            } 
          } 
        }
      });

      if (!payout || payout.status !== "PENDING") {
        return res.status(400).json({ success: false, error: "Payout not found or not in pending state" });
      }

      const workflow = await prisma.salaryApprovalWorkflow.findUnique({
        where: { id: payout.workflowId! },
        include: { steps: { orderBy: { stepOrder: 'asc' } } }
      });

      if (!workflow) return res.status(400).json({ success: false, error: "Workflow not found" });

      const currentStep = workflow.steps.find(s => s.stepOrder === payout.currentStep);
      if (!currentStep) return res.status(400).json({ success: false, error: "Current step configuration not found" });

      // ✅ Verify if current user is the correct approver
      let isAllowed = false;
      const userId = req.user!.id;

      if ((currentStep.approverType as string) === "POSITION") {
        const userWorkDetail = await prisma.employeeWorkDetail.findFirst({
          where: { employee: { users: { some: { id: userId } }, tenantId: tenantId! } }
        });
        isAllowed = userWorkDetail?.positionId === (currentStep as any).positionId;
      } else if (currentStep.approverType === "SPECIFIC_USER") {
        isAllowed = currentStep.specificUserId === userId;
      }

      if (!isAllowed) {
        return res.status(403).json({ success: false, error: "You are not authorized to approve this step" });
      }

      const updatedPayout = await prisma.$transaction(async (tx) => {
        let nextStatus = "PENDING";
        let nextStep = payout.currentStep;

        if (action === "APPROVE") {
          const isLastStep = payout.currentStep >= workflow.steps.length;
          if (isLastStep) {
            nextStatus = "APPROVED";
            await tx.salaryPayout.update({
              where: { id: salaryPayoutId },
              data: { 
                status: "APPROVED", 
                approvedAt: new Date(), 
                approvedById: req.user!.id 
              }
            });
          } else {
            nextStep = payout.currentStep + 1;
            await tx.salaryPayout.update({
              where: { id: salaryPayoutId },
              data: { currentStep: nextStep }
            });
          }
        } else {
          nextStatus = "REJECTED";
          await tx.salaryPayout.update({
            where: { id: salaryPayoutId },
            data: { status: "REJECTED" }
          });
        }

        // Log action
        await tx.salaryApprovalLog.create({
          data: {
            tenantId: tenantId!,
            salaryPayoutId,
            stepNumber: payout.currentStep,
            action,
            performedById: req.user!.id,
            remarks
          }
        });

        return { nextStatus, nextStep };
      });

      res.status(200).json({ success: true, data: updatedPayout });
    } catch (err: any) {
      console.error("Process Step Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ Legacy Bulk Approve (Refactored to initialize as DRAFT)
  static async bulkApprove(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year, selectedEmployeeIds, payrollData } = req.body;

      if (!month || !year || !selectedEmployeeIds || !payrollData) {
        return res.status(400).json({ success: false, error: "Missing fields" });
      }

      const filteredData = payrollData.filter((p: any) => selectedEmployeeIds.includes(p.employeeId));

      const results = await prisma.$transaction(async (tx) => {
        const operations = filteredData.map((data: any) => {
          return tx.salaryPayout.upsert({
            where: {
              employeeId_month_year: {
                employeeId: data.employeeId,
                month: Number(month),
                year: Number(year)
              }
            },
            update: {
              grossSalary: Number(data.grossSalary),
              netSalary: Number(data.netSalary),
              totalDeductions: Number(data.totalDeductions),
              lopDays: Number(data.lopDays),
              lopDeduction: Number(data.lopDeduction),
              workedDays: Number(data.workedDays),
              status: "DRAFT", // New workflow starts as DRAFT
              components: data.breakdown || {},
              adjustments: data.adjustments || []
            },
            create: {
              tenantId: tenantId!,
              employeeId: data.employeeId,
              month: Number(month),
              year: Number(year),
              grossSalary: Number(data.grossSalary),
              netSalary: Number(data.netSalary),
              totalDeductions: Number(data.totalDeductions),
              lopDays: Number(data.lopDays),
              lopDeduction: Number(data.lopDeduction),
              workedDays: Number(data.workedDays),
              status: "DRAFT",
              components: data.breakdown || {},
              adjustments: data.adjustments || []
            }
          });
        });

        return Promise.all(operations);
      });

      res.status(200).json({ success: true, data: results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ GET Ongoing Payouts for Inbox
  static async getPendingApprovals(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const userId = req.user!.id;

      // Get user's position
      const approverWorkDetail = await prisma.employeeWorkDetail.findFirst({
        where: { employee: { users: { some: { id: userId } }, tenantId: tenantId! } }
      });
      const userPositionId = approverWorkDetail?.positionId;

      // Fetch all pending payouts for this tenant
      const payouts = await prisma.salaryPayout.findMany({
        where: { tenantId: tenantId!, status: "PENDING" },
        include: {
          employee: { include: { users: true } },
          workflow: { include: { steps: { include: { position: true, specificUser: true } as any } } },
          approvalLogs: {
            include: { performedBy: true },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      // Filter for payouts where the current user is the authorized approver for the current step
      const approvalResults = await Promise.all(payouts.map(async (p) => {

        const step = (p as any).workflow?.steps.find((s: any) => s.stepOrder === p.currentStep);
        if (!step) return null;

        if (step.approverType === 'SPECIFIC_USER') {
          return step.specificUserId === userId ? p : null;
        }
        if ((step.approverType as string) === 'POSITION') {
          return userPositionId === (step as any).positionId ? p : null;
        }
        return null;
      }));

      const myApprovals = approvalResults.filter(p => p !== null);

      res.status(200).json({ success: true, data: myApprovals });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ Get all payouts for a tenant (filtered by month/year)
  static async getPayouts(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year } = req.query;
      
      const payouts = await prisma.salaryPayout.findMany({
        where: { 
          tenantId: tenantId!, 
          ...(month && { month: Number(month) }), 
          ...(year && { year: Number(year) }) 
        },
        include: { 
          employee: true, 
          workflow: { 
            include: { 
              steps: { 
                include: { position: true, specificUser: true } as any
              } 
            } 
          },
          approvalLogs: {
            include: { performedBy: true },
            orderBy: { createdAt: 'asc' }
          },
          payslip: true
        }
      });
      
      res.status(200).json({ success: true, data: payouts });
    } catch (err: any) {
      console.error("Get Payouts Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 5. BANK EXPORT
  static async getApprovedPayouts(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year } = req.query;
      
      console.log(`[getApprovedPayouts] Fetching for tenant: ${tenantId}, month: ${month}, year: ${year}`);

      const payouts = await prisma.salaryPayout.findMany({
        where: { 
          tenantId: tenantId!, 
          status: { in: ["APPROVED", "Approved", "SENT_TO_BANK", "PAID"] }, 
          ...(month && { month: Number(month) }), 
          ...(year && { year: Number(year) }) 
        },
        include: { 
          employee: {
            include: { 
              bankDetail: true,
              employeeIdentity: true,
              workDetail: {
                include: {
                  position: {
                    include: { department: true }
                  }
                }
              }
            }
          }, 
          approvedBy: true,
          payslip: true 
        }
      });

      console.log(`[getApprovedPayouts] Found ${payouts.length} payouts`);

      // Decrypt bank details
      const decryptedPayouts = payouts.map(p => {
        if (p.employee?.bankDetail) {
          const emp = p.employee as any;
          return {
            ...p,
            employee: {
              ...emp,
              bankAccount: decrypt(emp.bankDetail.accountNumber),
              pan: emp.employeeIdentity?.[0]?.panNumber ? decrypt(emp.employeeIdentity[0].panNumber) : null,
              departmentName: emp.workDetail?.[0]?.position?.department?.name || emp.departmentName || "N/A"
            }
          };
        }
        return p;
      });

      res.status(200).json({ success: true, data: decryptedPayouts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async exportToBankExcel(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year } = req.query;

      if (!month || !year) {
        return res.status(400).json({ success: false, error: "Month and Year are required" });
      }

      const payouts = await prisma.salaryPayout.findMany({
        where: { 
          tenantId: tenantId!, 
          status: { in: ["APPROVED", "Approved", "SENT_TO_BANK"] }, 
          month: Number(month), 
          year: Number(year) 
        },
        include: { 
          employee: {
            include: { bankDetail: true }
          }
        }
      });

      if (payouts.length === 0) {
        return res.status(404).json({ success: false, error: "No approved payouts found for this period" });
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Bank Disbursement');

      // Define Columns
      worksheet.columns = [
        { header: 'Employee ID', key: 'empId', width: 15 },
        { header: 'Account Holder Name', key: 'name', width: 30 },
        { header: 'Account Number', key: 'account', width: 25 },
        { header: 'IFSC Code', key: 'ifsc', width: 15 },
        { header: 'Bank Name', key: 'bank', width: 25 },
        { header: 'Net Amount', key: 'amount', width: 15 },
      ];

      // Add Rows
      payouts.forEach(p => {
        const bd = p.employee.bankDetail;
        worksheet.addRow({
          empId: p.employee.employee_code,
          name: bd?.accountHolderName || `${p.employee.first_name} ${p.employee.last_name}`,
          account: bd?.accountNumber ? decrypt(bd.accountNumber) : '',
          ifsc: bd?.ifscCode ? decrypt(bd.ifscCode) : '',
          bank: bd?.bankName || '',
          amount: Number(p.netSalary)
        });
      });

      // Styling
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F7FF' }
      };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Payroll_Disbursement_${month}_${year}.xlsx`);

      const buffer = await workbook.xlsx.writeBuffer();
      res.status(200).send(buffer);
    } catch (err: any) {
      console.error("Export Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async sendToBankEmail(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year, toEmail } = req.body;

      if (!month || !year || !toEmail) {
        return res.status(400).json({ success: false, error: "Month, Year and Recipient Email are required" });
      }

      // 1. Get Company Details (for From Name and Month/Year context)
      const company = await prisma.company.findFirst({
        where: { tenantId: tenantId! }
      });

      // 2. Fetch Payouts (Same logic as export)
      const payouts = await prisma.salaryPayout.findMany({
        where: { 
          tenantId: tenantId!, 
          status: { in: ["APPROVED", "Approved", "SENT_TO_BANK"] }, 
          month: Number(month), 
          year: Number(year) 
        },
        include: { 
          employee: {
            include: { bankDetail: true }
          }
        }
      });

      if (payouts.length === 0) {
        return res.status(404).json({ success: false, error: "No approved payouts found for this period" });
      }

      // 3. Generate Excel Buffer
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Bank Disbursement');
      worksheet.columns = [
        { header: 'Employee ID', key: 'empId', width: 15 },
        { header: 'Account Holder Name', key: 'name', width: 30 },
        { header: 'Account Number', key: 'account', width: 25 },
        { header: 'IFSC Code', key: 'ifsc', width: 15 },
        { header: 'Bank Name', key: 'bank', width: 25 },
        { header: 'Net Amount', key: 'amount', width: 15 },
      ];

      payouts.forEach(p => {
        const bd = p.employee.bankDetail;
        worksheet.addRow({
          empId: p.employee.employee_code,
          name: bd?.accountHolderName || `${p.employee.first_name} ${p.employee.last_name}`,
          account: bd?.accountNumber ? decrypt(bd.accountNumber) : '',
          ifsc: bd?.ifscCode ? decrypt(bd.ifscCode) : '',
          bank: bd?.bankName || '',
          amount: Number(p.netSalary)
        });
      });

      worksheet.getRow(1).font = { bold: true };
      const buffer = await workbook.xlsx.writeBuffer() as unknown as any;

      // 4. Send Email
      const success = await emailService.sendBankDisbursementEmail({
        to: toEmail,
        companyName: company?.name || "Our Company",
        month: Number(month),
        year: Number(year),
        excelBuffer: buffer,
        fileName: `Payroll_Disbursement_${month}_${year}.xlsx`
      });

      if (success) {
        res.status(200).json({ success: true, message: "Bank disbursement email sent successfully" });
      } else {
        res.status(500).json({ success: false, error: "Failed to send email" });
      }

    } catch (err: any) {
      console.error("Send to Bank Email Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 7. GENERATE Bank File (R2 Upload)
  static async generateBankFile(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const userId = req.user?.id;
      const { month, year } = req.body;

      if (!month || !year) {
        return res.status(400).json({ success: false, error: "Month and Year are required" });
      }

      // 1. Fetch Approved Payouts
      const payouts = await prisma.salaryPayout.findMany({
        where: { 
          tenantId: tenantId!, 
          status: { in: ["APPROVED", "Approved", "SENT_TO_BANK"] }, 
          month: Number(month), 
          year: Number(year) 
        },
        include: { 
          employee: {
            include: { bankDetail: true }
          }
        }
      });

      if (payouts.length === 0) {
        return res.status(404).json({ success: false, error: "No approved payouts found for this period" });
      }

      // 2. Validate Bank Details
      const missingBank = payouts.filter(p => !p.employee.bankDetail?.accountNumber || !p.employee.bankDetail?.ifscCode);
      if (missingBank.length > 0) {
        const names = missingBank.map(p => `${p.employee.first_name} ${p.employee.last_name}`).join(", ");
        return res.status(400).json({ 
          success: false, 
          error: `The following employees are missing bank details: ${names}` 
        });
      }

      // 3. Generate Excel Buffer
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Bank Disbursement');
      worksheet.columns = [
        { header: 'Employee Name', key: 'name', width: 30 },
        { header: 'Account Number', key: 'account', width: 25 },
        { header: 'IFSC Code', key: 'ifsc', width: 15 },
        { header: 'Net Salary', key: 'amount', width: 15 },
      ];

      let totalAmount = 0;
      payouts.forEach(p => {
        const bd = p.employee.bankDetail!;
        const netSal = Number(p.netSalary);
        totalAmount += netSal;
        worksheet.addRow({
          name: bd.accountHolderName || `${p.employee.first_name} ${p.employee.last_name}`,
          account: decrypt(bd.accountNumber),
          ifsc: decrypt(bd.ifscCode),
          amount: netSal
        });
      });
      worksheet.getRow(1).font = { bold: true };
      const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer;

      // 4. Upload to R2
      const fileName = `Bank_Disbursement_${month}_${year}_${Date.now()}.xlsx`;
      const key = `${tenantId}/payroll/bank-files/${month}-${year}/${fileName}`;
      const bucketName = "zithspace";

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }));

      const fileUrl = `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${key}`;

      // 5. Create BankFile Record
      const bankFile = await (prisma as any).bankFile.create({
        data: {
          tenantId: tenantId!,
          month: Number(month),
          year: Number(year),
          fileUrl,
          fileName,
          employeeCount: payouts.length,
          totalAmount: totalAmount,
          status: "GENERATED",
          createdById: userId!
        }
      });

      res.status(201).json({ success: true, data: bankFile });
    } catch (err: any) {
      console.error("Generate Bank File Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 8. GET Latest Bank File
  static async getLatestBankFile(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year } = req.query;

      const bankFile = await (prisma as any).bankFile.findFirst({
        where: { 
          tenantId: tenantId!,
          month: Number(month),
          year: Number(year)
        },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { name: true } },
          sender: { select: { name: true } }
        }
      });

      res.status(200).json({ success: true, data: bankFile });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 9. SEND Bank File Email
  static async sendBankFileEmail(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const userId = req.user?.id;
      const { bankFileId, toEmail } = req.body;

      if (!bankFileId || !toEmail) {
        return res.status(400).json({ success: false, error: "Bank File ID and Recipient Email are required" });
      }

      const bankFile = await (prisma as any).bankFile.findFirst({
        where: { id: bankFileId, tenantId: tenantId! }
      });

      if (!bankFile) {
        return res.status(404).json({ success: false, error: "Bank file not found" });
      }

      const company = await prisma.company.findFirst({
        where: { tenantId: tenantId! }
      });

      // Fetch file from R2 securely via S3 client
      const bucketName = "zithspace";
      const key = bankFile.fileUrl.split('.r2.dev/')[1];
      
      const s3Response = await s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: key
      }));

      const streamToBuffer = (stream: any): Promise<Buffer> =>
        new Promise((resolve, reject) => {
          const chunks: any[] = [];
          stream.on('data', (chunk: any) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });

      const buffer = await streamToBuffer(s3Response.Body as any);

      const success = await emailService.sendBankDisbursementEmail({
        to: toEmail,
        companyName: company?.name || "Our Company",
        month: bankFile.month,
        year: bankFile.year,
        excelBuffer: buffer,
        fileName: bankFile.fileName
      });

      if (success) {
        await prisma.$transaction([
          (prisma as any).bankFile.update({
            where: { id: bankFileId },
            data: {
              status: "SENT",
              sentAt: new Date(),
              sentBy: userId!
            }
          }),
          prisma.salaryPayout.updateMany({
            where: {
              tenantId: tenantId!,
              month: bankFile.month,
              year: bankFile.year,
              status: "APPROVED"
            },
            data: {
              status: "SENT_TO_BANK"
            }
          })
        ]);
        res.status(200).json({ success: true, message: "Email sent successfully" });
      } else {
        res.status(500).json({ success: false, error: "Failed to send email" });
      }
    } catch (err: any) {
      console.error("Send Bank File Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 10. MARK AS PAID
  static async markAsPaid(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const userId = req.user?.id;
      const { month, year } = req.body;

      if (!month || !year) {
        return res.status(400).json({ success: false, error: "Month and Year are required" });
      }

      // 1. Fetch Payouts in SENT_TO_BANK status
      const payouts = await prisma.salaryPayout.findMany({
        where: {
          tenantId: tenantId!,
          month: Number(month),
          year: Number(year),
          status: "SENT_TO_BANK"
        }
      });

      if (payouts.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No payouts found in 'SENT_TO_BANK' status for this period" 
        });
      }

      // 2. Update Payouts and Insert Logs in Transaction
      const results = await prisma.$transaction(async (tx) => {
        // Update all payouts
        await (tx.salaryPayout as any).updateMany({
          where: {
            tenantId: tenantId!,
            month: Number(month),
            year: Number(year),
            status: "SENT_TO_BANK"
          },
          data: {
            status: "PAID",
            paidAt: new Date(),
            paidById: userId!
          }
        });

        // Insert audit logs for each payout
        const logData = payouts.map(p => ({
          tenantId: tenantId!,
          salaryPayoutId: p.id,
          stepNumber: 999, // System final step
          action: "PAID",
          performedById: userId!,
          remarks: "Marked as paid after bank processing"
        }));

        await tx.salaryApprovalLog.createMany({
          data: logData
        });

        return { count: payouts.length };
      });

      res.status(200).json({ 
        success: true, 
        message: `Successfully marked ${results.count} payouts as PAID`,
        data: results 
      });
    } catch (err: any) {
      console.error("Mark as Paid Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 11. DELETE Workflow (Soft Delete)
  static async deleteWorkflow(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { tenantId } = req;
      await prisma.salaryApprovalWorkflow.update({
        where: { id, tenantId: tenantId! },
        data: { isDeleted: true, isActive: false }
      });
      res.status(200).json({ success: true, message: "Workflow deleted" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
