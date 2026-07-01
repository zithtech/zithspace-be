// src/modules/payroll/services/payslipHtml.ts
//
// Payslip HTML builder with THREE selectable templates:
//   modern  — summary cards + net-pay highlight + YTD columns (Zoho-style)
//   classic — stacked earnings/deductions/reimbursements sections + YTD
//   minimal — compact single design with an accent header bar
//
// The company picks the style in Payslip & Bank Settings (template_style); all
// three render from the same PayslipData so the data is identical, only the
// layout differs. Self-contained inline CSS → rendered to PDF by Puppeteer.

export type PayslipTemplateStyle = 'modern' | 'classic' | 'minimal';

export interface PayslipLine {
  name: string;
  amount: number;
  ytd?: number;
}

export interface PayslipData {
  templateStyle: PayslipTemplateStyle;
  companyName: string;
  companyAddress?: string | null;
  periodLabel: string;
  accentColor: string;
  footerNote: string | null;
  netPayInWords: boolean;
  showLogo: boolean;
  logoUrl?: string | null;
  showEmployeeCode: boolean;
  showEmail: boolean;
  showDesignation: boolean;
  showDepartment: boolean;
  showGrade: boolean;
  showLocation: boolean;
  showDateOfJoining: boolean;
  showBankName: boolean;
  showPan: boolean;
  showUan: boolean;
  showPfNumber: boolean;
  showEsiNumber: boolean;
  showBankAccount: boolean;
  showYtd: boolean;
  showAttendanceSummary: boolean;
  employee: {
    name: string;
    email: string | null;
    designation: string | null;
    code: string | null;
    department: string | null;
    grade: string | null;
    location: string | null;
    dateOfJoining: string | null; // YYYY-MM-DD
  };
  profile: {
    pan: string | null;
    uan: string | null;
    pfNumber: string | null;
    esiNumber: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
  } | null;
  payDate: string | null; // YYYY-MM-DD
  totalDays: number;
  paidDays: number;
  lopDays: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  extras: PayslipLine[];
  gross: number;
  totalDeductions: number;
  net: number;
  grossYtd?: number;
  deductionsYtd?: number;
  extrasYtd?: number;
}

// ── formatting helpers ──────────────────────────────────────────────────────────
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number) => `₹${inr.format(n || 0)}`;
const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (iso: string | null) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const three = (n: number) => {
  const h = Math.floor(n / 100), r = n % 100;
  return `${h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : ''}${r ? two(r) : ''}`;
};

/** Number to words (Indian system) — returns just the words, e.g. "Fifty Six Thousand". */
export function numWords(amount: number): string {
  const n = Math.floor(amount);
  if (n === 0) return 'Zero';
  const cr = Math.floor(n / 10000000), lk = Math.floor((n % 10000000) / 100000), th = Math.floor((n % 100000) / 1000), hu = n % 1000;
  const p: string[] = [];
  if (cr) p.push(`${two(cr)} Crore`);
  if (lk) p.push(`${two(lk)} Lakh`);
  if (th) p.push(`${two(th)} Thousand`);
  if (hu) p.push(three(hu));
  return p.join(' ').trim();
}
/** Back-compat full form: "… Rupees only". */
export function numberToWords(amount: number): string {
  return `${numWords(amount)} Rupees only`;
}

