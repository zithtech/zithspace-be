

import { Prisma } from '@prisma/client';

/**
 * --- ENUMS ---
 */
export enum Currency {
  USD = 'USD',
  INR = 'INR',
  EUR = 'EUR',
  GBP = 'GBP',
  AUD = 'AUD',
  CAD = 'CAD',
  SGD = 'SGD'
}

export enum DateFormat {
  DD_MM_YYYY = 'DD_MM_YYYY',
  MM_DD_YYYY = 'MM_DD_YYYY',
  YYYY_MM_DD = 'YYYY_MM_DD'
}

/**
 * --- UTILITIES ---
 */
export const convertNumberToWords = (num: number, currency: string = 'INR'): string => {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const format = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? format(n % 100) : '');
    return '';
  };

  if (num === 0) return 'Zero';
  let n = Math.floor(num);
  let str = '';

  if (currency === 'INR') {
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const remaining = n;
    if (crore > 0) str += format(crore) + 'Crore ';
    if (lakh > 0) str += format(lakh) + 'Lakh ';
    if (thousand > 0) str += format(thousand) + 'Thousand ';
    if (remaining > 0) str += format(remaining);
  } else {
    const billion = Math.floor(n / 1000000000); n %= 1000000000;
    const million = Math.floor(n / 1000000); n %= 1000000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const remaining = n;
    if (billion > 0) str += format(billion) + 'Billion ';
    if (million > 0) str += format(million) + 'Million ';
    if (thousand > 0) str += format(thousand) + 'Thousand ';
    if (remaining > 0) str += format(remaining);
  }

  const currencyNames: Record<string, string> = {
    USD: 'US Dollars', INR: 'Indian Rupees', EUR: 'Euros',
    GBP: 'British Pounds', AUD: 'Australian Dollars',
    CAD: 'Canadian Dollars', SGD: 'Singapore Dollars'
  };

  return `${str.trim()} ${currencyNames[currency] || 'Units'} Only`;
};




