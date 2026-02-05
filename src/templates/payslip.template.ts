import {
  PayslipData,
  ATTENDANCE_LABELS,
  LEAVE_LABELS,
  REIMBURSEMENT_LABELS,
} from "@/types/salary";
import {
  calculateEarningsWithYTD,
  calculateDeductionsWithYTD,
  calculateTotalEarnings,
  calculateTotalDeductions,
  calculateNetPay,
  calculateTotalEarningsYTD,
  calculateTotalDeductionsYTD,
  numberToWords,
  formatDate,
  formatMonthYear,
  formatCompanyAddress,
} from "@/utils/payslip.utils";

/**
 * Backend HTML Payslip Generator
 * Attendance + Holidays = API driven
 */
// export const generatePayslipHtml = (data: PayslipData): string => {
//   const {
//     employee,
//     company,
//     salaryStructure,
//     fromDate,
//     toDate,
//     attendance,
//     reimbursements,
//   } = data;

//   const structure = {
//     grossSalary: salaryStructure.grossSalary,
//     earnings: salaryStructure.earnings,
//     deductions: salaryStructure.deductions,
//     deductionsEnabled: salaryStructure.deductionsEnabled,
//   };

//   const earnings = calculateEarningsWithYTD(structure, fromDate);
//   const deductions = calculateDeductionsWithYTD(structure, fromDate);

//   const totalEarnings = calculateTotalEarnings(structure);
//   const totalDeductions = calculateTotalDeductions(structure);

//   const totalEarningsYTD = calculateTotalEarningsYTD(structure, fromDate);
//   const totalDeductionsYTD = calculateTotalDeductionsYTD(structure, fromDate);

//   const netPay = calculateNetPay(structure);
//   const reimburseTotal = reimbursements?.total ?? 0;
//   const finalTransfer = netPay + reimburseTotal;

//   return `
// <!DOCTYPE html>
// <html>
// <head>
//   <meta charset="utf-8" />
//   <title>Payslip - ${employee.employeeName}</title>
//   <style>
//     body { font-family: Arial; font-size: 12px; color: #000; }
//     table { width: 100%; border-collapse: collapse; }
//     th, td { border: 1px solid #000; padding: 6px; }
//     th { background: #f2f2f2; }
//     .right { text-align: right; }
//     .center { text-align: center; }
//   </style>
// </head>

// <body>
//   <h2>${company.name}</h2>
//   ${formatCompanyAddress(company).map(l => `<div>${l}</div>`).join("")}

//   <hr/>

//   <h3 class="center">PAYSLIP – ${formatMonthYear(fromDate)}</h3>

//   <table>
//     <tr>
//       <td><b>Employee</b></td><td>${employee.employeeName}</td>
//       <td><b>Employee ID</b></td><td>${employee.employeeId}</td>
//     </tr>
//     <tr>
//       <td><b>Department</b></td><td>${employee.department}</td>
//       <td><b>Designation</b></td><td>${employee.designation}</td>
//     </tr>
//     <tr>
//       <td><b>Period</b></td>
//       <td colspan="3">${formatDate(fromDate)} - ${formatDate(toDate)}</td>
//     </tr>
//   </table>

//   <br/>

//   ${attendance ? `
//   <h4>Attendance Summary</h4>
//   <table>
//     ${Object.entries(ATTENDANCE_LABELS).map(([k, label]) => `
//       <tr>
//         <td>${label}</td>
//         <td class="right">${(attendance as any)[k] ?? "-"}</td>
//       </tr>
//     `).join("")}
//   </table>
//   ` : ""}

//   <br/>

//   <table>
//     <tr>
//       <th>Earnings</th><th>Amount</th><th>YTD</th>
//       <th>Deductions</th><th>Amount</th><th>YTD</th>
//     </tr>

//     ${Math.max(earnings.length, deductions.length)
//       .toString()
//       .split("")
//       .map((_, i) => `
//       <tr>
//         <td>${earnings[i]?.name ?? ""}</td>
//         <td class="right">${earnings[i]?.amount?.toLocaleString("en-IN") ?? ""}</td>
//         <td class="right">${earnings[i]?.ytd?.toLocaleString("en-IN") ?? ""}</td>

//         <td>${deductions[i]?.name ?? ""}</td>
//         <td class="right">${deductions[i]?.amount?.toLocaleString("en-IN") ?? ""}</td>
//         <td class="right">${deductions[i]?.ytd?.toLocaleString("en-IN") ?? ""}</td>
//       </tr>
//     `).join("")}

//     <tr>
//       <th>Total</th>
//       <th class="right">${totalEarnings.toLocaleString("en-IN")}</th>
//       <th class="right">${totalEarningsYTD.toLocaleString("en-IN")}</th>
//       <th>Total</th>
//       <th class="right">${totalDeductions.toLocaleString("en-IN")}</th>
//       <th class="right">${totalDeductionsYTD.toLocaleString("en-IN")}</th>
//     </tr>
//   </table>

//   <br/>

//   <h3 class="center">
//     Net Pay : ₹ ${netPay.toLocaleString("en-IN")}
//   </h3>

//   ${reimburseTotal > 0 ? `
//     <h4 class="center">Total Transfer : ₹ ${finalTransfer.toLocaleString("en-IN")}</h4>
//   ` : ""}

//   <p><b>Amount in Words:</b> ${numberToWords(netPay)}</p>

