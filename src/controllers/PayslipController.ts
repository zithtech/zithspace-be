// import { Request, Response } from "express";
// import { prisma } from "../lib/prisma";

// /**
//  * CREATE PAYSLIP
//  */
// export const createPayslip = async (req: Request, res: Response) => {
//   try {
//     const {
//       employeeId,
//       companyId,
//       fromDate,
//       toDate,
//       snapshot,
//       pdfUrl,
//     } = req.body;

//     const tenantId = req.user.tenantId;
//     const createdById = req.user.id;

//     const payslip = await prisma.payslip.create({
//       data: {
//         tenantId,
//         employeeId,
//         companyId,
//         fromDate: new Date(fromDate),
//         toDate: new Date(toDate),
//         snapshot,
//         pdfUrl,
//         createdById,
//       },
//     });

//     res.status(201).json({
//       message: "Payslip created successfully",
//       data: payslip,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to create payslip" });
//   }
// };

// /**
//  * GET ALL PAYSLIPS (Tenant wise)
//  */
// export const getPayslips = async (req: Request, res: Response) => {
//   try {
//     const tenantId = req.user.tenantId;

//     const payslips = await prisma.payslip.findMany({
//       where: { tenantId },
//       orderBy: { createdAt: "desc" },
//       include: {
//         createdBy: {
//           select: { id: true, name: true },
//         },
//       },
//     });

//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslips" });
//   }
// };

// /**
//  * GET PAYSLIP BY ID
//  */
// export const getPayslipById = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslip = await prisma.payslip.findFirst({
//       where: {
//         id: Number(id),
//         tenantId,
//       },
//       include: {
//         createdBy: {
//           select: { id: true, name: true },
//         },
//       },
//     });

//     if (!payslip) {
//       return res.status(404).json({ message: "Payslip not found" });
//     }

//     res.json({ data: payslip });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslip" });
//   }
// };

// /**
//  * GET PAYSLIPS BY EMPLOYEE
//  */
// export const getPayslipsByEmployee = async (req: Request, res: Response) => {
//   try {
//     const { employeeId } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslips = await prisma.payslip.findMany({
//       where: {
//         tenantId,
//         employeeId,
//       },
//       orderBy: { fromDate: "desc" },
//     });

//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch employee payslips" });
//   }
// };

// /**
//  * DELETE PAYSLIP
//  */
// export const deletePayslip = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     await prisma.payslip.deleteMany({
//       where: {
//         id: Number(id),
//         tenantId,
//       },
//     });

//     res.json({ message: "Payslip deleted successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to delete payslip" });
//   }
// };



// import { Request, Response } from "express";
// import { prisma } from "../lib/prisma";
// import { generatePayslipPDF } from "../services/pdf.service";
// import { uploadToR2 } from "../services/r2.service";
// import { calculateSalary } from "../services/salary.service";

// /**
//  * 🔹 GENERATE PAYSLIPS (user or department)
//  */
// export const generatePayslips = async (req: Request, res: Response) => {
//   try {
//     const {
//       selectedCompany,
//       selectedSalaryStructureId,
//       fromDate,
//       toDate,
//       selectionType,
//       selectedUser,
//       selectedDepartment,
//     } = req.body;

//     const tenantId = req.user.tenantId;
//     const createdById = req.user.id;

//     if (!selectedCompany || !fromDate || !toDate || !selectionType) {
//       return res.status(400).json({ message: "Invalid payload" });
//     }

//     let employees: any[] = [];

//     if (selectionType === "user") {
//       employees = await prisma.user.findMany({
//         where: { tenantId, employeeCode: selectedUser, companyId: selectedCompany },
//       });
//     }

//     if (selectionType === "department") {
//       employees = await prisma.user.findMany({
//         where: { tenantId, department: selectedDepartment, companyId: selectedCompany },
//       });
//     }

//     if (!employees.length) {
//       return res.status(404).json({ message: "No employees found" });
//     }

//     const results = [];

//     for (const employee of employees) {
//       const attendance = await prisma.attendance.findMany({
//         where: {
//           tenantId,
//           employeeId: employee.employeeCode,
//           date: { gte: new Date(fromDate), lte: new Date(toDate) },
//         },
//       });