export const generateInvoiceHtml = (invoice: any, profile: any) => {
  const general = profile?.general;
  const payment = profile?.payment;
  const items = invoice.items || [];
  const primaryColor = general?.primaryColor || "#1890ff";
  const customer = invoice.customerSnapshot || invoice.customer;
  const hasTax = Number(invoice.taxTotal) > 0;

  const currencySymbols: Record<string, string> = {
    USD: '$', INR: '₹', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', SGD: 'S$'
  };
  const symbol = currencySymbols[invoice.currency] || '₹';
  const amountWords = convertNumberToWords(Number(invoice.total), invoice.currency);

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    switch (general?.dateFormat) {
      case 'DD_MM_YYYY': return `${day}/${month}/${year}`;
      case 'MM_DD_YYYY': return `${month}/${day}/${year}`;
      case 'YYYY_MM_DD': return `${year}-${month}-${day}`;
      default: return `${day}/${month}/${year}`;
    }
  };
  const totalQty = items.reduce((sum: number, i: any) => sum + Number(i.qty), 0);

  const fullAddress = [
    general?.address?.plot_no, general?.address?.floor_no, general?.address?.building_name, 
    general?.address?.area, general?.address?.street, general?.address?.city, 
    general?.address?.pincode, general?.address?.country
  ].filter(Boolean).join(', ');

  return `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @page { margin: 0; size: A4; }
    body { 
      font-family: 'Inter', sans-serif; 
      background-color: white; 
      margin: 0; 
      padding: 0;
      -webkit-print-color-adjust: exact; 
    }
    
    table.report-container { 
      width: 100%; 
      border-collapse: collapse; 
      table-layout: fixed;
    }
    
    .footer-space { 
      height: 70px; 
      page-break-inside: avoid;
    }
    
    .footer-fixed {
      position: fixed;
      bottom: 10mm;
      left: 10mm;
      right: 10mm;
      height: 50px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: white;
      border-top: 1px solid #f3f4f6;
      padding-top: 8px;
      page-break-inside: avoid;
    }

    .page-border {
      position: fixed;
      top: 10mm;
      left: 10mm;
      right: 10mm;
      bottom: 10mm;
      border: 1px solid #e5e7eb;
      pointer-events: none;
      z-index: -1;
    }

    .z-badge { 
      display: flex; 
      align-items: center; 
      justify-content: center; 
    }

    .item-table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 5px; 
    }
    
    .item-table th { 
      background: #f8f9fa; 
      border: 1px solid #e9ecef; 
      padding: 6px; 
      font-size: 10px; 
      text-transform: uppercase; 
      color: #666; 
    }
    
    .item-table td { 
      border: 1px solid #e9ecef; 
      padding: 6px; 
      font-size: 10px; 
      color: #444; 
      vertical-align: middle; 
    }
    
    .summary-row td { 
      border: 1px solid #e9ecef; 
      padding: 4px 8px; 
      font-size: 10px; 
    }
    
    .avoid-break { 
      page-break-inside: avoid; 
    }
    
    .card-note {
      background-color: #f9fafb;
      border: 1px solid #f3f4f6;
      border-radius: 8px;
      padding: 10px;
    }
    
    /* Ensure content doesn't overflow into footer */
    .main-content {
      margin-bottom: 60px;
    }
    
    /* Print-specific adjustments */
    @media print {
      .footer-fixed {
        position: fixed;
        bottom: 10mm;
      }
      
      body {
        margin: 0;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page-border"></div>
  <table class="report-container">
    <thead><tr><td><div class="h-14"></div></td></tr></thead>
    <tbody>
      <tr>
        <td class="px-14">
          <div class="main-content">
            <!-- Your main invoice content remains the same -->
            <div class="flex justify-between items-start mb-6">
              <div class="flex gap-4">
                ${general?.companyLogo ? `<img src="${general.companyLogo}" class="h-12 object-contain" />` : `<div class="w-10 h-10 bg-black flex items-center justify-center rounded-lg text-white font-bold text-lg">Z!</div>`}
                <div>
                  <h1 class="text-lg font-bold" style="color: ${primaryColor}">${general?.companyName || 'Zithspace'}</h1>
                  <p class="text-[9px] text-gray-400 w-64 leading-tight">${fullAddress}</p>
                </div>
              </div>
              <div class="text-right">
                <h2 class="text-2xl font-bold tracking-tighter text-gray-800 uppercase m-0">INVOICE</h2>
                <p class="text-[10px] font-semibold text-gray-400">Invoice # ${invoice.invoiceNumber}</p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-6 mb-6 avoid-break">
              <div class="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                <span class="text-[8px] font-bold text-gray-400 uppercase block mb-1">Bill To</span>
                <p class="font-bold text-xs text-gray-800">${customer?.companyName || 'N/A'}</p>
                <p class="text-[10px] text-gray-500 mt-0.5">${customer?.email || ''}</p>
                <p class="text-[10px] text-gray-500 mt-0.5">${customer?.address || ''}</p>
                <p class="text-[10px] text-gray-500 mt-0.5">${customer?.city || ''}, ${customer?.country || ''}</p>
              </div>
              <div class="bg-gray-50/80 p-3 rounded-xl border border-gray-100 text-right">
                <span class="text-[8px] font-bold text-gray-400 uppercase block mb-1">Invoice Info</span>
                <div class="flex justify-between text-[10px] mb-1 pl-12"><span>Invoice Date:</span><b>${formatDate(invoice.invoiceDate)}</b></div>
                <div class="flex justify-between text-[10px] mb-1 pl-12"><span>Due Date:</span><b>${formatDate(invoice.dueDate)}</b></div>
                <div class="flex justify-between text-[10px] pl-12"><span>Type:</span><b style="color: ${primaryColor}">${invoice.invoiceType}</b></div>
              </div>
            </div>

            <table class="item-table">
              <thead>
                <tr>
                  <th width="40">S.NO</th>
                  <th class="text-left">Item</th>
                  <th width="50" class="text-center">Qty</th>
                  <th width="100" class="text-right">Price</th>
                  ${hasTax ? `<th width="80" class="text-right">Tax</th>` : ''}
                  <th width="100" class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any, idx: number) => `
                  <tr>
                    <td class="text-center text-gray-400">${idx + 1}</td>
                    <td>
                      <p class="font-bold m-0 text-[11px]">${item.item}</p>
                      ${item.description ? `<p class="text-[9px] text-gray-400 m-0 leading-tight">${item.description}</p>` : ''}
                    </td>
                    <td class="text-center">${item.qty}</td>
                    <td class="text-right">${symbol} ${Number(item.price).toFixed(2)}</td>
                    ${hasTax ? `<td class="text-right">${symbol} ${Number(item.tax || 0).toFixed(2)}</td>` : ''}
                    <td class="text-right font-bold">${symbol} ${Number((item.qty * item.price) + Number(item.tax || 0)).toFixed(2)}</td>
                  </tr>
                `).join('')}
                
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none pt-2 font-medium text-gray-500">Subtotal</td>
                  <td colspan="${hasTax ? 3 : 2}" class="border-t border-gray-100"></td>
                  <td class="text-right border-t border-gray-100 font-bold pt-2">${symbol} ${Number(invoice.subtotal).toFixed(2)}</td>
                </tr>
                ${hasTax ? `
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none font-medium text-gray-500">Tax</td>
                  <td colspan="3"></td>
                  <td class="text-right font-bold">${symbol} ${Number(invoice.taxTotal).toFixed(2)}</td>
                </tr>` : ''}
                ${Number(invoice.discount) > 0 ? `
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none font-medium text-gray-500">Discount</td>
                  <td colspan="${hasTax ? 3 : 2}"></td>
                  <td class="text-right font-bold text-red-500">-${symbol} ${Number(invoice.discount).toFixed(2)}</td>
                </tr>` : ''}
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none font-bold text-gray-800 uppercase">Total</td>
                  <td class="text-center font-bold text-base">${totalQty}</td>
                  <td colspan="${hasTax ? 2 : 1}"></td>
                  <td class="text-right font-bold text-lg" style="color: ${primaryColor}">${symbol} ${Number(invoice.total).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div class="p-2 border rounded-lg bg-gray-50/50 mb-4 mt-4 avoid-break">
              <p class="text-[9px]"><strong class="text-gray-900 uppercase text-[8px]">Amount in Words:</strong> ${amountWords}</p>
            </div>

            <div class="grid grid-cols-2 gap-8 avoid-break mt-4">
              <div class="bg-gray-50/50 p-3 rounded-xl border border-gray-100 flex justify-between items-center">
                <div class="text-[9px] space-y-1">
                  <p class="font-bold text-gray-400 uppercase text-[8px] mb-1">Bank Details</p>
                  <p><strong>Bank:</strong> ${payment?.bankName || 'N/A'}</p>
                  <p><strong>A/C:</strong> ${payment?.accountNumber || 'N/A'}</p>
                  <p><strong>IFSC:</strong> ${payment?.ifscCode || 'N/A'}</p>
                  <p><strong>Branch:</strong> ${payment?.branchName || 'N/A'}</p>
                </div>
                ${payment?.qrCode ? `<div class="text-center"><img src="${payment.qrCode}" class="w-14 h-14 border rounded bg-white p-1" /><p class="text-[6px] text-gray-400 mt-1 uppercase">Scan to Pay</p></div>` : ''}
              </div>
              <div class="bg-gray-50/50 p-3 rounded-xl border border-gray-100 text-center flex flex-col justify-between min-h-[100px]">
                <p class="text-[8px] font-bold text-gray-400 uppercase">Authorized Signature</p>
                ${general?.signature ? `<img src="${general.signature}" class="h-10 mx-auto mix-blend-multiply" />` : `<div class="h-10"></div>`}
                <div>
                  <div class="w-4/5 border-b border-gray-200 mx-auto"></div>
                  <p class="text-[7px] text-gray-400 mt-1 uppercase italic font-medium">Digitally Signed</p>
                </div>
              </div>
            </div>

            <div class="mt-6 grid grid-cols-2 gap-4 avoid-break">
              ${invoice.notes ? `
              <div class="card-note">
                <p class="font-bold text-gray-400 uppercase text-[8px] mb-1">Notes</p>
                <p class="text-[9px] text-gray-600 leading-normal whitespace-pre-line">${invoice.notes}</p>
              </div>` : ''}
              ${invoice.terms ? `
              <div class="card-note">
                <p class="font-bold text-gray-400 uppercase text-[8px] mb-1">Terms & Conditions</p>
                <p class="text-[9px] text-gray-600 leading-normal whitespace-pre-line">${invoice.terms}</p>
              </div>` : ''}
            </div>
          </div>
        </td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td>
          <div class="footer-space"></div>
        </td>
      </tr>
    </tfoot>
  </table>

  <div class="footer-fixed">
    <div class="flex items-center gap-2 mb-0.5">
      <span class="text-[#374151] text-[11px]">Crafted with ease using</span>
      <div class="flex items-center gap-1.5">
        <div class="z-badge">
          ${general?.companyLogo ? `<img src="${general.companyLogo}" class="h-6 w-auto" />` : `<img src="https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/assets/zithspace-logo.png" class="h-6 w-auto" />`}
        </div>
        <div class="flex flex-col leading-none">
          <span class="font-bold text-[12px] text-[#2563eb]">Zithspace</span>
          <span class="font-bold text-[10px] text-black tracking-tight">Invoice</span>
        </div>
      </div>
    </div>
    <p class="text-[#6b7280] text-[9px] mt-0.5 mb-2">
      Visit <span class="text-[#2563eb] font-semibold">zithspace.com/invoice</span> to create truly professional invoices
    </p>
  </div>
</body>
</html>
  `;
};


