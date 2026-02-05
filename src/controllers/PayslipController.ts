// import { Request, Response } from "express";
// import { prisma } from "@/config/database";


// const STATIC_EMPLOYEE = {
//   employeeId: "EMP001",
//   employeeName: "Test User",
//   department: "HR",
//   designation: "Software Engineer",
//   bankAccount: "XXXX1234",
// };


// const STATIC_REIMBURSEMENTS = [
//   { title: "Internet Allowance", amount: 1000 },
//   { title: "Travel Allowance", amount: 1500 },
// ];


// export const generatePayslips = async (req: Request, res: Response) => {
//   const {
//     companyId,
//     selectedSalaryStructureId,
//     fromDate,
//     toDate,
//     selectionType,
//     selectedUser,
//     selectedDepartment,
//   } = req.body;

//   const tenantId = req.user.tenantId;
//   const createdById = req.user.id;

//   /* 1️⃣ Decide employees (STATIC for now) */
//   let employees = [];

//   if (selectionType === "user") {
//     employees = [{ ...STATIC_EMPLOYEE, employeeId: selectedUser }];
//   }

//   if (selectionType === "department") {
//     // TEMP: fake 2 users
//     employees = [
//       { ...STATIC_EMPLOYEE, employeeId: "EMP001" },
//       { ...STATIC_EMPLOYEE, employeeId: "EMP002", employeeName: "Demo User 2" },
//     ];
//   }

//   const results = [];

//   for (const emp of employees) {
//     /* 2️⃣ Dynamic backend APIs */
//     const attendance = await attendanceService.get(
//       emp.employeeId,
//       fromDate,
//       toDate
//     );

//     const holidays = await holidayService.get(
//       companyId,
//       fromDate,
//       toDate
//     );

//     const salaryStructure =
//       await salaryStructureService.get(selectedSalaryStructureId);

//     const company =
//       await companyService.getById(companyId);

//     /* 3️⃣ Static reimbursement */
//     const reimbursements = STATIC_REIMBURSEMENTS;

//     /* 4️⃣ Salary calculation */
//     const calculation = calculateSalary({
//       employee: emp,
//       salaryStructure,
//       attendance,
//       holidays,
//       reimbursements,
//     });

//     /* 5️⃣ Snapshot JSON */
//     const snapshot = {
//       employee: emp,               // STATIC
//       company,                     // API
//       period: { fromDate, toDate },

//       salaryStructure: {
//         id: salaryStructure.id,
//         name: salaryStructure.name,
//         earnings: salaryStructure.earnings,
//         deductions: salaryStructure.deductions,
//       },

//       attendance,                  // API
//       holidays,                    // API
//       reimbursements,              // STATIC
//       calculation,
//     };

//     /* 6️⃣ PDF + R2 */
//     const pdfBuffer = await generatePayslipPDF(snapshot);
//     const pdfUrl = await uploadToR2({
//       file: pdfBuffer,
//       path: `payslips/${emp.employeeId}/${fromDate}_${toDate}.pdf`,
//     });

//     /* 7️⃣ Save DB */
//     const payslip = await prisma.payslip.create({
//       data: {
//         tenantId,
//         employeeId: emp.employeeId,
//         companyId,
//         fromDate: new Date(fromDate),
//         toDate: new Date(toDate),
//         snapshot,
//         pdfUrl,
//         createdById,
//       },
//     });

//     results.push(payslip);
//   }

//   res.status(201).json({
//     message: "Payslip generated (static + dynamic mix)",
//     count: results.length,
//     data: results,
//   });
// };