function logoBox(d: PayslipData, size: number): string {
  if (!d.showLogo) return '';
  const a = accent(d);
  if (d.logoUrl) {
    return `<img src="${esc(d.logoUrl)}" alt="${esc(d.companyName || 'Company')}" style="height:${size}px;max-width:${size * 3.4}px;object-fit:contain;display:block;flex-shrink:0" />`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:10px;background:${a}1a;color:${a};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.5)}px;font-weight:800;flex-shrink:0">${esc((d.companyName || 'C').slice(0, 1).toUpperCase())}</div>`;
}
const accent = (d: PayslipData) => (/^#[0-9a-fA-F]{6}$/.test(d.accentColor) ? d.accentColor : '#3B82F6');

// Mask a bank account number, keeping the last 4 digits.
const maskAcct = (acct: string) => {
  const s = String(acct);
  return s.length <= 4 ? s : `${'X'.repeat(s.length - 4)}${s.slice(-4)}`;
};

// Employee identity rows for the summary block, filtered by the template's
// field toggles. Name is always included; the rest appear only when enabled AND
// present in the data. Returned as [label, value] pairs so each template renders
// them in its own style.
function identityRows(d: PayslipData): Array<[string, string]> {
  const e = d.employee;
  const rows: Array<[string, string]> = [['Employee Name', e.name]];
  if (d.showEmployeeCode && e.code) rows.push(['Employee ID', e.code]);
  if (d.showDesignation && e.designation) rows.push(['Designation', e.designation]);
  if (d.showDepartment && e.department) rows.push(['Department', e.department]);
  if (d.showGrade && e.grade) rows.push(['Grade', e.grade]);
  if (d.showLocation && e.location) rows.push(['Location', e.location]);
  if (d.showEmail && e.email) rows.push(['Email', e.email]);
  if (d.showDateOfJoining && e.dateOfJoining) rows.push(['Date of Joining', fmtDate(e.dateOfJoining)]);
  return rows;
}

// Statutory / bank identifiers, filtered by toggles + presence.
function statutoryItems(d: PayslipData): Array<[string, string]> {
  const p = d.profile;
  const out: Array<[string, string]> = [];
  if (!p) return out;
  if (d.showPan && p.pan) out.push(['PAN', p.pan]);
  if (d.showUan && p.uan) out.push(['UAN', p.uan]);
  if (d.showPfNumber && p.pfNumber) out.push(['PF A/C Number', p.pfNumber]);
  if (d.showEsiNumber && p.esiNumber) out.push(['ESI Number', p.esiNumber]);
  if (d.showBankName && p.bankName) out.push(['Bank', p.bankName]);
  if (d.showBankAccount && p.bankAccountNumber) out.push(['A/C Number', maskAcct(p.bankAccountNumber)]);
  return out;
}

// ── dispatcher ──────────────────────────────────────────────────────────────────
export function buildPayslipHtml(d: PayslipData): string {
  switch (d.templateStyle) {
    case 'classic': return renderClassic(d);
    case 'minimal': return renderMinimal(d);
    case 'modern':
    default: return renderModern(d);
  }
}

// ══ TEMPLATE 1 — MODERN ═════════════════════════════════════════════════════════
function renderModern(d: PayslipData): string {
  const a = accent(d);
  const ytdCol = d.showYtd;
  const idRow = (label: string, value: string) =>
    `<tr><td style="padding:5px 0;color:#64748b;width:150px">${esc(label)}</td><td style="padding:5px 0;color:#334155">: ${esc(value)}</td></tr>`;
  const amtRows = (list: PayslipLine[]) =>
    (list.length ? list : [{ name: '—', amount: 0 } as PayslipLine]).map((l) =>
      `<tr><td style="padding:9px 0;color:#334155;border-bottom:1px solid #f1f5f9">${esc(l.name)}</td>
       <td style="padding:9px 0;text-align:right;font-weight:700;border-bottom:1px solid #f1f5f9">${money(l.amount)}</td>
       ${ytdCol ? `<td style="padding:9px 0;text-align:right;color:#94a3b8;border-bottom:1px solid #f1f5f9">${money(l.ytd ?? l.amount)}</td>` : ''}</tr>`).join('');

  const stat = (label: string, value: string) => `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:#64748b">${esc(label)}</span><span style="font-weight:600">: ${esc(value)}</span></div>`;
  const statutory = statutoryItems(d);

  return page(`
  <div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:16px">
    <div style="display:flex;align-items:center;gap:12px">${logoBox(d, 44)}
      <div><div style="font-size:20px;font-weight:800;color:#1e293b">${esc(d.companyName)}</div>
      ${d.companyAddress ? `<div style="font-size:12px;color:#64748b">${esc(d.companyAddress)}</div>` : ''}</div>
    </div>
    <div style="text-align:right"><div style="font-size:12.5px;color:#64748b">Payslip For the Month</div><div style="font-size:17px;font-weight:800;color:#1e293b">${esc(d.periodLabel)}</div></div>
  </div>

  <div style="display:flex;gap:20px;margin-top:20px">
    <div style="flex:1">
      <div style="font-size:11px;font-weight:800;letter-spacing:.06em;color:#334155;margin-bottom:10px">EMPLOYEE SUMMARY</div>
      <table style="width:100%;font-size:12.5px;border-collapse:collapse">
        ${identityRows(d).map(([l, v]) => idRow(l, v)).join('')}
        ${idRow('Pay Period', d.periodLabel)}
        ${d.payDate ? idRow('Pay Date', fmtDate(d.payDate)) : ''}
      </table>
    </div>
    <div style="width:320px;border:1px solid ${a}55;border-radius:10px;overflow:hidden">
      <div style="background:${a}12;border-left:4px solid ${a};padding:16px 18px">
        <div style="font-size:26px;font-weight:800;color:#1e293b">${money(d.net)}</div>
        <div style="font-size:12.5px;color:#475569;margin-top:2px">Employee Net Pay</div>
      </div>
      <div style="padding:12px 18px;font-size:12.5px;border-top:1px dashed #e2e8f0">
        ${stat('Paid Days', String(d.paidDays))}
        ${stat('LOP Days', String(d.lopDays))}
      </div>
    </div>
  </div>

  ${statutory.length ? `<div style="border-top:1px dashed #cbd5e1;margin-top:18px;padding-top:14px;font-size:12.5px;display:flex;flex-wrap:wrap;gap:10px 48px">${statutory.map(([l, v]) => `<span><span style="color:#64748b">${esc(l)}</span> : <strong>${esc(v)}</strong></span>`).join('')}</div>` : ''}

  <div style="border:1px solid #e2e8f0;border-radius:10px;margin-top:18px;overflow:hidden">
    <div style="display:flex">
      <div style="flex:1;padding:14px 18px;border-right:1px solid #e2e8f0">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <tr><td style="padding-bottom:8px;font-size:11px;font-weight:800;letter-spacing:.05em;color:#334155">EARNINGS</td>
              <td style="padding-bottom:8px;text-align:right;font-size:11px;font-weight:800;color:#94a3b8">AMOUNT</td>
              ${ytdCol ? `<td style="padding-bottom:8px;text-align:right;font-size:11px;font-weight:800;color:#94a3b8">YTD</td>` : ''}</tr>
          ${amtRows(d.earnings)}
        </table>
      </div>
      <div style="flex:1;padding:14px 18px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <tr><td style="padding-bottom:8px;font-size:11px;font-weight:800;letter-spacing:.05em;color:#334155">DEDUCTIONS</td>
              <td style="padding-bottom:8px;text-align:right;font-size:11px;font-weight:800;color:#94a3b8">AMOUNT</td>
              ${ytdCol ? `<td style="padding-bottom:8px;text-align:right;font-size:11px;font-weight:800;color:#94a3b8">YTD</td>` : ''}</tr>
          ${amtRows(d.deductions)}
        </table>
      </div>
    </div>
    <div style="display:flex;background:#f8fafc;border-top:1px solid #e2e8f0">
      <div style="flex:1;padding:12px 18px;border-right:1px solid #e2e8f0;display:flex;justify-content:space-between;font-weight:800;font-size:12.5px"><span>Gross Earnings</span><span>${money(d.gross)}</span></div>
      <div style="flex:1;padding:12px 18px;display:flex;justify-content:space-between;font-weight:800;font-size:12.5px"><span>Total Deductions</span><span>${money(d.totalDeductions)}</span></div>
    </div>
  </div>

  <div style="margin-top:20px;background:${a}10;border:1px solid ${a}44;border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-weight:800;font-size:13px;color:#1e293b">TOTAL NET PAYABLE</div><div style="font-size:11.5px;color:#64748b">Gross Earnings - Total Deductions</div></div>
    <div style="font-size:22px;font-weight:800;color:${a}">${money(d.net)}</div>
  </div>
  ${d.netPayInWords ? `<div style="text-align:right;margin-top:12px;font-size:12.5px;color:#475569">Amount In Words : <strong>Indian Rupee ${esc(numWords(d.net))} Only</strong></div>` : ''}
  `, d);
}

// ══ TEMPLATE 2 — CLASSIC ════════════════════════════════════════════════════════
function renderClassic(d: PayslipData): string {
  const a = accent(d);
  const ytd = d.showYtd;
  const section = (title: string, amtLabel: string, list: PayslipLine[], totalLabel: string, total: number, totalYtd?: number) => `
    <div style="margin-top:16px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <tr style="border-bottom:2px solid ${a}"><td style="padding:6px 0;font-size:11px;font-weight:800;letter-spacing:.05em;color:${a}">${esc(title)}</td>
          <td style="padding:6px 0;text-align:right;font-size:11px;font-weight:800;color:${a}">${esc(amtLabel)}</td>
          ${ytd ? `<td style="padding:6px 0;text-align:right;font-size:11px;font-weight:800;color:${a}">YTD</td>` : ''}</tr>
        ${(list.length ? list : [{ name: '—', amount: 0 } as PayslipLine]).map((l) => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9">${esc(l.name)}</td>
          <td style="padding:8px 0;text-align:right;border-bottom:1px solid #f1f5f9">${money(l.amount)}</td>
          ${ytd ? `<td style="padding:8px 0;text-align:right;color:#94a3b8;border-bottom:1px solid #f1f5f9">${money(l.ytd ?? l.amount)}</td>` : ''}</tr>`).join('')}
        <tr><td style="padding:9px 0;font-weight:800">${esc(totalLabel)}</td>
          <td style="padding:9px 0;text-align:right;font-weight:800">${money(total)}</td>
          ${ytd ? `<td style="padding:9px 0;text-align:right;font-weight:800;color:#64748b">${money(totalYtd ?? total)}</td>` : ''}</tr>
      </table>
    </div>`;

  const row = (label: string, value: string) => `<tr><td style="padding:3px 0;color:#64748b;width:130px">${esc(label)}</td><td style="padding:3px 0">: ${esc(value)}</td></tr>`;

  return page(`
  <div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid ${a}44;padding-bottom:14px">
    <div><div style="font-size:16px;font-weight:800;color:#1e293b">${esc(d.companyName)}</div>
      ${d.companyAddress ? `<div style="font-size:11.5px;color:#64748b;margin-top:2px">${esc(d.companyAddress)}</div>` : ''}</div>
    ${logoBox(d, 40)}
  </div>
  <div style="font-size:14px;font-weight:800;color:#1e293b;margin-top:16px">Payslip for the month of ${esc(d.periodLabel)}</div>

  <div style="display:flex;gap:20px;margin-top:16px;align-items:center">
    <div style="flex:1">
      <div style="font-size:11px;font-weight:800;letter-spacing:.05em;color:${a};margin-bottom:8px">EMPLOYEE PAY SUMMARY</div>
      <table style="width:100%;font-size:12.5px;border-collapse:collapse">
        ${identityRows(d).map(([l, v]) => row(l, v)).join('')}
        ${row('Pay Period', d.periodLabel)}
        ${d.payDate ? row('Pay Date', fmtDate(d.payDate)) : ''}
      </table>
    </div>
    <div style="width:230px;text-align:center;border-left:1px solid #e2e8f0;padding-left:18px">
      <div style="font-size:12px;font-weight:700;color:#475569">Employee Net Pay</div>
      <div style="font-size:26px;font-weight:800;color:#1e293b;margin:4px 0">${money(d.net)}</div>
      <div style="font-size:11.5px;color:#64748b">Paid Days : ${d.paidDays} &nbsp;|&nbsp; LOP Days : ${d.lopDays}</div>
    </div>
  </div>
  ${statutoryItems(d).length ? `<div style="border-top:1px dashed ${a}44;margin-top:14px;padding-top:12px;font-size:12px;display:flex;flex-wrap:wrap;gap:8px 40px">${statutoryItems(d).map(([l, v]) => `<span><span style="color:#64748b">${esc(l)}</span> : <strong>${esc(v)}</strong></span>`).join('')}</div>` : ''}

  ${section('EARNINGS', 'AMOUNT', d.earnings, 'Gross Earnings', d.gross, d.grossYtd)}
  ${section('DEDUCTIONS', '(-)AMOUNT', d.deductions, 'Total Deductions', d.totalDeductions, d.deductionsYtd)}
  ${d.extras.length ? section('REIMBURSEMENTS', 'AMOUNT', d.extras, 'Total Reimbursement', d.extras.reduce((s, l) => s + l.amount, 0), d.extrasYtd) : ''}

  <div style="margin-top:18px;border-top:2px solid ${a};padding-top:12px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-weight:800;font-size:13px">NET PAY <span style="font-weight:500;color:#64748b;font-size:11.5px">(Gross Earnings - Total Deductions${d.extras.length ? ' + Reimbursements' : ''})</span></div>
    <div style="font-size:16px;font-weight:800;color:${a}">${money(d.net + d.extras.reduce((s, l) => s + l.amount, 0))}</div>
  </div>
  <div style="text-align:center;margin-top:18px;font-size:13px;font-weight:700;color:#1e293b">Total Net Payable ${money(d.net + d.extras.reduce((s, l) => s + l.amount, 0))}
    ${d.netPayInWords ? `<span style="font-weight:500;color:#64748b">(Rupees ${esc(numWords(d.net + d.extras.reduce((s, l) => s + l.amount, 0)))} only)</span>` : ''}</div>
  `, d, '- This is a system generated payslip -');
}

// ══ TEMPLATE 3 — MINIMAL ════════════════════════════════════════════════════════
function renderMinimal(d: PayslipData): string {
  const a = accent(d);
  const list = (title: string, items: PayslipLine[], total: number, sign: string) => `
    <div style="flex:1">
      <div style="font-size:10.5px;font-weight:800;letter-spacing:.06em;color:${a};border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:4px">${esc(title)}</div>
      ${(items.length ? items : [{ name: '—', amount: 0 } as PayslipLine]).map((l) => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12.5px;border-bottom:1px solid #f8fafc"><span style="color:#334155">${esc(l.name)}</span><span style="font-weight:600">${sign}${money(l.amount)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:12.5px;font-weight:800"><span>${title === 'EARNINGS' ? 'Gross' : 'Total'}</span><span>${sign}${money(total)}</span></div>
    </div>`;

  const e = d.employee;
  const meta: string[] = [];
  if (d.showEmployeeCode && e.code) meta.push(`ID ${esc(e.code)}`);
  if (d.showDesignation && e.designation) meta.push(esc(e.designation));
  if (d.showDepartment && e.department) meta.push(esc(e.department));
  if (d.showGrade && e.grade) meta.push(esc(e.grade));
  if (d.showLocation && e.location) meta.push(esc(e.location));
  if (d.showEmail && e.email) meta.push(esc(e.email));
  if (d.showDateOfJoining && e.dateOfJoining) meta.push(`DOJ ${fmtDate(e.dateOfJoining)}`);
  if (d.payDate) meta.push(`Pay date ${fmtDate(d.payDate)}`);
  const statutory = statutoryItems(d);

  return page(`
  <div style="background:${a};color:#fff;border-radius:12px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center">
    <div style="display:flex;align-items:center;gap:12px">
      ${d.showLogo ? (d.logoUrl
        ? `<div style="height:40px;background:#ffffff;border-radius:9px;padding:4px 6px;display:flex;align-items:center"><img src="${esc(d.logoUrl)}" alt="" style="height:32px;max-width:110px;object-fit:contain;display:block" /></div>`
        : `<div style="width:40px;height:40px;border-radius:9px;background:#ffffff30;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800">${esc((d.companyName || 'C').slice(0, 1).toUpperCase())}</div>`) : ''}
      <div><div style="font-size:18px;font-weight:800">${esc(d.companyName)}</div>${d.companyAddress ? `<div style="font-size:11px;opacity:.85">${esc(d.companyAddress)}</div>` : ''}</div>
    </div>
    <div style="text-align:right"><div style="font-size:11px;opacity:.85;text-transform:uppercase;letter-spacing:.06em">Payslip</div><div style="font-size:15px;font-weight:800">${esc(d.periodLabel)}</div></div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:14px 18px;border:1px solid #e2e8f0;border-radius:10px">
    <div><div style="font-size:16px;font-weight:800;color:#1e293b">${esc(d.employee.name)}</div>
      <div style="font-size:11.5px;color:#94a3b8;margin-top:2px">${meta.join('  ·  ')}</div></div>
    <div style="text-align:right"><div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700">Net Pay</div>
      <div style="font-size:24px;font-weight:800;color:${a}">${money(d.net)}</div>
      <div style="font-size:11px;color:#94a3b8">Paid ${d.paidDays} · LOP ${d.lopDays}</div></div>
  </div>
  ${statutory.length ? `<div style="margin-top:10px;font-size:11.5px;color:#475569;display:flex;flex-wrap:wrap;gap:6px 24px">${statutory.map(([l, v]) => `<span><span style="color:#94a3b8">${esc(l)}</span> ${esc(v)}</span>`).join('')}</div>` : ''}

  <div style="display:flex;gap:26px;margin-top:18px">
    ${list('EARNINGS', d.earnings, d.gross, '')}
    ${list('DEDUCTIONS', d.deductions, d.totalDeductions, '−')}
  </div>

  <div style="margin-top:20px;background:${a}0f;border:1px solid ${a}33;border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:800;font-size:13px;color:#1e293b">NET PAYABLE</span>
    <span style="font-size:20px;font-weight:800;color:${a}">${money(d.net)}</span>
  </div>
  ${d.netPayInWords ? `<div style="text-align:right;margin-top:10px;font-size:12px;color:#64748b;font-style:italic">${esc(numWords(d.net))} Rupees only</div>` : ''}
  `, d);
}

// ── page shell (shared) ─────────────────────────────────────────────────────────
function page(inner: string, d: PayslipData, footerOverride?: string): string {
  const footer = footerOverride || d.footerNote || 'This document has been automatically generated and does not require a signature.';
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; color: #1e293b; font-size: 12px; }
  .sheet { padding: 34px 38px; }
  table { border-collapse: collapse; }
</style></head>
<body><div class="sheet">
  ${inner}
  <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10.5px;color:#94a3b8;text-align:center">${footerOverride ? '' : '-- '}${esc(footer)}${footerOverride ? '' : ' --'}</div>
</div></body></html>`;
}
