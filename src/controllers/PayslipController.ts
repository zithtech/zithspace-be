
import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";
import { generateAndUploadPayslipPDF } from "@/services/pdfService";
import { getEmployeeLeaveSummary } from "@/utils/leaveUtils";
import axios from "axios";
import dayjs from "dayjs";

export class PayslipController {
  
  // ✅ 1. Generate Manual Payslip
  static async generateManual(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { payoutId } = req.body;
      const userId = req.user?.id;

      if (!payoutId) {
        return res.status(400).json({ success: false, error: "Payout ID is required" });
      }

      // 1. Fetch Payout with Employee and Company details
      const payout = await prisma.salaryPayout.findUnique({
        where: { id: payoutId, tenantId: tenantId! },
        include: {
          employee: {
            include: { 
              bankDetail: true, 
              employeeIdentity: true,
              payrollDetail: true,
              workDetail: {
                include: {
                  position: {
                    include: {
                      department: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!payout) {
        return res.status(404).json({ success: false, error: "Payout not found" });
      }

      // 2. Validate status = PAID
      if (payout.status?.toUpperCase() !== "PAID") {
        return res.status(400).json({ success: false, error: "Payslip can only be generated for PAID payouts" });
      }

      // 3. Check if payslip already exists
      const existing = await (prisma as any).payslipRecord.findUnique({
        where: { payoutId }
      });

      if (existing) {
        return res.status(200).json({ success: true, data: existing, message: "Payslip already exists" });
      }

      // 4. Fetch Company Settings
      const company = await prisma.company.findFirst({
        where: { tenantId: tenantId! }
      });

      // 5. Fetch Field Configs
      const configs = await (prisma as any).employee_field_configs.findMany({
        where: { tenant_id: tenantId! }
      });

      // 6. Fetch Leave Summary
      const leaveSummary = await getEmployeeLeaveSummary(tenantId!, payout.employeeId, payout.month, payout.year);

      // 7. Generate PDF
      const fileUrl = await (generateAndUploadPayslipPDF as any)(payout, company, configs, leaveSummary);

      // 6. Save Record
      const record = await (prisma as any).payslipRecord.create({
        data: {
          tenantId: tenantId!,
          employeeId: payout.employeeId,
          payoutId: payout.id,
          month: payout.month,
          year: payout.year,
          fileUrl,
          createdById: userId!,
          generatedAt: new Date()
        }
      });

      res.status(201).json({ success: true, data: record });

    } catch (err: any) {
      console.error("Generate Payslip Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 2. Bulk Generate
  static async bulkGenerate(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year } = req.body;
      const userId = req.user?.id;

      if (!month || !year) {
        return res.status(400).json({ success: false, error: "Month and Year are required" });
      }

      // 1. Fetch all PAID payouts for the period
      const payouts = await (prisma as any).salaryPayout.findMany({
        where: { 
          tenantId: tenantId!, 
          month: Number(month), 
          year: Number(year),
          status: { in: ["PAID", "Paid"] }
        },
        include: {
          employee: {
            include: { 
              bankDetail: true,
              employeeIdentity: true,
              payrollDetail: true,
              workDetail: {
                include: {
                  position: {
                    include: {
                      department: true
                    }
                  }
                }
              }
            }
          },
          payslip: true 
        }
      });

      if (payouts.length === 0) {
        return res.status(404).json({ success: false, error: "No PAID payouts found for this period" });
      }

      // 2. Filter out those who already have payslips
      const pendingPayouts = payouts.filter(p => !(p as any).payslip);

      if (pendingPayouts.length === 0) {
        return res.status(200).json({ success: true, message: "All payslips for this period are already generated" });
      }

      // 3. Fetch Company
      const company = await prisma.company.findFirst({
        where: { tenantId: tenantId! }
      });

      // 4. Fetch Field Configs
      const configs = await (prisma as any).employee_field_configs.findMany({
        where: { tenant_id: tenantId! }
      });

      // 5. Loop and generate (Sequential to avoid overloading Puppeteer)
      const results = [];
      for (const payout of pendingPayouts) {
        try {
          // Fetch Leave Summary for each employee
          const leaveSummary = await getEmployeeLeaveSummary(tenantId!, payout.employeeId, payout.month, payout.year);
          
          const fileUrl = await (generateAndUploadPayslipPDF as any)(payout, company, configs, leaveSummary);
          const record = await (prisma as any).payslipRecord.create({
            data: {
              tenantId: tenantId!,
              employeeId: payout.employeeId,
              payoutId: payout.id,
              month: payout.month,
              year: payout.year,
              fileUrl,
              createdById: userId!,
              generatedAt: new Date()
            }
          });
          results.push(record);
        } catch (e) {
          console.error(`Failed to generate payslip for payout ${payout.id}:`, e);
        }
      }

      res.status(200).json({ 
        success: true, 
        message: `Successfully generated ${results.length} payslips. ${pendingPayouts.length - results.length} failed.`,
        data: results 
      });

    } catch (err: any) {
      console.error("Bulk Generate Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 3. Get Payslip
  static async getPayslip(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { payoutId } = req.params;

      const record = await (prisma as any).payslipRecord.findUnique({
        where: { payoutId }
      });

      if (!record || record.tenantId !== tenantId) {
        return res.status(404).json({ success: false, error: "Payslip not found" });
      }

      res.status(200).json({ success: true, data: record });

    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 4. List My Payslips
  static async listMyPayslips(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const employeeId = (req.user as any)?.employeeId;

      if (!employeeId) {
        return res.status(400).json({ success: false, error: "Employee profile not found for this user" });
      }

      const records = await (prisma as any).payslipRecord.findMany({
        where: { 
          tenantId: tenantId!,
          employeeId: employeeId
        },
        orderBy: { generatedAt: 'desc' },
        include: {
          payout: true
        }
      });

      res.status(200).json({ success: true, data: records });

    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 5. List All Payslips (Admin)
  static async listAllPayslips(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { month, year, employeeId } = req.query;

      const where: any = { tenantId: tenantId! };
      if (month) where.month = Number(month);
      if (year) where.year = Number(year);
      if (employeeId) where.employeeId = employeeId;

      const records = await (prisma as any).payslipRecord.findMany({
        where,
        include: {
          employee: {
            select: {
              first_name: true,
              last_name: true,
              employee_code: true
            }
          },
          payout: true
        },
        orderBy: { generatedAt: 'desc' }
      });

      res.status(200).json({ success: true, data: records });

    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 6. Delete Payslip
  static async deletePayslip(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { id } = req.params;

      const record = await (prisma as any).payslipRecord.findFirst({
        where: { id, tenantId: tenantId! }
      });

      if (!record) {
        return res.status(404).json({ success: false, error: "Payslip record not found" });
      }

      // 1. Delete from R2
      try {
        const { deleteFileFromR2 } = require("@/utils/r2Client");
        await deleteFileFromR2(record.fileUrl, tenantId!);
      } catch (r2Error: any) {
        console.error("R2 deletion failed, but proceeding with DB deletion:", r2Error.message);
      }

      // 2. Delete from DB
      await (prisma as any).payslipRecord.delete({
        where: { id }
      });

      res.status(200).json({ success: true, message: "Payslip deleted successfully" });

    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 7. Proxied Download
  static async downloadPayslip(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { id } = req.params;

      const record = await (prisma as any).payslipRecord.findUnique({
        where: { id },
        include: {
          employee: {
            select: {
              first_name: true,
              last_name: true
            }
          }
        }
      });

      if (!record || record.tenantId !== tenantId) {
        return res.status(404).json({ success: false, error: "Payslip not found" });
      }

      const response = await axios({
        method: 'get',
        url: record.fileUrl,
        responseType: 'stream'
      });

      const monthStr = dayjs(`${record.year}-${record.month}-01`).format('MMM_YYYY');
      const filename = `Payslip_${record.employee.first_name}_${record.employee.last_name}_${monthStr}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      response.data.pipe(res);

    } catch (error: any) {
      console.error("Proxy Download Error:", error.message);
      res.status(500).json({ success: false, error: "Failed to stream download" });
    }
  }

  // ✅ 8. Send Email (Single)
  static async sendEmail(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { payoutId } = req.body;
      const userId = req.user?.id;

      if (!payoutId) {
        return res.status(400).json({ success: false, error: "Payout ID is required" });
      }

      // 1. Fetch Payout with Employee 
      const payout = await prisma.salaryPayout.findUnique({
        where: { id: payoutId, tenantId: tenantId! },
        include: {
          employee: true,
          payslip: true
        }
      });

      if (!payout || !payout.employee) {
        return res.status(404).json({ success: false, error: "Payout or Employee not found" });
      }

      if (!payout.employee.work_email) {
        return res.status(400).json({ success: false, error: "Employee work email is missing" });
      }

      // 2. Fetch Company (Needed for 'from' address and generation if missing)
      const company = await prisma.company.findFirst({ where: { tenantId: tenantId! } });

      // 3. Ensure Payslip Record Exists
      let record = payout.payslip as any;
      if (!record) {
        // Need to generate first
        const configs = await (prisma as any).employee_field_configs.findMany({ where: { tenant_id: tenantId! } });
        const leaveSummary = await getEmployeeLeaveSummary(tenantId!, payout.employeeId, payout.month, payout.year);
        
        const fileUrl = await (generateAndUploadPayslipPDF as any)(payout, company, configs, leaveSummary);
        record = await (prisma as any).payslipRecord.create({
          data: {
            tenantId: tenantId!,
            employeeId: payout.employeeId,
            payoutId: payout.id,
            month: payout.month,
            year: payout.year,
            fileUrl,
            createdById: userId!,
            generatedAt: new Date()
          }
        });
      }

      // 3. Generate Presigned URL (24 hours)
      const { generatePresignedUrl } = require("@/utils/r2Client");
      const signedUrl = await generatePresignedUrl(record.fileUrl, 86400);

      // 4. Send Email
      const monthName = dayjs(`${payout.year}-${payout.month}-01`).format('MMMM');
      const { emailService } = require("@/utils/emailService");
      
      // Construct 'from' address strictly from company details
      const companyFrom = company?.email 
        ? `"${company.name}" <${company.email}>` 
        : `"${company?.name || 'Enterprise HR'}" <no-reply@zukvo.com>`;

      console.log(`[Payslip Controller] 📬 Company Email Found: ${company?.email}, Using Sender: ${companyFrom}`);

      const emailSent = await emailService.sendPayslipEmail({
        to: payout.employee.work_email,
        from: companyFrom,
        employeeName: `${payout.employee.first_name} ${payout.employee.last_name}`,
        month: monthName,
        year: payout.year.toString(),
        downloadUrl: signedUrl
      });

      if (!emailSent) {
        return res.status(500).json({ success: false, error: "Failed to send email" });
      }

      res.status(200).json({ success: true, message: "Email sent successfully" });

    } catch (err: any) {
      console.error("Send Email Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ✅ 9. Bulk Send Email
  static async bulkSendEmail(req: AuthRequest, res: Response) {
    try {
      const { tenantId } = req;
      const { payoutIds } = req.body;
      const userId = req.user?.id;

      if (!payoutIds || !Array.isArray(payoutIds)) {
        return res.status(400).json({ success: false, error: "Payout IDs array is required" });
      }

      const { generatePresignedUrl } = require("@/utils/r2Client");
      const { emailService } = require("@/utils/emailService");

      // 1. Fetch Company once for 'from' address
      const company = await prisma.company.findFirst({ where: { tenantId: tenantId! } });

      const results = { success: 0, failed: 0 };

      for (const payoutId of payoutIds) {
        try {
          const payout = await prisma.salaryPayout.findUnique({
            where: { id: payoutId, tenantId: tenantId! },
            include: {
              employee: true,
              payslip: true
            }
          });

          if (!payout || !payout.employee || !payout.employee.work_email) {
            results.failed++;
            continue;
          }

          let record = payout.payslip as any;
          if (!record) {
            const configs = await (prisma as any).employee_field_configs.findMany({ where: { tenant_id: tenantId! } });
            const leaveSummary = await getEmployeeLeaveSummary(tenantId!, payout.employeeId, payout.month, payout.year);
            const fileUrl = await (generateAndUploadPayslipPDF as any)(payout, company, configs, leaveSummary);
            record = await (prisma as any).payslipRecord.create({
              data: {
                tenantId: tenantId!,
                employeeId: payout.employeeId,
                payoutId: payout.id,
                month: payout.month,
                year: payout.year,
                fileUrl,
                createdById: userId!,
                generatedAt: new Date()
              }
            });
          }

          const signedUrl = await generatePresignedUrl(record.fileUrl, 86400);
          const monthName = dayjs(`${payout.year}-${payout.month}-01`).format('MMMM');

          // Construct 'from' address strictly from company details
          const companyFrom = company?.email 
            ? `"${company.name}" <${company.email}>` 
            : `"${company?.name || 'Enterprise HR'}" <no-reply@zukvo.com>`;

          console.log(`[Bulk Payslip] 📮 Sending from: ${companyFrom} to ${payout.employee.work_email}`);

          const sent = await emailService.sendPayslipEmail({
            to: payout.employee.work_email,
            from: companyFrom,
            employeeName: `${payout.employee.first_name} ${payout.employee.last_name}`,
            month: monthName,
            year: payout.year.toString(),
            downloadUrl: signedUrl
          });

          if (sent) results.success++;
          else results.failed++;

        } catch (e) {
          console.error(`Bulk mail failed for ${payoutId}:`, e);
          results.failed++;
        }
      }

      res.status(200).json({ success: true, data: results });

    } catch (err: any) {
      console.error("Bulk Email Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
