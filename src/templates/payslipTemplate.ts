import dayjs from 'dayjs';
import { decrypt } from '../controllers/bankAndPayrolllController';

/**
 * --- UTILITIES ---
 */
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('₹', '');
};

const numberToWords = (num: number): string => {
  if (num === 0) return 'Zero';

  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const double = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const formatTrio = (n: number) => {
    let res = '';
    if (n > 99) {
      res += single[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n > 19) {
      res += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 9) {
      res += double[n - 10] + ' ';
    } else if (n > 0) {
      res += single[n] + ' ';
    }
    return res;
  };

  let res = '';
  let intPart = Math.floor(num);

  if (intPart >= 10000000) {
    res += formatTrio(Math.floor(intPart / 10000000)) + 'Crore ';
    intPart %= 10000000;
  }
  if (intPart >= 100000) {
    res += formatTrio(Math.floor(intPart / 100000)) + 'Lakh ';
    intPart %= 100000;
  }
  if (intPart >= 1000) {
    res += formatTrio(Math.floor(intPart / 1000)) + 'Thousand ';
    intPart %= 1000;
  }
  res += formatTrio(intPart);

  return res.trim() + ' Rupees only';
};

export const generatePayslipHtml = (payout: any, company: any, configs: any[] = [], leaveSummary: any = {}) => {
  const employee = payout.employee;
  const bankDetail = employee.bankDetail;
  const earnings = payout.components?.earnings || [];
  const deductions = payout.components?.deductions || [];
  const adjustments = payout.adjustments || [];
  const payrollDetail = employee.payrollDetail;
  const identity = employee.employeeIdentity;

  // Decrypt PII
  const decAccount = bankDetail?.accountNumber ? decrypt(bankDetail.accountNumber) : 'N/A';
  const decIfsc = bankDetail?.ifscCode ? decrypt(bankDetail.ifscCode) : 'N/A';
  const decPan = identity?.panNumber ? decrypt(identity.panNumber) : 'N/A';
  const decPf = payrollDetail?.pfNumber ? decrypt(payrollDetail.pfNumber) : 'N/A';
  const decUan = payrollDetail?.uanNumber ? decrypt(payrollDetail.uanNumber) : 'N/A';
  const decEsi = payrollDetail?.esiNumber ? decrypt(payrollDetail.esiNumber) : 'N/A';

  const getLabel = (systemKey: string, defaultLabel: string) => {
    const config = configs.find(c => c.system_key === systemKey);
    return config ? config.display_name : defaultLabel;
  };

  const totalEarnings = earnings.reduce((sum: number, item: any) => sum + Number(item.amount), 0) +
    adjustments.filter((a: any) => a.type === 'Earning').reduce((sum: number, item: any) => sum + Number(item.amount), 0);

  const totalDeductions = deductions.reduce((sum: number, item: any) => sum + Number(item.amount), 0) +
    Number(payout.lopDeduction || 0) +
    adjustments.filter((a: any) => a.type === 'Deduction').reduce((sum: number, item: any) => sum + Number(item.amount), 0);

  // helper to count business days (excl Sat/Sun)
  const countBusinessDays = (m: number, y: number) => {
    const start = dayjs(`${y}-${m}-01`);
    const end = start.endOf('month');
    let count = 0;
    let curr = start;
    while (curr.isBefore(end) || curr.isSame(end)) {
      if (curr.day() !== 0 && curr.day() !== 6) count++;
      curr = curr.add(1, 'day');
    }
    return count;
  };

  const workingDays = countBusinessDays(payout.month, payout.year);
  const netPayCalculated = totalEarnings - totalDeductions;

  const monthName = dayjs(`${payout.year}-${payout.month}-01`).format('MMM YYYY').toUpperCase();

  // Work Summary Calculations
  const lopDays = Number(leaveSummary.totalLopDays || payout.lopDays || 0);
  const payableDays = workingDays - lopDays;

  // Additional Fields
  const joiningDate = employee.workDetail?.[0]?.workJoiningDate
    ? dayjs(employee.workDetail[0].workJoiningDate).format('DD MMM YYYY')
    : 'N/A';
  const roleName = employee.workDetail?.[0]?.position?.title || 'N/A';
  const deptName = employee.workDetail?.[0]?.position?.department?.name || 'N/A';

  // Format Address into 3 lines
  const addressLine1 = [
    company?.floorNo ? `${company.floorNo} Floor` : '',
    company?.plotNo ? `Plot ${company.plotNo}` : '',
    company?.buildingName,
  ].filter(Boolean).join(', ');
  
  const addressLine2 = [
    company?.street,
    company?.area,
  ].filter(Boolean).join(', ');
  
  const addressLine3 = company?.city ? `${company.city}${company.pincode ? ` - ${company.pincode}` : ''}` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    @page { margin: 5mm; size: A4; }
    
    :root {
      --brand-blue: #7b9ed9;
      --text-main: #1e293b;
      --text-label: #64748b;
      --border-color: #f1f5f9; /* Light line */
      --table-border: #cbd5e1;
    }

    body { 
      font-family: 'Inter', sans-serif; 
      background-color: white; 
      margin: 0; 
      padding: 0;
      color: var(--text-main);
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
    }

    .main-container { width: 100%; max-width: 850px; margin: 0 auto; padding: 20px; }
    
    .light-line { border-top: 1px solid var(--border-color); margin: 8px 0; }
    
    .label-mini { color: var(--text-label); font-size: 9px; font-weight: 700; text-transform: uppercase; margin-bottom: 1px; }
    .value-mini { color: var(--text-main); font-size: 10px; font-weight: 600; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .styled-table th { 
      background-color: var(--brand-blue); 
      color: white; 
      text-align: left; 
      padding: 6px 10px; 
      font-size: 10px; 
      font-weight: 700;
      text-transform: uppercase;
      border: 1px solid var(--brand-blue);
    }
    .styled-table td { 
      padding: 5px 10px; 
      font-size: 10px; 
      border: 1px solid #e2e8f0;
    }
    .styled-table tr.total-row td {
      font-weight: 800;
      background-color: #f8fafc;
    }

    .summary-box {
      border: 1.5px solid #7b9ed9;
      padding: 10px 15px;
      background-color: #f8fafc;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      border-radius: 3px;
    }

    .font-mono-safe { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body>
  <div class="main-container">
    
    <!-- Top Header Section: Payslip Month + Address (L) | Company Name + Logo (R) -->
    <div class="flex justify-between items-start mb-4">
      <div class="max-w-[450px]">
        <h1 class="text-xl font-normal text-slate-900 tracking-tight uppercase leading-none">
          PAYSLIP <span class="text-slate-500 ml-2 font-light">${monthName}</span>
        </h1>
        <div class="text-[9px] text-slate-400 mt-2 leading-tight font-medium uppercase tracking-tight">
          <div>${addressLine1.toUpperCase()}</div>
          <div>${addressLine2.toUpperCase()}</div>
          <div>${addressLine3.toUpperCase()}</div>
        </div>
      </div>
      <div class="text-right">
        <div class="flex items-center justify-end gap-3">
          <div class="text-lg font-black text-slate-800 uppercase leading-tight">${company?.name || 'COMPANY NAME'}</div>
          ${company?.logo ? `<img src="${company.logo}" alt="Company Logo" class="h-12 w-auto object-contain" />` : ''}
        </div>
      </div>
    </div>

    <!-- Employee Name (NORMAL - Slightly Reduced Font) -->
    <div class="mb-3">
      <h2 class="text-lg font-normal text-slate-900 uppercase tracking-tighter">${employee.first_name} ${employee.last_name}</h2>
      <div class="light-line"></div>
    </div>

    <!-- Details Section 1: ID, Department, Joining Date, Designation -->
    <div class="grid grid-cols-2 gap-y-2 mb-2">
      <div class="grid grid-cols-2">
        <div class="label-mini">Employee ID</div>
        <div class="value-mini">${employee.employee_code}</div>
      </div>
      <div class="grid grid-cols-2">
        <div class="label-mini">Department</div>
        <div class="value-mini">${deptName}</div>
      </div>
      <div class="grid grid-cols-2">
        <div class="label-mini">Joining Date</div>
        <div class="value-mini">${joiningDate}</div>
      </div>
      <div class="grid grid-cols-2">
        <div class="label-mini">Designation</div>
        <div class="value-mini">${roleName}</div>
      </div>
    </div>
    <div class="light-line"></div>

    <!-- Bank & Statutory Section: Bank Name, Acc Number, IFSC, PAN, UAN, PF -->
    <div class="grid grid-cols-4 gap-y-2 mb-2">
      <div>
        <div class="label-mini">Bank Name</div>
        <div class="value-mini">${bankDetail?.bankName || 'N/A'}</div>
      </div>
      <div>
        <div class="label-mini">Account Number</div>
        <div class="value-mini font-mono-safe">${decAccount}</div>
      </div>
      <div>
        <div class="label-mini">IFSC Code</div>
        <div class="value-mini font-mono-safe">${decIfsc}</div>
      </div>
      <div>
        <div class="label-mini">PAN</div>
        <div class="value-mini font-mono-safe uppercase">${decPan}</div>
      </div>
      <div>
        <div class="label-mini">UAN</div>
        <div class="value-mini font-mono-safe uppercase">${decUan}</div>
      </div>
      <div>
        <div class="label-mini">PF</div>
        <div class="value-mini font-mono-safe uppercase">${decPf}</div>
      </div>
    </div>
    <div class="light-line"></div>

    <!-- Work Summary Row: Actual Payable, Total Working, LOP, Days Payable -->
    <div class="grid grid-cols-4 gap-2 mb-4 mt-6 bg-slate-50 p-2 rounded-sm text-center">
      <div>
        <div class="label-mini">Actual Payable Days</div>
        <div class="text-xs font-black text-slate-800">${workingDays.toFixed(1)}</div>
      </div>
      <div>
        <div class="label-mini">Total Working Days</div>
        <div class="text-xs font-black text-slate-800">${workingDays.toFixed(1)}</div>
      </div>
      <div>
        <div class="label-mini">Loss of Pay Days</div>
        <div class="text-xs font-black text-red-500">${lopDays.toFixed(1)}</div>
      </div>
      <div>
        <div class="label-mini">Days Payable</div>
        <div class="text-xs font-black text-blue-600">${payableDays}</div>
      </div>
    </div>

    <!-- Financial Breakdown: Earnings & Deductions (ONE BY ONE) -->
    <div class="space-y-4">
      <!-- Earnings Table -->
      <div>
        <h3 class="text-[9px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Earnings</h3>
        <table class="styled-table">
          <thead>
            <tr>
              <th width="75%">Description</th>
              <th width="25%" class="text-right">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${earnings.map((item: any) => `
              <tr>
                <td class="font-medium">${item.component.componentName}</td>
                <td class="text-right font-bold">${formatCurrency(Number(item.amount))}</td>
              </tr>
            `).join('')}
            ${adjustments.filter((a: any) => a.type === 'Earning').map((item: any) => `
              <tr>
                <td class="italic text-slate-500">${item.label}</td>
                <td class="text-right font-bold">${formatCurrency(Number(item.amount))}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td class="text-right uppercase">Total Earnings</td>
              <td class="text-right font-black">${formatCurrency(totalEarnings)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Deductions Table -->
      <div>
        <h3 class="text-[9px] font-black text-slate-400 mb-1.5 uppercase tracking-widest">Deductions</h3>
        <table class="styled-table">
          <thead>
            <tr>
              <th width="75%">Description</th>
              <th width="25%" class="text-right">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${deductions.map((item: any) => `
              <tr>
                <td class="font-medium">${item.component.componentName}</td>
                <td class="text-right font-bold">${formatCurrency(Number(item.amount))}</td>
              </tr>
            `).join('')}
             ${Number(payout.lopDeduction) > 0 ? `
              <tr>
                <td class="font-medium">Loss of Pay</td>
                <td class="text-right font-bold">${formatCurrency(Number(payout.lopDeduction))}</td>
              </tr>
            ` : ''}
            ${adjustments.filter((a: any) => a.type === 'Deduction').map((item: any) => `
              <tr>
                <td class="italic text-slate-500">${item.label}</td>
                <td class="text-right font-bold">${formatCurrency(Number(item.amount))}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td class="text-right uppercase">Total Deductions</td>
              <td class="text-right font-black">${formatCurrency(totalDeductions)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Final Net Salary Summary -->
    <div class="summary-box">
      <div class="space-y-0.5">
        <div class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">NET SALARY PAYABLE</div>
        <div class="text-[10px] italic text-slate-500 max-w-[550px] leading-tight">
          ${numberToWords(netPayCalculated)}
        </div>
      </div>
      <div class="text-right">
        <div class="text-2xl font-black text-[#7b9ed9] tracking-tighter">
          ${formatCurrency(netPayCalculated)}
        </div>
      </div>
    </div>

    <div class="mt-4 text-[8px] font-bold italic text-slate-400 text-center uppercase tracking-tight">
      * All amounts displayed in this payslip are in Indian Rupees (INR).
    </div>

  </div>
</body>
</html>
  `;
};