//       const reimbursements = await prisma.reimbursement.findMany({
//         where: {
//           tenantId,
//           employeeId: employee.employeeCode,
//           status: "APPROVED",
//           date: { gte: new Date(fromDate), lte: new Date(toDate) },
//         },
//       });

//       const holidays = await prisma.holiday.findMany({
//         where: {
//           tenantId,
//           companyId: selectedCompany,
//           date: { gte: new Date(fromDate), lte: new Date(toDate) },
//         },
//       });

//       const salaryResult = calculateSalary({
//         employee,
//         attendance,
//         reimbursements,
//         holidays,
//         salaryStructureId: selectedSalaryStructureId,
//       });

//       const snapshot = {
//         employee: { id: employee.employeeCode, name: employee.name, department: employee.department },
//         period: { fromDate, toDate },
//         attendance,
//         reimbursements,
//         holidays,
//         salary: salaryResult,
//       };

//       const pdfBuffer = await generatePayslipPDF(snapshot);

//       const pdfUrl = await uploadToR2({
//         buffer: pdfBuffer,
//         fileName: `payslips/${employee.employeeCode}-${fromDate}.pdf`,
//       });

//       const payslip = await prisma.payslip.create({
//         data: {
//           tenantId,
//           employeeId: employee.employeeCode,
//           companyId: selectedCompany,
//           fromDate: new Date(fromDate),
//           toDate: new Date(toDate),
//           snapshot,
//           pdfUrl,
//           createdById,
//         },
//       });

//       results.push(payslip);
//     }

//     return res.status(201).json({
//       message: "Payslips generated successfully",
//       count: results.length,
//       payslips: results,
//     });
//   } catch (error) {
//     console.error("Payslip generation error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// /**
//  * 🔹 GET ALL PAYSLIPS (Tenant wise)
//  */
// export const getPayslips = async (req: Request, res: Response) => {
//   try {
//     const tenantId = req.user.tenantId;
//     const payslips = await prisma.payslip.findMany({
//       where: { tenantId },
//       orderBy: { createdAt: "desc" },
//       include: { createdBy: { select: { id: true, name: true } } },
//     });
//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslips" });
//   }
// };

// /**
//  * 🔹 GET PAYSLIP BY ID
//  */
// export const getPayslipById = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslip = await prisma.payslip.findFirst({
//       where: { id: Number(id), tenantId },
//       include: { createdBy: { select: { id: true, name: true } } },
//     });

//     if (!payslip) return res.status(404).json({ message: "Payslip not found" });

//     res.json({ data: payslip });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslip" });
//   }
// };

// /**
//  * 🔹 GET PAYSLIPS BY EMPLOYEE
//  */
// export const getPayslipsByEmployee = async (req: Request, res: Response) => {
//   try {
//     const { employeeId } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslips = await prisma.payslip.findMany({
//       where: { tenantId, employeeId },
//       orderBy: { fromDate: "desc" },
//     });

//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch employee payslips" });
//   }
// };

// /**
//  * 🔹 DELETE PAYSLIP
//  */
// export const deletePayslip = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     await prisma.payslip.deleteMany({ where: { id: Number(id), tenantId } });

//     res.json({ message: "Payslip deleted successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to delete payslip" });
//   }
// };





// import { Request, Response } from "express";
// // import { Response } from "express";
// // import { AuthRequest } from "@/types";

// import { prisma } from "@/config/database";
// import { generateAndUploadPayslipPDF } from "../services/payslipPdf.service";
// import { calculateSalary } from "../services/salary.service";

// /**
//  * 🔹 GENERATE PAYSLIPS (user or department)
//  */
// export const generatePayslips = async (req: Request, res: Response) => {
// // export const generatePayslips = async (req: AuthRequest, res: Response) => {

//   try {
//     const {
//       selectedCompany,
//       selectedSalaryStructureId,
//       fromDate,
//       toDate,
//       selectionType,
//       selectedUser,
//       selectedDepartment,
//     } = req.body;

//     const tenantId = req.user.tenantId;
//     const createdById = req.user.id;

