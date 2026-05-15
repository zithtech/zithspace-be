import dayjs from 'dayjs';

export const generateProposalHtml = (proposal: any) => {
  const rawBlocks = typeof proposal.blocks_data === 'string'
    ? JSON.parse(proposal.blocks_data)
    : (proposal.blocks_data || proposal.blocks || []);

  const TYPE_ORDER: Record<string, number> = {
    'cover': 1,
    'text': 2,
    'scope': 3,
    'timeline': 4,
    'pricing': 5,
    'signature': 6,
    'section': 7
  };

  const blocks = [...rawBlocks].sort((a, b) =>
    (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99)
  );

  const getBlockTitle = (block: any) => {
    const data = block.data || {};
    const title = block.title || data.title || data.heading;
    if (title) return title;

    switch (block.type) {
      case 'text': return 'EXECUTIVE SUMMARY';
      case 'pricing': return 'INVESTMENT & COSTING';
      case 'scope': return 'PROJECT SCOPE';
      case 'timeline': return 'SCHEDULE & TIMELINE';
      case 'signature': return 'AGREEMENT & SIGN-OFF';
      case 'cover': return 'COVER';
      case 'section': return 'ADDITIONAL DETAILS';
      default: return block.type?.toUpperCase() || 'SECTION';
    }
  };

  const renderBlock = (block: any) => {
    const data = block.data || {};

    switch (block.type) {
      case 'cover': {
        const logo = data.logoUrl || data.logo;
        return `
          <div class="cover-page" style="padding-top: 5px; display: flex; flex-direction: column;">
            <!-- Top Header -->
            <div class="flex justify-between items-start mb-8">
              <div class="logo-container">
                ${logo ? `<img src="${logo}" class="h-24 w-24 object-contain rounded-xl shadow-sm" />` : ''}
              </div>
              <div class="text-right">
                ${data.senderCompany ? `<div class="text-[20px] font-black text-slate-900 mb-0.5">${data.senderCompany}</div>` : ''}
                ${data.senderName ? `<div class="text-[14px] font-bold text-slate-500 mb-1.5">${data.senderName}</div>` : ''}
                ${(data.senderEmail || data.senderContact) ? `
                  <div class="text-[12px] text-slate-400 font-medium">
                    ${data.senderEmail || ''} ${data.senderEmail && data.senderContact ? '<span class="mx-2 text-slate-300">|</span>' : ''} ${data.senderContact || ''}
                  </div>
                ` : ''}
                ${data.senderAddress ? `<div class="text-[12px] text-slate-400 font-medium mt-0.5">${data.senderAddress.replace(/\n/g, ', ')}</div>` : ''}
              </div>
            </div>

            <!-- Hero Section -->
            <div class="mb-8">
              <div class="text-blue-600 text-[10px] font-black tracking-[0.15em] uppercase mb-3">PROPOSAL FOR</div>
              <h1 class="text-[42px] font-black text-slate-900 leading-[1] tracking-tight mb-4">${data.title || proposal.title || 'Untitled Project'}</h1>
              ${data.projectSummary ? `
                <div class="text-[14px] text-slate-500 leading-relaxed font-medium max-w-[700px]">
                  ${data.projectSummary}
                </div>
              ` : ''}
            </div>

            <div class="mt-6 mb-8">
              <div class="h-px bg-slate-100 w-full mb-6"></div>
              
              <div class="grid grid-cols-12 gap-12">
                <!-- Client Info -->
                <div class="col-span-8">
                  ${(data.clientName || data.clientCompany) ? `
                    <div class="text-slate-400 text-[9px] font-black tracking-widest uppercase mb-3">PREPARED FOR</div>
                    <div class="text-[18px] font-black text-slate-900 mb-1.5 leading-none">${data.clientName || data.clientCompany}</div>
                  ` : ''}
                  ${data.clientSigner ? `<div class="text-[12px] font-bold text-slate-500 mb-3">${data.clientSigner}</div>` : ''}
                  
                  ${(data.clientEmail || data.clientContact) ? `
                    <div class="flex items-center gap-2 text-[11px] text-slate-400 font-medium mb-1">
                      <span>${data.clientEmail || ''}</span>
                      ${data.clientEmail && data.clientContact ? '<span class="text-slate-300">|</span>' : ''}
                      <span>${data.clientContact || ''}</span>
                    </div>
                  ` : ''}
                  ${data.clientAddress ? `<div class="text-[11px] text-slate-400 font-medium">${data.clientAddress.replace(/\n/g, ', ')}</div>` : ''}
                </div>

                <!-- Dates -->
                <div class="col-span-4 pl-12 border-l border-slate-50">
                  ${data.date ? `
                    <div class="mb-6">
                      <div class="text-slate-400 text-[9px] font-black tracking-widest uppercase mb-2">DATE</div>
                      <div class="text-[14px] font-black text-slate-900">${dayjs(data.date).format('MMMM DD, YYYY')}</div>
                    </div>
                  ` : ''}
                  ${data.validUntil ? `
                    <div>
                      <div class="text-slate-400 text-[9px] font-black tracking-widest uppercase mb-2">VALID UNTIL</div>
                      <div class="text-[14px] font-black text-slate-900">${dayjs(data.validUntil).format('MMMM DD, YYYY')}</div>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      case 'pricing': {
        const items = data.items || [];
        const subtotal = items.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
        const discount = data.discount || 0;
        const taxRate = data.taxRate || 0;
        const discountedSubtotal = Math.max(0, subtotal - discount);
        const taxAmount = discountedSubtotal * (taxRate / 100);
        const grandTotal = discountedSubtotal + taxAmount;
        const currency = data.currency === 'USD' ? '$' : (data.currency || '₹');

        return `
          <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table class="item-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th class="text-left" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 16px; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.05em;">Description</th>
                  <th width="80" class="text-center" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 16px; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.05em;">Qty</th>
                  <th width="120" class="text-right" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 16px; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.05em;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any) => `
                  <tr>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 11px; vertical-align: top;">
                      <div class="font-bold text-slate-900 mb-1 text-[11px]">${item.name || 'Untitled Item'}</div>
                      <div class="text-[10px] text-slate-400 font-medium leading-relaxed">${item.description || ''}</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 11px; vertical-align: top;" class="text-center font-semibold text-slate-500">${item.quantity || 1}</td>
                    <td style="border: 1px solid #e2e8f0; padding: 12px 16px; font-size: 11px; vertical-align: top;" class="text-right font-bold text-slate-900">${currency}${((item.price || 0) * (item.quantity || 0)).toLocaleString()}</td>
                  </tr>
                `).join('')}
                
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none font-medium text-slate-400 pt-4" style="padding: 4px 16px; font-size: 11px;">SUBTOTAL</td>
                  <td class="text-right border-none font-bold text-slate-700 pt-4" style="padding: 4px 16px; font-size: 11px;">${currency}${subtotal.toLocaleString()}</td>
                </tr>
                ${discount > 0 ? `
                  <tr class="summary-row">
                    <td colspan="2" class="text-right border-none font-medium text-emerald-500" style="padding: 4px 16px; font-size: 11px;">DISCOUNT</td>
                    <td class="text-right border-none font-bold text-emerald-500" style="padding: 4px 16px; font-size: 11px;">-${currency}${discount.toLocaleString()}</td>
                  </tr>
                ` : ''}
                ${taxRate > 0 ? `
                  <tr class="summary-row">
                    <td colspan="2" class="text-right border-none font-medium text-slate-400" style="padding: 4px 16px; font-size: 11px;">TAX (${taxRate}%)</td>
                    <td class="text-right border-none font-bold text-slate-700" style="padding: 4px 16px; font-size: 11px;">${currency}${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ` : ''}
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none font-extrabold text-slate-900 uppercase pt-2" style="padding: 4px 16px; font-size: 11px;">GRAND TOTAL</td>
                  <td class="text-right border-none font-black text-[18px] text-blue-600 pt-2" style="padding: 4px 16px; font-size: 11px;">${currency}${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            
            <div class="avoid-break bg-slate-50 p-6 border-t border-slate-200 flex gap-6">
              ${data.paymentSchedule ? `
                <div class="flex-1">
                   <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Schedule</h4>
                   <div class="text-[10px] text-slate-600 leading-relaxed font-medium">${data.paymentSchedule.replace(/\n/g, '<br/>')}</div>
                </div>
              ` : ''}
              ${data.paymentMethods ? `
                <div class="flex-1">
                   <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Methods</h4>
                   <div class="text-[10px] text-slate-600 leading-relaxed font-medium">${data.paymentMethods.replace(/\n/g, '<br/>')}</div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }

      case 'scope': {
        return `
          <div class="space-y-4">
            ${(data.milestones || []).filter((m: any) => m.title?.trim() || m.deliverables?.trim()).map((m: any, idx: number) => `
              <div class="avoid-break bg-slate-50 border border-slate-200 rounded-xl p-6">
                <div class="flex items-center gap-3 mb-4">
                   <span class="bg-blue-600 text-white font-black text-[8px] px-3 py-1 rounded tracking-tighter uppercase">PHASE ${idx + 1}</span>
                   <h3 class="text-[13px] font-extrabold text-slate-900">${m.title || 'Untitled Phase'}</h3>
                </div>
                ${m.deliverables ? `
                  <div class="mb-4">
                     <p class="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Deliverables</p>
                     <p class="text-[11px] font-bold text-slate-700">${m.deliverables}</p>
                  </div>
                ` : ''}
                ${m.tasks?.trim() ? `
                  <div>
                     <p class="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Task Breakdown</p>
                     <ul class="list-disc pl-5 text-[10px] text-slate-600 leading-relaxed space-y-1 font-medium">
                        ${(m.tasks || '').split('\n').filter((t: string) => t.trim().length > 0).map((t: string) => `<li>${t}</li>`).join('')}
                     </ul>
                  </div>
                ` : ''}
              </div>
            `).join('')}
            
            <div class="grid grid-cols-2 gap-4">
              ${(data.terms || []).filter((term: any) => term.title?.trim() || term.description?.trim()).map((term: any) => `
                <div class="avoid-break bg-white border border-slate-100 rounded-lg p-4 shadow-sm border-l-4" style="border-left-color: ${term.color || '#cbd5e1'}">
                  ${term.title ? `<h4 class="font-black text-[9px] text-slate-400 uppercase tracking-wider mb-2">${term.title}</h4>` : ''}
                  <div class="text-[10px] text-slate-600 font-medium leading-relaxed">${term.description}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      case 'timeline': {
        return `
          <div class="grid grid-cols-2 gap-4">
            ${(data.phases || []).filter((p: any) => p.title?.trim()).map((phase: any) => `
              <div class="avoid-break border border-slate-200 rounded-xl p-5 bg-white shadow-sm relative overflow-hidden">
                <h4 class="text-[13px] font-black text-slate-900 mb-1">${phase.title}</h4>
                ${phase.deadline ? `<div class="text-[10px] font-extrabold text-blue-600 mb-3">${dayjs(phase.deadline).format('MMMM DD, YYYY')}</div>` : ''}
                ${phase.reviewPeriod ? `<p class="text-[10px] text-slate-500 font-medium leading-relaxed">${phase.reviewPeriod} dedicated feedback window.</p>` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }

      case 'signature': {
        return `
          <div class="space-y-6">
            ${(data.ipClause || data.revisionClause || data.terminationClause || data.ndaClause) ? `
              <div class="avoid-break bg-slate-50 border border-slate-200 rounded-xl p-6 text-[10px] text-slate-600 font-medium space-y-4">
                ${data.ipClause ? `<div><strong class="text-slate-900 uppercase text-[8px] block mb-1 tracking-widest">INTELLECTUAL PROPERTY</strong>${data.ipClause}</div>` : ''}
                ${data.revisionClause ? `<div><strong class="text-slate-900 uppercase text-[8px] block mb-1 tracking-widest">REVISION POLICY</strong>${data.revisionClause}</div>` : ''}
                ${data.terminationClause ? `<div><strong class="text-slate-900 uppercase text-[8px] block mb-1 tracking-widest">TERMINATION</strong>${data.terminationClause}</div>` : ''}
                ${data.ndaClause ? `<div><strong class="text-slate-900 uppercase text-[8px] block mb-1 tracking-widest">CONFIDENTIALITY</strong>${data.ndaClause}</div>` : ''}
              </div>
            ` : ''}
            
            <div class="avoid-break flex gap-4">
              <div class="flex-1 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 min-h-[160px] flex flex-col justify-between">
                <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Provider Signature</span>
                <div class="mt-8">
                  <div class="border-b border-slate-200 mb-2"></div>
                  <p class="font-black text-slate-900 text-[12px]">${data.companySigner || 'Authorized Representative'}</p>
                </div>
              </div>
              <div class="flex-1 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-6 min-h-[160px] flex flex-col justify-between">
                <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Client Acceptance</span>
                <div class="mt-8">
                  <div class="border-b border-slate-200 mb-2"></div>
                  <p class="font-black text-slate-900 text-[12px]">${data.clientSigner || 'Signatory Name'}</p>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      case 'text':
      case 'section':
        return `
          <div class="text-[11px] text-slate-700 leading-normal font-medium opacity-90">
            ${data.content || data.text || ''}
          </div>
        `;

      default:
        return '';
    }
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    @page { margin: 0; size: A4; }
    body { 
      font-family: 'Inter', sans-serif; 
      background-color: white; 
      margin: 0; 
      padding: 0;
      -webkit-print-color-adjust: exact; 
      color: #1e293b;
    }
    
    table.master-container { 
      width: 100%; 
      border-collapse: collapse; 
    }

    .header-space { height: 15mm; }
    .footer-space { height: 15mm; }
    
    table.report-container { 
      width: 100%; 
      border-collapse: collapse; 
      table-layout: fixed;
    }
    
    .footer-space { height: 80px; }
    
    .footer-fixed {
      position: fixed;
      bottom: 10mm;
      left: 10mm;
      right: 10mm;
      height: 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: white;
      border-top: 1px solid #f1f5f9;
      padding-top: 10px;
      page-break-inside: avoid;
    }

    .page-border {
      position: fixed;
      top: 10mm;
      left: 10mm;
      right: 10mm;
      bottom: 10mm;
      border: 1px solid #f1f5f9;
      pointer-events: none;
      z-index: -100;
    }

    .avoid-break { page-break-inside: avoid; }
    .block-container { 
      margin-bottom: 40px;
      page-break-inside: auto; 
    }
  </style>
</head>
<body>
  <div class="page-border"></div>
  <table class="master-container">
    <thead><tr><td class="header-space"></td></tr></thead>
    <tbody>
      <tr>
        <td class="px-14">
          <div class="main-wrapper">
            ${blocks.map((block: any) => {
              if (block.type === 'cover') return renderBlock(block);
              
              const shouldAvoidSplit = ['pricing', 'signature'].includes(block.type);
              return `
                <div class="block-container ${shouldAvoidSplit ? 'avoid-break' : ''}">
                   <div style="page-break-after: avoid; margin-bottom: 24px;">
                      <div class="flex items-center gap-4">
                         <h2 class="text-[11px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded tracking-widest uppercase">${getBlockTitle(block)}</h2>
                         <div class="flex-1 h-px bg-slate-100"></div>
                      </div>
                   </div>
                   ${renderBlock(block)}
                </div>
              `;
            }).join('')}

            <div class="mt-20 mb-10 text-center avoid-break">
              <div class="inline-flex items-center gap-4">
                <div class="h-px w-10 bg-slate-100"></div>
                <span class="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em]">End of Proposal</span>
                <div class="h-px w-10 bg-slate-100"></div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
    <tfoot><tr><td class="footer-space"></td></tr></tfoot>
  </table>
</body>
</html>
  `;
};
