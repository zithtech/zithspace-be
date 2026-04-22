


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
  const items = invoice.lineItems || invoice.items || [];
  const primaryColor = general?.primaryColor || "#1890ff";
  const customer = invoice.customerSnapshot || invoice.customer;
  const hasTax = Number(invoice.taxTotal) > 0;

  const currencySymbols: Record<string, string> = {
    USD: '$', INR: '₹', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', SGD: 'S$'
  };
  const symbol = currencySymbols[invoice.currency] || '₹';
  const amountWords = convertNumberToWords(Number(invoice.grandTotal || invoice.total), invoice.currency);

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
  const totalQty = items.reduce((sum: number, i: any) => sum + Number(i.quantity || i.qty || 0), 0);

  const fullAddress = [
    general?.address?.plot_no, general?.address?.floor_no, general?.address?.building_name, 
    general?.address?.area, general?.address?.street, general?.address?.city, 
    general?.address?.pincode, general?.address?.country
  ].filter(Boolean).join(', ');

  let metadata = invoice.metadata || (invoice as any).metadata || {};
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (e) {
      metadata = {};
    }
  }
  const columnOrder = metadata.columnOrder || ["itemName", "projectId", "quantity", "rate", "taxRate"];
  const columnLabels = metadata.columnLabels || {};
  
  // Detect extra field keys from line items
  const extraFieldKeys = new Set<string>();
  const systemKeys = new Set(['quantity', 'qty', 'rate', 'price', 'taxRate', 'tax', 'itemName', 'description', 'projectId', 'projectName']);
  items.forEach((item: any) => {
    if (item.extraFields && typeof item.extraFields === 'object') {
      Object.keys(item.extraFields).forEach(key => {
        if (!systemKeys.has(key)) extraFieldKeys.add(key);
      });
    }
  });

  const getColTitle = (key: string) => {
    if (columnLabels[key]) return columnLabels[key];
    if (key === 'itemName') return 'Item';
    if (key === 'quantity' || key === 'qty') return 'Qty';
    if (key === 'rate' || key === 'price') return 'Price';
    if (key === 'taxRate' || key === 'tax') return 'Tax %';
    if (key === 'projectId') return 'Project';
    return key.replace(/_/g, ' ');
  };

  const finalColumns = columnOrder.map((key: string) => {
    let normalized = key;
    if (key === 'qty') normalized = 'quantity';
    if (key === 'price') normalized = 'rate';
    if (key === 'tax') normalized = 'taxRate';
    return { key: normalized, title: getColTitle(key) };
  }).filter((c: any) => {
     if (c.key === 'taxRate' && !hasTax) return false;
     // Hide description column as it's shown in the Item Name cell
     if (c.key === 'description') return false; 
     return true;
  });

  const qtyColIndex = finalColumns.findIndex(c => c.key === 'quantity');
  const firstItemTaxRate = Number(items[0]?.taxRate || items[0]?.tax || 0);

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
            <!-- Header with Invoice Title and Logo -->
            <div class="flex justify-between items-start mb-2">
              <!-- Left side - Invoice Title and Details -->
              <div>
                <div class="mb-3">
                  <h1 class="text-[32px] font-bold leading-tight" style="color: ${primaryColor}">INVOICE</h1>
                </div>
                
                <!-- Invoice Number and Dates -->
                <div class="text-[11px] leading-relaxed">
                  <div class="flex mb-0.5">
                    <span class="font-bold w-[70px]">Invoice No:</span>
                    <span>#${invoice.invoiceNumber || "---"}</span>
                  </div>
                  <div class="flex mb-0.5">
                    <span class="font-bold w-[70px]">Invoice Date:</span>
                    <span>${formatDate(invoice.invoiceDate)}</span>
                  </div>
                  <div class="flex mb-0.5">
                    <span class="font-bold w-[70px]">Due Date:</span>
                    <span>${formatDate(invoice.dueDate)}</span>
                  </div>
                </div>
              </div>

              <!-- Right side - Logo with company name underneath -->
              <div class="text-right">
                ${general?.companyLogo ? `<img src="${general.companyLogo}" class="h-16 w-auto object-contain mb-1 ml-auto" />` : ''}
                ${general?.companyName ? `<div class="text-[12px] font-bold" style="color: ${primaryColor}">${general.companyName}</div>` : ''}
              </div>
            </div>

            <!-- Billed By and Billed To Cards -->
            <div class="flex gap-4 mb-8 mt-6">
              <!-- Billed By -->
              <div class="flex-1 bg-[#f9f9f9] border border-[#e8e8e8] rounded-lg p-3">
                <h3 class="text-[11px] font-bold mb-2 uppercase" style="color: ${primaryColor}">BILLED BY</h3>
                <div class="text-[11px] font-bold mb-1">${general?.companyName || 'Your Company'}</div>
                <p class="text-[10px] text-gray-500 leading-normal mb-1">${fullAddress || '---'}</p>
                
                ${general?.taxId ? `<div class="text-[9px] text-gray-500"><span class="text-gray-400">Tax ID: </span>${general.taxId}</div>` : ''}
                ${general?.gstin ? `<div class="text-[9px] text-gray-500"><span class="text-gray-400">GSTIN: </span>${general.gstin}</div>` : ''}
                ${general?.pan ? `<div class="text-[9px] text-gray-500"><span class="text-gray-400">PAN: </span>${general.pan}</div>` : ''}
              </div>

              <!-- Billed To -->
              <div class="flex-1 bg-[#f9f9f9] border border-[#e8e8e8] rounded-lg p-3">
                <h3 class="text-[11px] font-bold mb-2 uppercase" style="color: ${primaryColor}">BILLED TO</h3>
                <div class="text-[11px] font-bold mb-1">${customer?.companyName || 'Customer Name'}</div>
                <p class="text-[10px] text-gray-500 leading-normal mb-1">
                  ${[customer?.address, customer?.city, customer?.country].filter(Boolean).join(', ') || '---'}
                </p>
                <p class="text-[10px] text-gray-500 mb-1">${customer?.email || ''}</p>

                ${customer?.gstin ? `<div class="text-[9px] text-gray-500"><span class="text-gray-400">GSTIN: </span>${customer.gstin}</div>` : ''}
                ${customer?.pan ? `<div class="text-[9px] text-gray-500"><span class="text-gray-400">PAN: </span>${customer.pan}</div>` : ''}
                ${(customer?.taxId && !customer?.gstin) ? `<div class="text-[9px] text-gray-500"><span class="text-gray-400">Tax ID: </span>${customer.taxId}</div>` : ''}
              </div>
            </div>

            <table class="item-table text-[10px]">
              <thead>
                <tr>
                  <th width="40">S.NO</th>
                  ${finalColumns.map(col => `
                    <th class="${col.key === 'itemName' ? 'text-left' : (col.key === 'quantity' ? 'text-center' : 'text-right')}">${col.title}</th>
                  `).join('')}
                  <th width="100" class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any, idx: number) => `
                  <tr>
                    <td class="text-center text-gray-400">${idx + 1}</td>
                    ${finalColumns.map(col => {
                      if (col.key === 'itemName') {
                        return `<td>
                          <p class="font-bold m-0 text-[11px]">${item.itemName || item.item || ''}</p>
                          ${item.description ? `<p class="text-[9px] text-gray-400 m-0 leading-tight">${item.description}</p>` : ''}
                        </td>`;
                      }
                      if (col.key === 'quantity') return `<td class="text-center">${item.quantity || item.qty || 0}</td>`;
                      if (col.key === 'rate') return `<td class="text-right">${symbol} ${Number(item.rate || item.price || 0).toFixed(2)}</td>`;
                      if (col.key === 'taxRate') {
                        const tr = Number(item.taxRate || item.tax || 0);
                        return `<td class="text-right">${tr}%</td>`;
                      }
                      if (col.key === 'projectId') return `<td class="text-right">${item.projectName || item.extraFields?.projectName || item.projectId || '-'}</td>`;
                      // For extra fields
                      const val = item.extraFields?.[col.key] || '-';
                      return `<td class="text-right">${val}</td>`;
                    }).join('')}
                    <td class="text-right font-bold">${symbol} ${Number(item.total || (Number(item.quantity || item.qty) * Number(item.rate || item.price)) + Number(item.taxAmount || item.tax || 0)).toFixed(2)}</td>
                  </tr>
                `).join('')}
                
                <tr class="summary-row">
                  <td colspan="${finalColumns.length + 1}" class="text-right border-none pt-2 font-medium text-gray-500">Subtotal</td>
                  <td class="text-right border-t border-gray-100 font-bold pt-2">${symbol} ${Number(invoice.subtotal).toFixed(2)}</td>
                </tr>
                
                ${hasTax ? `
                <tr class="summary-row">
                  <td colspan="${finalColumns.length + 1}" class="text-right border-none font-medium text-gray-500">CGST (${(firstItemTaxRate / 2).toFixed(2)}%)</td>
                  <td class="text-right font-bold">${symbol} ${(Number(invoice.taxTotal) / 2).toFixed(2)}</td>
                </tr>
                <tr class="summary-row">
                  <td colspan="${finalColumns.length + 1}" class="text-right border-none font-medium text-gray-500">SGST (${(firstItemTaxRate / 2).toFixed(2)}%)</td>
                  <td class="text-right font-bold">${symbol} ${(Number(invoice.taxTotal) / 2).toFixed(2)}</td>
                </tr>` : ''}

                ${Number(invoice.discountTotal || invoice.discount) > 0 ? `
                <tr class="summary-row">
                  <td colspan="${finalColumns.length + 1}" class="text-right border-none font-medium text-gray-500">Discount</td>
                  <td class="text-right font-bold text-red-500">-${symbol} ${Number(invoice.discountTotal || invoice.discount).toFixed(2)}</td>
                </tr>` : ''}

                <tr class="summary-row">
                  ${qtyColIndex !== -1 ? `
                    <td colspan="${qtyColIndex + 1}" class="text-right border-none font-bold text-gray-800 uppercase">Total</td>
                    <td class="text-center font-bold text-base">${totalQty}</td>
                    <td colspan="${finalColumns.length - qtyColIndex}" class="text-right font-bold text-lg" style="color: ${primaryColor}">${symbol} ${Number(invoice.grandTotal || invoice.total).toFixed(2)}</td>
                  ` : `
                    <td colspan="${finalColumns.length + 1}" class="text-right border-none font-bold text-gray-800 uppercase">Total</td>
                    <td class="text-right font-bold text-lg" style="color: ${primaryColor}">${symbol} ${Number(invoice.grandTotal || invoice.total).toFixed(2)}</td>
                  `}
                </tr>
              </tbody>
            </table>

            <div class="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50/50 mb-4 mt-4 avoid-break">
              <p class="text-[10px]"><strong class="text-gray-900 uppercase text-[9px]">Amount in Words:</strong> ${amountWords}</p>
            </div>

            <!-- Bank Details and Signature -->
            <div class="grid ${general?.signature ? 'grid-cols-[2fr_1fr]' : 'grid-cols-1'} gap-4 avoid-break mt-4 border-t border-gray-100 pt-4">
              <!-- Bank Details -->
              <div class="bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                <h3 class="text-[11px] font-bold mb-3 uppercase" style="color: ${primaryColor}">Bank Details</h3>
                <div class="flex gap-4 items-start">
                  <div class="flex-1 text-[10px] space-y-1">
                    <div class="flex"><span class="text-gray-400 w-32">Bank Name:</span><span>${payment?.bankName || 'N/A'}</span></div>
                    <div class="flex"><span class="text-gray-400 w-32">Account Number:</span><span>${payment?.accountNumber || 'N/A'}</span></div>
                    <div class="flex"><span class="text-gray-400 w-32">IFSC Code:</span><span>${payment?.ifscCode || 'N/A'}</span></div>
                    <div class="flex"><span class="text-gray-400 w-32">Branch:</span><span>${payment?.branchName || 'N/A'}</span></div>
                  </div>
                  ${payment?.qrCode ? `
                    <div class="text-center w-24">
                      <img src="${payment.qrCode}" class="w-16 h-16 border rounded bg-white p-1 ml-auto" />
                      <p class="text-[7px] text-gray-400 mt-1 uppercase">Scan to Pay</p>
                    </div>` : ''}
                </div>
              </div>

              <!-- Signature -->
              ${general?.signature ? `
              <div class="bg-gray-50/50 p-3 rounded-lg border border-gray-100 text-center flex flex-col justify-between min-h-[110px]">
                <h3 class="text-[10px] font-bold text-[#1890ff] uppercase" style="color: ${primaryColor}">Authorized Signature</h3>
                <img src="${general.signature}" class="h-12 mx-auto mix-blend-multiply" />
                <div>
                  <div class="w-4/5 border-b border-gray-200 mx-auto"></div>
                  <p class="text-[8px] text-gray-400 mt-1 uppercase italic font-medium">Digitally Signed</p>
                </div>
              </div>` : ''}
            </div>

            <!-- Notes & Terms -->
            <div class="mt-4 border-t border-gray-100 pt-4 grid grid-cols-2 gap-4 avoid-break">
              ${invoice.notes ? `
              <div class="bg-gray-50 border border-gray-100 rounded-lg p-3 min-h-[100px]">
                <h3 class="text-[10px] font-bold mb-2 uppercase" style="color: ${primaryColor}">Notes</h3>
                <p class="text-[10px] text-gray-600 leading-normal whitespace-pre-line">${invoice.notes}</p>
              </div>` : ''}
              ${invoice.terms ? `
              <div class="bg-gray-50 border border-gray-100 rounded-lg p-3 min-h-[100px]">
                <h3 class="text-[10px] font-bold mb-2 uppercase" style="color: ${primaryColor}">Terms & Conditions</h3>
                <p class="text-[10px] text-gray-600 leading-normal whitespace-pre-line">${invoice.terms}</p>
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