//     if (!selectedCompany || !fromDate || !toDate || !selectionType) {
//       return res.status(400).json({ message: "Invalid payload" });
//     }

//     let employees: any[] = [];

//     if (selectionType === "user") {
//       employees = await prisma.user.findMany({
//         where: { tenantId, employeeCode: selectedUser, companyId: selectedCompany },
//       });
//     } else if (selectionType === "department") {
//       employees = await prisma.user.findMany({
//         where: { tenantId, department: selectedDepartment, companyId: selectedCompany },
//       });
//     }

//     if (!employees.length) {
//       return res.status(404).json({ message: "No employees found" });
//     }

//     const results = [];

//     for (const employee of employees) {

//       const attendance = await prisma.attendance.findMany({
//         where: {
//           tenantId,
//           employeeId: employee.employeeCode,
//           date: { gte: new Date(fromDate), lte: new Date(toDate) },
//         },
//       });

//       // const reimbursements = await prisma.reimbursement.findMany({
//       //   where: {
//       //     tenantId,
//       //     employeeId: employee.employeeCode,
//       //     status: "APPROVED",
//       //     date: { gte: new Date(fromDate), lte: new Date(toDate) },
//       //   },
//       // });

//       // const holidays = await prisma.holiday.findMany({
//       //   where: {
//       //     tenantId,
//       //     companyId: selectedCompany,
//       //     date: { gte: new Date(fromDate), lte: new Date(toDate) },
//       //   },
//       // });
//       const reimbursements = [
//   { type: "Travel", amount: 1500 },
// ];

// const holidays = [
//   { date: "2026-02-14", name: "Festival Holiday" },
// ];

//       // Calculate salary
//       const salaryResult = calculateSalary({
//         employee,
//         attendance,
//         reimbursements,
//         holidays,
//         salaryStructureId: selectedSalaryStructureId,
//       });

//       // Snapshot
//       const snapshot = {
//         employee: {
//           id: employee.employeeCode,
//           name: employee.name,
//           department: employee.department,
//         },
//         period: { fromDate, toDate },
//         attendance,
//         reimbursements,
//         holidays,
//         salary: salaryResult,
//       };

//       // Generate PDF using existing service
//       const payslipData = {
//         employee: {
//           employeeId: employee.employeeCode,
//           employeeName: employee.name,
//           department: employee.department,
//           designation: employee.position,
//           doj: employee.createdAt?.toISOString().split('T')[0] || '',
//         },
//         company: await prisma.company.findUnique({
//           where: { id: selectedCompany },
//           select: {
//             id: true,
//             name: true,
//             logo: true,
//             cin: true,
//             gst: true,
//             phone: true,
//             email: true,
//             plotNo: true,
//             floorNo: true,
//             buildingName: true,
//             street: true,
//             area: true,
//             city: true,
//             pincode: true,
//             country: true,
//           }
//         }),
//         salaryStructure: salaryResult,
//         fromDate,
//         toDate,
//         attendance: attendance.reduce((acc, a) => {
//           acc[a.date] = a;
//           return acc;
//         }, {} as any),
//         reimbursements: reimbursements.reduce((acc, r) => {
//           acc[r.type] = { amount: r.amount, ytd: r.amount };
//           return acc;
//         }, {} as any),
//       };

//       const pdfUrl = await generateAndUploadPayslipPDF(payslipData);

//       // Save Payslip record
//       const payslip = await prisma.payslip.create({
//         data: {
//           tenantId,
//           employeeId: employee.employeeCode,
//           companyId: selectedCompany,
//           fromDate: new Date(fromDate),
//           toDate: new Date(toDate),
//           snapshot: payslipData,
//           pdfUrl,
//           createdById,
//         },
//         include: {
//           createdBy: {
//             select: { id: true, name: true },
//           },
//         },
//       });

//       results.push(payslip);
//     }

//     return res.status(201).json({
//       message: "Payslips generated successfully",
//       count: results.length,
//       payslips: results,
//     });
//   } catch (error) {
//     console.error("Payslip generation error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// /**
//  * 🔹 GET ALL PAYSLIPS (Tenant wise)
//  */
// export const getPayslips = async (req: Request, res: Response) => {
//   try {
//     const tenantId = req.user.tenantId;