//   <br/><br/>
//   <div style="text-align:right">
//     <b>Authorized Signatory</b><br/>
//     For ${company.name}
//   </div>

// </body>
// </html>
// `;
// };



export const generatePayslipHtml = (data: PayslipData): string => {
  const {
    employee,
    company,
    salaryStructure,
    fromDate,
    toDate,
    attendance,
    reimbursements,
  } = data;

  const structure = {
    grossSalary: salaryStructure.grossSalary,
    earnings: salaryStructure.earnings,
    deductions: salaryStructure.deductions,
    deductionsEnabled: salaryStructure.deductionsEnabled,
  };

  const earnings = calculateEarningsWithYTD(structure, fromDate);
  const deductions = calculateDeductionsWithYTD(structure, fromDate);

  const totalEarnings = calculateTotalEarnings(structure);
  const totalDeductions = calculateTotalDeductions(structure);
  const totalEarningsYTD = calculateTotalEarningsYTD(structure, fromDate);
  const totalDeductionsYTD = calculateTotalDeductionsYTD(structure, fromDate);

  const netPay = calculateNetPay(structure);
  const reimburseTotal = reimbursements?.total ?? 0;
  const finalTransfer = netPay + reimburseTotal;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Payslip</title>
<style>
  body { font-family: Arial; font-size: 12px; color:#000; }
  table { width:100%; border-collapse:collapse; }
  td, th { padding:6px; }
  .border { border:1px solid #000; }
  .right { text-align:right; }
  .center { text-align:center; }
  .bold { font-weight:700; }
</style>
</head>

<body>

<div class="border" style="padding:12px">

  <!-- HEADER -->
  <table>
    <tr>
      <td style="width:70%">
        <div style="font-size:25px;font-weight:700">${company.name}</div>
        ${formatCompanyAddress(company).map(l => `<div>${l}</div>`).join("")}
      </td>
      <td style="width:30%" class="right">
        ${company.cin ? `<div>CIN: ${company.cin}</div>` : ""}
        ${company.gst ? `<div>GST: ${company.gst}</div>` : ""}
        ${company.phone ? `<div>${company.phone}</div>` : ""}
        ${company.email ? `<div>${company.email}</div>` : ""}
      </td>
    </tr>
  </table>

  <hr/>

  <div class="center bold" style="font-size:14px">
    Payslip for the Month of ${formatMonthYear(fromDate)}
  </div>

  <!-- EMPLOYEE INFO -->
  <table style="margin-top:10px">
    <tr>
      <td><b>Employee Name</b></td><td>${employee.employeeName}</td>
      <td><b>Employee ID</b></td><td>${employee.employeeId}</td>
    </tr>
    <tr>
      <td><b>Department</b></td><td>${employee.department}</td>
      <td><b>Designation</b></td><td>${employee.designation}</td>
    </tr>
    <tr>
      <td><b>Period</b></td>
      <td colspan="3">${formatDate(fromDate)} - ${formatDate(toDate)}</td>
    </tr>
  </table>

  ${
    attendance
      ? `
  <!-- ATTENDANCE -->
  <div class="border" style="margin-top:10px">
    <div class="bold" style="border-bottom:1px solid #000;padding:6px">
      Attendance Summary
    </div>
    <table>
      ${Object.entries(ATTENDANCE_LABELS)
        .map(
          ([k, label]) => `
        <tr>
          <td>${label}</td>
          <td class="right">${(attendance as any)[k] ?? "-"}</td>
        </tr>
      `,
        )
        .join("")}
    </table>
  </div>
  `
      : ""
  }

  <!-- EARNINGS / DEDUCTIONS -->
  <table class="border" style="margin-top:10px">
    <tr class="bold">
      <td>Earnings</td><td class="right">Amount</td><td class="right">YTD</td>
      <td>Deductions</td><td class="right">Amount</td><td class="right">YTD</td>
    </tr>

    ${Array.from({
      length: Math.max(earnings.length, deductions.length),
    })
      .map(
        (_, i) => `
      <tr>
        <td>${earnings[i]?.name ?? ""}</td>
        <td class="right">${earnings[i]?.amount ?? ""}</td>
        <td class="right">${earnings[i]?.ytd ?? ""}</td>

        <td>${deductions[i]?.name ?? ""}</td>
        <td class="right">${deductions[i]?.amount ?? ""}</td>
        <td class="right">${deductions[i]?.ytd ?? ""}</td>
      </tr>
    `,
      )
      .join("")}

    <tr class="bold">
      <td>Total</td>
      <td class="right">${totalEarnings}</td>
      <td class="right">${totalEarningsYTD}</td>
      <td>Total</td>
      <td class="right">${totalDeductions}</td>
      <td class="right">${totalDeductionsYTD}</td>
    </tr>
  </table>

  <div class="border bold center" style="margin-top:-1px;padding:10px">
    Net Home Pay : ₹ ${netPay}
  </div>

  ${
    reimburseTotal > 0
      ? `
  <div class="border" style="margin-top:10px;padding:10px">
    <div class="bold">Total Reimbursements</div>
    <div class="right">₹ ${reimburseTotal}</div>
  </div>
  `
      : ""
  }

  <div class="bold" style="margin-top:10px;font-size:16px">
    Net Transfer : ₹ ${finalTransfer}
  </div>

  <div style="margin-top:6px">
    <b>In Words :</b> ${numberToWords(netPay)} Only
  </div>

</div>

</body>
</html>
`;
};