//     const payslips = await prisma.payslip.findMany({
//       where: { tenantId },
//       orderBy: { createdAt: "desc" },
//       include: { createdBy: { select: { id: true, name: true } } },
//     });

//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslips" });
//   }
// };

// /**
//  * 🔹 GET PAYSLIP BY ID
//  */
// export const getPayslipById = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslip = await prisma.payslip.findFirst({
//       where: { id: Number(id), tenantId },
//       include: { createdBy: { select: { id: true, name: true } } },
//     });

//     if (!payslip) return res.status(404).json({ message: "Payslip not found" });

//     res.json({ data: payslip });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslip" });
//   }
// };

// /**
//  * 🔹 GET PAYSLIPS BY EMPLOYEE
//  */
// export const getPayslipsByEmployee = async (req: Request, res: Response) => {
//   try {
//     const { employeeId } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslips = await prisma.payslip.findMany({
//       where: { tenantId, employeeId },
//       orderBy: { fromDate: "desc" },
//     });

//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch employee payslips" });
//   }
// };

// /**
//  * 🔹 CREATE SINGLE PAYSLIP (from frontend modal)
//  */
// export const createPayslip = async (req: Request, res: Response) => {
//   try {
//     const {
//       employeeId,
//       companyId,
//       fromDate,
//       toDate,
//       snapshot,
//       pdfUrl,
//     } = req.body;

//     const tenantId = req.user.tenantId;
//     const createdById = req.user.id;

//     // Validate required fields
//     if (!employeeId || !companyId || !fromDate || !toDate || !snapshot) {
//       return res.status(400).json({ 
//         message: "Missing required fields: employeeId, companyId, fromDate, toDate, snapshot" 
//       });
//     }

//     // Generate PDF if not provided
//     let finalPdfUrl = pdfUrl;
//     if (!finalPdfUrl && snapshot.company) {
//       try {
//         finalPdfUrl = await generateAndUploadPayslipPDF(snapshot);
//       } catch (pdfError) {
//         console.error("PDF generation failed:", pdfError);
//         // Continue without PDF - still save the payslip data
//       }
//     }

//     const payslip = await prisma.payslip.create({
//       data: {
//         tenantId,
//         employeeId,
//         companyId: Number(companyId),
//         fromDate: new Date(fromDate),
//         toDate: new Date(toDate),
//         snapshot,
//         pdfUrl: finalPdfUrl,
//         createdById,
//       },
//       include: {
//         createdBy: {
//           select: { id: true, name: true },
//         },
//       },
//     });

//     res.status(201).json({
//       message: "Payslip created successfully",
//       data: payslip,
//     });
//   } catch (error) {
//     console.error("Create payslip error:", error);
//     res.status(500).json({ message: "Failed to create payslip" });
//   }
// };

// /**
//  * 🔹 DELETE PAYSLIP
//  */
// export const deletePayslip = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     await prisma.payslip.deleteMany({
//       where: {
//         id: Number(id),
//         tenantId,
//       },
//     });

//     res.json({ message: "Payslip deleted successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to delete payslip" });
//   }
// };


// import { Response } from "express";
// import { AuthRequest } from "@/types"; // Make sure this path is correct

// import { prisma } from "@/config/database";
// import { generateAndUploadPayslipPDF } from "../services/payslipPdf.service";
// import { calculateSalary } from "../services/salary.service";

// /**
//  * 🔹 GENERATE PAYSLIPS (user or department)
//  */
// export const generatePayslips = async (req: AuthRequest, res: Response) => {
//   try {
//     const {
//       selectedCompany,
//       selectedSalaryStructureId,
//       fromDate,
//       toDate,
//       selectionType,
//       selectedUser,
//       selectedDepartment,
//     } = req.body;

//     // Add type guards to ensure user exists
//     if (!req.user) {
//       return res.status(401).json({ message: "Unauthorized - No user found" });
//     }

//     const tenantId = req.user.tenantId;
//     const createdById = req.user.id;

//     if (!selectedCompany || !fromDate || !toDate || !selectionType) {
//       return res.status(400).json({ message: "Invalid payload" });
//     }

//     let employees: any[] = [];

//     if (selectionType === "user") {
//       employees = await prisma.user.findMany({
//         where: { tenantId, employeeCode: selectedUser, companyId: selectedCompany },
//       });
//     } else if (selectionType === "department") {
//       employees = await prisma.user.findMany({
//         where: { tenantId, department: selectedDepartment, companyId: selectedCompany },
//       });
//     }

//     if (!employees.length) {
//       return res.status(404).json({ message: "No employees found" });
//     }

//     const results = [];

//     for (const employee of employees) {
      
//       const attendance = await prisma.attendance.findMany({
//         where: {
//           tenantId,
//           employeeId: employee.employeeCode,
//           date: { gte: new Date(fromDate), lte: new Date(toDate) },
//         },
//       });

//       // Mock data - replace with actual database queries
//       const reimbursements = [
//         { type: "Travel", amount: 1500 },
//       ];

//       const holidays = [
//         { date: "2026-02-14", name: "Festival Holiday" },
//       ];

//       // Calculate salary
//       const salaryResult = calculateSalary({
//         employee,
//         attendance,
//         reimbursements,
//         holidays,
//         salaryStructureId: selectedSalaryStructureId,
//       });

//       // Snapshot
//       const snapshot = {
//         employee: {
//           id: employee.employeeCode,
//           name: employee.name,
//           department: employee.department,
//         },
//         period: { fromDate, toDate },
//         attendance,
//         reimbursements,
//         holidays,
//         salary: salaryResult,
//       };

//       // Generate PDF using existing service
//       const payslipData = {
//         employee: {
//           employeeId: employee.employeeCode,
//           employeeName: employee.name,
//           department: employee.department,
//           designation: employee.position,
//           doj: employee.createdAt?.toISOString().split('T')[0] || '',
//         },
//         company: await prisma.company.findUnique({
//           where: { id: selectedCompany },
//           select: {
//             id: true,
//             name: true,
//             logo: true,
//             cin: true,
//             gst: true,
//             phone: true,
//             email: true,
//             plotNo: true,
//             floorNo: true,
//             buildingName: true,
//             street: true,
//             area: true,
//             city: true,
//             pincode: true,
//             country: true,
//           }
//         }),
//         salaryStructure: salaryResult,
//         fromDate,
//         toDate,
//         attendance: attendance.reduce((acc, a) => {
//           acc[a.date] = a;
//           return acc;
//         }, {} as any),
//         reimbursements: reimbursements.reduce((acc, r) => {
//           acc[r.type] = { amount: r.amount, ytd: r.amount };
//           return acc;
//         }, {} as any),
//       };

//       const pdfUrl = await generateAndUploadPayslipPDF(payslipData);

//       // Save Payslip record
//       const payslip = await prisma.payslip.create({
//         data: {
//           tenantId,
//           employeeId: employee.employeeCode,
//           companyId: selectedCompany,
//           fromDate: new Date(fromDate),
//           toDate: new Date(toDate),
//           snapshot: payslipData,
//           pdfUrl,
//           createdById,
//         },
//         include: {
//           createdBy: {
//             select: { id: true, name: true },
//           },
//         },
//       });

//       results.push(payslip);
//     }

//     return res.status(201).json({
//       message: "Payslips generated successfully",
//       count: results.length,
//       payslips: results,
//     });
//   } catch (error) {
//     console.error("Payslip generation error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

// /**
//  * 🔹 GET ALL PAYSLIPS (Tenant wise)
//  */
// export const getPayslips = async (req: AuthRequest, res: Response) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }
    
//     const tenantId = req.user.tenantId;

//     const payslips = await prisma.payslip.findMany({
//       where: { tenantId },
//       orderBy: { createdAt: "desc" },
//       include: { createdBy: { select: { id: true, name: true } } },
//     });

//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslips" });
//   }
// };

// /**
//  * 🔹 GET PAYSLIP BY ID
//  */
// export const getPayslipById = async (req: AuthRequest, res: Response) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }
    
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslip = await prisma.payslip.findFirst({
//       where: { id: Number(id), tenantId },
//       include: { createdBy: { select: { id: true, name: true } } },
//     });

//     if (!payslip) return res.status(404).json({ message: "Payslip not found" });

//     res.json({ data: payslip });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch payslip" });
//   }
// };

// /**
//  * 🔹 GET PAYSLIPS BY EMPLOYEE
//  */
// export const getPayslipsByEmployee = async (req: AuthRequest, res: Response) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }
    
//     const { employeeId } = req.params;
//     const tenantId = req.user.tenantId;

//     const payslips = await prisma.payslip.findMany({
//       where: { tenantId, employeeId },
//       orderBy: { fromDate: "desc" },
//     });

//     res.json({ data: payslips });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch employee payslips" });
//   }
// };

// /**
//  * 🔹 CREATE SINGLE PAYSLIP (from frontend modal)
//  */
// export const createPayslip = async (req: AuthRequest, res: Response) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }
    
//     const {
//       employeeId,
//       companyId,
//       fromDate,
//       toDate,
//       snapshot,
//       pdfUrl,
//     } = req.body;

//     const tenantId = req.user.tenantId;
//     const createdById = req.user.id;

//     // Validate required fields
//     if (!employeeId || !companyId || !fromDate || !toDate || !snapshot) {
//       return res.status(400).json({ 
//         message: "Missing required fields: employeeId, companyId, fromDate, toDate, snapshot" 
//       });
//     }

//     // Generate PDF if not provided
//     let finalPdfUrl = pdfUrl;
//     if (!finalPdfUrl && snapshot.company) {
//       try {
//         finalPdfUrl = await generateAndUploadPayslipPDF(snapshot);
//       } catch (pdfError) {
//         console.error("PDF generation failed:", pdfError);
//         // Continue without PDF - still save the payslip data
//       }
//     }

//     const payslip = await prisma.payslip.create({
//       data: {
//         tenantId,
//         employeeId,
//         companyId: Number(companyId),
//         fromDate: new Date(fromDate),
//         toDate: new Date(toDate),
//         snapshot,
//         pdfUrl: finalPdfUrl,
//         createdById,
//       },
//       include: {
//         createdBy: {
//           select: { id: true, name: true },
//         },
//       },
//     });

//     res.status(201).json({
//       message: "Payslip created successfully",
//       data: payslip,
//     });
//   } catch (error) {
//     console.error("Create payslip error:", error);
//     res.status(500).json({ message: "Failed to create payslip" });
//   }
// };

// /**
//  * 🔹 DELETE PAYSLIP
//  */
// export const deletePayslip = async (req: AuthRequest, res: Response) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }
    
//     const { id } = req.params;
//     const tenantId = req.user.tenantId;

//     await prisma.payslip.deleteMany({
//       where: {
//         id: Number(id),
//         tenantId,
//       },
//     });

//     res.json({ message: "Payslip deleted successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to delete payslip" });
//   }
// };


import { Response } from "express";
import { AuthRequest } from "@/types";
import { prisma } from "@/config/database";
import { generateAndUploadPayslipPDF } from "../services/payslipPdf.service";
import { calculateSalary } from "../services/salary.service";

/**
 * 🔹 GENERATE PAYSLIPS (user or department)
 */
export const generatePayslips = async (req: AuthRequest, res: Response) => {
  try {
    const {
      selectedCompany,
      selectedSalaryStructureId,
      fromDate,
      toDate,
      selectionType,
      selectedUser,
      selectedDepartment,
    } = req.body;

    // Add type guards to ensure user exists
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized - No user found" });
    }

    const tenantId = req.user.tenantId;
    const createdById = req.user.id;

    if (!selectedCompany || !fromDate || !toDate || !selectionType) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    // FIRST: Debug what fields actually exist on User model
    const sampleUser = await prisma.user.findFirst({
      where: { tenantId },
      select: {
        id: true,
        name: true,
       
        // Try to include all possible fields
      }
    });
    
    console.log('Available user fields:', Object.keys(sampleUser || {}));

    let employees: any[] = [];
    let employee :{};

    // if (selectionType === "user") {
    //   // Find user by ID (assuming selectedUser is the user ID)
    //   employee = await prisma.user.findFirst({
    //     where: { 
    //       tenantId, 
    //       id: selectedUser, // Use id field which should exist
    //     },
    //   });
    // }
    
    if (selectionType === "user") {
  const employee = await prisma.user.findFirst({
    where: {
      tenantId,
      id: selectedUser,
    },
  });

  if (!employee) {
    return res.status(404).json({
      message: "User not found",
      selectedUser,
    });
  }

  employees = [employee]; // ✅ THIS IS THE KEY
}

    else if (selectionType === "department") {
      // Option 1: If there's a department field (check your schema)
      try {
        employees = await prisma.user.findMany({
          where: { 
            tenantId,
            // Try different field names that might store department info
            // department: selectedDepartment, // if exists
            // role: selectedDepartment,
            // position: selectedDepartment,
          },
        });
        
        // If no direct field, filter manually
        employees = employees.filter(emp => {
          // Check various possible fields for department info
          return emp.department === selectedDepartment ||
                 emp.role === selectedDepartment ||
                 emp.position === selectedDepartment ||
                 emp.title === selectedDepartment;
        });
      } catch (error) {
        console.log('Error filtering by department, fetching all users:', error);
        employees = await prisma.user.findMany({
          where: { tenantId }
        });
      }
    }

    // Filter by company if needed
    // Check if employees have companyId field or it's stored differently
    if (selectedCompany) {
        return employees
      // employees = employees.filter(emp => {
      //   console.log(employees,emp.companyd)
        
      //   // Try different ways to check company association
      //  if(emp.company_id === selectedCompany ||
      //          emp.company_id === Number(selectedCompany) ||
      //          emp.company?.id === selectedCompany ||
      //          emp.company?.id === Number(selectedCompany)){
      //           return emp;

      //          }
      // });
    }
   
    if (!employees.length) {
      return res.status(404).json({ 
        message: "No employees found with the given criteria",
        criteria: { selectedCompany, selectionType, selectedUser, selectedDepartment }
      });
    }

    const results = [];

    for (const employee of employees) {
      // Use employee id as identifier (should always exist)
      const employeeIdentifier = employee.id;
      
      const attendance = await prisma.attendance.findMany({
        where: {
          tenantId,
          userId: employee.id,
          date: { gte: new Date(fromDate), lte: new Date(toDate) },
        },
      });

      // Mock data - replace with actual database queries
      const reimbursements = [
        { type: "Travel", amount: 1500 },
      ];

      const holidays = [
        { date: new Date("2026-02-14"), name: "Festival Holiday" },
      ];

      // Calculate salary
      const salaryResult = calculateSalary({
        employee,
        attendance,
        reimbursements,
        holidays,
        salaryStructureId: selectedSalaryStructureId,
      });

      // Convert Date objects to string for attendance index
      const attendanceMap = attendance.reduce((acc: any, a) => {
        const dateString = a.date.toISOString().split('T')[0];
        acc[dateString] = a;
        return acc;
      }, {});

      // Get company info
      const company = await prisma.company.findUnique({
        where: { id: Number(selectedCompany) },
        select: {
          id: true,
          name: true,
          logo: true,
          cin: true,
          gst: true,
          phone: true,
          email: true,
          plotNo: true,
          floorNo: true,
          buildingName: true,
          street: true,
          area: true,
          city: true,
          pincode: true,
          country: true,
        }
      });

      if (!company) {
        console.error(`Company not found: ${selectedCompany}`);
        continue; // Skip this employee
      }

      // Prepare employee info for payslip
      // Use employee.id as employeeId if no employeeCode exists
      const employeeIdForPayslip = employee.employeeCode || employee.employeeId || employee.id;
      const departmentForPayslip = employee.department || employee.role || employee.position || 'N/A';
      const designationForPayslip = employee.position || employee.role || employee.title || 'N/A';
      const dojForPayslip = employee.joiningDate || employee.createdAt || employee.createdAt;

      const payslipData = {
        employee: {
          employeeId: employeeIdForPayslip,
          employeeName: employee.name,
          department: departmentForPayslip,
          designation: designationForPayslip,
          doj: dojForPayslip ? new Date(dojForPayslip).toISOString().split('T')[0] : '',
        },
        company,
        salaryStructure: {
          ...salaryResult,
          employeeId: employeeIdForPayslip,
          // Add any missing required properties for EmployeeSalary type
          deductionsEnabled: salaryResult.deductions && salaryResult.deductions.length > 0,
        },
        fromDate,
        toDate,
        attendance: attendanceMap,
        reimbursements: reimbursements.reduce((acc: any, r) => {
          acc[r.type] = { amount: r.amount, ytd: r.amount };
          return acc;
        }, {}),
      };

      // Generate PDF
      const pdfUrl = await generateAndUploadPayslipPDF(payslipData);

      // Save Payslip record
      const payslip = await prisma.payslip.create({
        data: {
          tenantId,
          employeeId: employeeIdForPayslip,
          companyId: Number(selectedCompany),
          fromDate: new Date(fromDate),
          toDate: new Date(toDate),
          snapshot: payslipData,
          pdfUrl,
          createdById,
        },
        include: {
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });

      results.push(payslip);
    }

    return res.status(201).json({
      message: "Payslips generated successfully",
      count: results.length,
      payslips: results,
    });
  } catch (error) {
    console.error("Payslip generation error:", error);
    return res.status(500).json({ 
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
};



/**
 * 🔹 GET ALL PAYSLIPS (Tenant wise)
 */
export const getPayslips = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const tenantId = req.user.tenantId;

    const payslips = await prisma.payslip.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    res.json({ data: payslips });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch payslips" });
  }
};

/**
 * 🔹 GET PAYSLIP BY ID
 */
export const getPayslipById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    const payslip = await prisma.payslip.findFirst({
      where: { id: Number(id), tenantId },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    if (!payslip) return res.status(404).json({ message: "Payslip not found" });

    res.json({ data: payslip });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch payslip" });
  }
};

/**
 * 🔹 GET PAYSLIPS BY EMPLOYEE
 */
export const getPayslipsByEmployee = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { employeeId } = req.params;
    const tenantId = req.user.tenantId;

    const payslips = await prisma.payslip.findMany({
      where: { tenantId, employeeId },
      orderBy: { fromDate: "desc" },
    });

    res.json({ data: payslips });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch employee payslips" });
  }
};

/**
 * 🔹 CREATE SINGLE PAYSLIP (from frontend modal)
 */   
export const createPayslip = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const {
      employeeId,
      companyId,
      fromDate,
      toDate,
      snapshot,
      pdfUrl,
    } = req.body;

    const tenantId = req.user.tenantId;
    const createdById = req.user.id;

    // Validate required fields
    if (!employeeId || !companyId || !fromDate || !toDate || !snapshot) {
      return res.status(400).json({ 
        message: "Missing required fields: employeeId, companyId, fromDate, toDate, snapshot" 
      });
    }

    // Generate PDF if not provided
    let finalPdfUrl = pdfUrl;
    if (!finalPdfUrl && snapshot.company) {
      try {
        finalPdfUrl = await generateAndUploadPayslipPDF(snapshot);
      } catch (pdfError) {
        console.error("PDF generation failed:", pdfError);
        // Continue without PDF - still save the payslip data
      }
    }

    const payslip = await prisma.payslip.create({
      data: {
        tenantId,
        employeeId,
        companyId: Number(companyId),
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        snapshot,
        pdfUrl: finalPdfUrl,
        createdById,
      },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({
      message: "Payslip created successfully",
      data: payslip,
    });
  } catch (error) {
    console.error("Create payslip error:", error);
    res.status(500).json({ message: "Failed to create payslip" });
  }
};

/**
 * 🔹 DELETE PAYSLIP
 */
export const deletePayslip = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const { id } = req.params;
    const tenantId = req.user.tenantId;

    await prisma.payslip.deleteMany({
      where: {
        id: Number(id),
        tenantId,
      },
    });

    res.json({ message: "Payslip deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete payslip" });
  }
};