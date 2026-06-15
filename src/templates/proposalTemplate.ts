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

  const filtered = [...rawBlocks];
  const blocks = filtered.some((b: any) => b?.type === 'component')
    ? filtered
    : filtered.sort((a: any, b: any) => (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99));

  const getComponentLabel = (kind: string) => {
    switch (kind) {
      case 'heading': return 'Heading';
      case 'phase': return 'Phase / Milestone';
      case 'twoColumn': return 'Two Columns';
      case 'table': return 'Table';
      case 'divider': return 'Divider';
      case 'spacer': return 'Spacer';
      case 'paragraph': return 'Paragraph';
      case 'bullets': return 'Bullet List';
      case 'scope': return 'Scope of Work';
      case 'timeline': return 'Timeline & Schedule';
      case 'deliverable': return 'Deliverable';
      case 'tasklist': return 'Task List';
      case 'keyvalue': return 'Highlights';
      case 'callout': return 'Callout';
      case 'image': return 'Image';
      case 'gallery': return 'Gallery';
      case 'video': return 'Video Embed';
      case 'pricing': return 'Pricing Table';
      case 'quote': return 'Testimonial';
      case 'cta': return 'CTA Button';
      case 'signature': return 'Signature';
      default: return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Component';
    }
  };

  const getBlockTitle = (block: any) => {
    const data = block.data || {};
    const title = block.title || data.title || data.heading;
    if (title) return title;

    if (block.type === 'component') {
      return getComponentLabel(data.kind || '');
    }

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
            <div class="flex justify-between items-start mb-4">
              <div class="logo-container">
                ${logo ? `<img src="${logo}" class="h-16 w-16 object-contain rounded-xl shadow-sm" />` : ''}
              </div>
              <div class="text-right">
                ${data.senderCompany ? `<div class="text-[16px] font-black text-slate-900 mb-0.5">${data.senderCompany}</div>` : ''}
                ${data.senderName ? `<div class="text-[11px] font-bold text-slate-500 mb-1">${data.senderName}</div>` : ''}
                ${(data.senderEmail || data.senderContact) ? `
                  <div class="text-[9.5px] text-slate-400 font-medium">
                    ${data.senderEmail || ''} ${data.senderEmail && data.senderContact ? '<span class="mx-2 text-slate-300">|</span>' : ''} ${data.senderContact || ''}
                  </div>
                ` : ''}
                ${data.senderAddress ? `<div class="text-[9.5px] text-slate-400 font-medium mt-0.5">${data.senderAddress.replace(/\n/g, ', ')}</div>` : ''}
              </div>
            </div>

            <!-- Hero Section -->
            <div class="mb-2">
              <div class="text-blue-600 text-[8.5px] font-black tracking-[0.15em] uppercase mb-1.5">PROPOSAL FOR</div>
              <h1 class="text-[28px] font-black text-slate-900 leading-[1.1] tracking-tight mb-2">${data.title || proposal.title || 'Untitled Project'}</h1>
              ${data.projectSummary ? `
                <div class="text-[11px] text-slate-500 leading-relaxed font-medium max-w-[700px] mb-2">
                  ${data.projectSummary}
                </div>
              ` : ''}
            </div>

            <div class="mt-1 mb-4">
              <div class="h-px bg-slate-100 w-full mb-4"></div>
              
              <div class="grid grid-cols-12 gap-6">
                <!-- Client Info -->
                <div class="col-span-8">
                  ${(data.clientName || data.clientCompany) ? `
                    <div class="text-slate-400 text-[8px] font-black tracking-widest uppercase mb-1.5">PREPARED FOR</div>
                    <div class="text-[14px] font-black text-slate-900 mb-1 leading-none">${data.clientName || data.clientCompany}</div>
                  ` : ''}
                  ${data.clientSigner ? `<div class="text-[10px] font-bold text-slate-500 mb-2">${data.clientSigner}</div>` : ''}
                  
                  ${(data.clientEmail || data.clientContact) ? `
                    <div class="flex items-center gap-2 text-[9px] text-slate-400 font-medium mb-0.5">
                      <span>${data.clientEmail || ''}</span>
                      ${data.clientEmail && data.clientContact ? '<span class="text-slate-300">|</span>' : ''}
                      <span>${data.clientContact || ''}</span>
                    </div>
                  ` : ''}
                  ${data.clientAddress ? `<div class="text-[9px] text-slate-400 font-medium">${data.clientAddress.replace(/\n/g, ', ')}</div>` : ''}
                </div>

                <!-- Dates -->
                <div class="col-span-4 pl-6 border-l border-slate-50">
                  ${data.date ? `
                    <div class="mb-3">
                      <div class="text-slate-400 text-[8px] font-black tracking-widest uppercase mb-1">DATE</div>
                      <div class="text-[11.5px] font-black text-slate-900">${dayjs(data.date).format('MMMM DD, YYYY')}</div>
                    </div>
                  ` : ''}
                  ${data.validUntil ? `
                    <div>
                      <div class="text-slate-400 text-[8px] font-black tracking-widest uppercase mb-1">VALID UNTIL</div>
                      <div class="text-[11.5px] font-black text-slate-900">${dayjs(data.validUntil).format('MMMM DD, YYYY')}</div>
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
                  <th class="text-left" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 8.5px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.05em;">Description</th>
                  <th width="80" class="text-center" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 8.5px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.05em;">Qty</th>
                  <th width="120" class="text-right" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 8.5px; text-transform: uppercase; color: #64748b; font-weight: 800; letter-spacing: 0.05em;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any) => `
                  <tr>
                    <td style="border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 9.5px; vertical-align: top;">
                      <div class="font-bold text-slate-900 mb-1 text-[10px]">${item.name || 'Untitled Item'}</div>
                      <div class="text-[8.5px] text-slate-400 font-medium leading-relaxed">${item.description || ''}</div>
                    </td>
                    <td style="border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 9.5px; vertical-align: top;" class="text-center font-semibold text-slate-500">${item.quantity || 1}</td>
                    <td style="border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 9.5px; vertical-align: top;" class="text-right font-bold text-slate-900">${currency}${((item.price || 0) * (item.quantity || 0)).toLocaleString()}</td>
                  </tr>
                `).join('')}
                
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none font-medium text-slate-400 pt-3" style="padding: 3px 10px; font-size: 9.5px;">SUBTOTAL</td>
                  <td class="text-right border-none font-bold text-slate-700 pt-3" style="padding: 3px 10px; font-size: 9.5px;">${currency}${subtotal.toLocaleString()}</td>
                </tr>
                ${discount > 0 ? `
                  <tr class="summary-row">
                    <td colspan="2" class="text-right border-none font-medium text-emerald-500" style="padding: 3px 10px; font-size: 9.5px;">DISCOUNT</td>
                    <td class="text-right border-none font-bold text-emerald-500" style="padding: 3px 10px; font-size: 9.5px;">-${currency}${discount.toLocaleString()}</td>
                  </tr>
                ` : ''}
                ${taxRate > 0 ? `
                  <tr class="summary-row">
                    <td colspan="2" class="text-right border-none font-medium text-slate-400" style="padding: 3px 10px; font-size: 9.5px;">TAX (${taxRate}%)</td>
                    <td class="text-right border-none font-bold text-slate-700" style="padding: 3px 10px; font-size: 9.5px;">${currency}${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ` : ''}
                <tr class="summary-row">
                  <td colspan="2" class="text-right border-none font-extrabold text-slate-900 uppercase pt-1.5" style="padding: 3px 10px; font-size: 9.5px;">GRAND TOTAL</td>
                  <td class="text-right border-none font-black text-[13px] text-blue-600 pt-1.5" style="padding: 3px 10px; font-size: 13px;">${currency}${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            
            <div class="avoid-break bg-slate-50 p-4 border-t border-slate-200 flex gap-4">
              ${data.paymentSchedule ? `
                <div class="flex-1">
                   <h4 class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Payment Schedule</h4>
                   <div class="text-[8.5px] text-slate-600 leading-relaxed font-medium">${data.paymentSchedule.replace(/\n/g, '<br/>')}</div>
                </div>
              ` : ''}
              ${data.paymentMethods ? `
                <div class="flex-1">
                   <h4 class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Payment Methods</h4>
                   <div class="text-[8.5px] text-slate-600 leading-relaxed font-medium">${data.paymentMethods.replace(/\n/g, '<br/>')}</div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }

      case 'scope': {
        return `
          <div class="space-y-3.5">
            ${(data.milestones || []).filter((m: any) => m.title?.trim() || m.deliverables?.trim()).map((m: any, idx: number) => `
              <div class="avoid-break bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div class="flex items-center gap-2 mb-2.5">
                   <span style="background: rgba(59, 130, 246, 0.1); color: #2563eb; padding: 2px 7px; border-radius: 20px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid rgba(59, 130, 246, 0.22); flex-shrink: 0;">Phase ${idx + 1}</span>
                   <h3 class="text-[12px] font-extrabold text-slate-900 leading-tight">${m.title || 'Untitled Phase'}</h3>
                </div>
                ${m.deliverables ? `
                  <div style="margin-bottom: 6px; background: rgba(16, 185, 129, 0.05); border-left: 3px solid #10b981; padding: 6px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 1px;">
                     <strong style="color: #0f172a; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em;">Key Deliverables</strong>
                     <p style="color: #475569; font-size: 9.5px; margin: 0; line-height: 1.5;">${m.deliverables}</p>
                  </div>
                ` : ''}
                ${m.tasks?.trim() ? `
                  <div style="padding: 8px 10px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #cbd5e1; margin-top: 6px;">
                     <strong style="color: #0f172a; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">Detailed Tasks</strong>
                     <ul class="list-disc pl-5 text-[9px] text-slate-600 leading-relaxed space-y-1 font-medium">
                        ${(m.tasks || '').split('\n').filter((t: string) => t.trim().length > 0).map((t: string) => `<li>${t}</li>`).join('')}
                     </ul>
                  </div>
                ` : ''}
              </div>
            `).join('')}
            
            <div class="flex flex-col gap-3 mt-2">
              ${(data.terms || []).filter((term: any) => term.title?.trim() || term.description?.trim()).map((term: any) => `
                <div class="avoid-break bg-white border border-slate-100 rounded-lg p-3.5 shadow-sm border-l-4" style="border-left-color: ${term.color || '#cbd5e1'}">
                  ${term.title ? `<h4 class="font-black text-[10.5px] text-slate-800 uppercase tracking-wider mb-1">${term.title}</h4>` : ''}
                  <div class="text-[10px] text-slate-600 font-medium leading-relaxed">${term.description}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      case 'timeline': {
        return `
          <div class="grid grid-cols-2 gap-2.5">
            ${(data.phases || []).filter((p: any) => p.title?.trim()).map((phase: any) => `
              <div class="avoid-break border border-slate-200 rounded-xl p-3 bg-white shadow-sm relative overflow-hidden">
                <h4 class="text-[11px] font-black text-slate-900 mb-0.5">${phase.title}</h4>
                ${phase.deadline ? `<div class="text-[9px] font-extrabold text-blue-600 mb-1.5">${dayjs(phase.deadline).format('MMMM DD, YYYY')}</div>` : ''}
                ${phase.reviewPeriod ? `<p class="text-[8.5px] text-slate-500 font-medium leading-relaxed">${phase.reviewPeriod} dedicated feedback window.</p>` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }

      case 'signature': {
        const sigFamily = (id?: string) => {
          switch (id) {
            case 'satisfy': return "'Satisfy', cursive";
            case 'alexbrush': return "'Alex Brush', cursive";
            case 'pinyon': return "'Pinyon Script', cursive";
            case 'parisienne': return "'Parisienne', cursive";
            case 'delafield': return "'Mrs Saint Delafield', cursive";
            case 'doulaise': return "'Monsieur La Doulaise', cursive";
            case 'caveat':
            default: return "'Caveat', cursive";
          }
        };

        const companySigFont = sigFamily(data.companySignatureFont);
        const clientSigFont = sigFamily(data.clientSignatureFont);
        
        const sigDate = data.date ? dayjs(data.date).format('MMM DD, YYYY') : 'Date';

        return `
          <div class="space-y-4">
            ${(data.ipClause || data.revisionClause || data.terminationClause || data.ndaClause) ? `
              <div class="avoid-break bg-slate-50 border border-slate-200 rounded-xl p-4 text-[8.5px] text-slate-600 font-medium space-y-2.5">
                ${data.ipClause ? `<div><strong class="text-slate-900 uppercase text-[7px] block mb-0.5 tracking-widest">INTELLECTUAL PROPERTY</strong>${data.ipClause}</div>` : ''}
                ${data.revisionClause ? `<div><strong class="text-slate-900 uppercase text-[7px] block mb-0.5 tracking-widest">REVISION POLICY</strong>${data.revisionClause}</div>` : ''}
                ${data.terminationClause ? `<div><strong class="text-slate-900 uppercase text-[7px] block mb-0.5 tracking-widest">TERMINATION</strong>${data.terminationClause}</div>` : ''}
                ${data.ndaClause ? `<div><strong class="text-slate-900 uppercase text-[7px] block mb-0.5 tracking-widest">CONFIDENTIALITY</strong>${data.ndaClause}</div>` : ''}
              </div>
            ` : ''}
            
            <div class="avoid-break flex gap-6">
              <!-- Provider Signature Box -->
              <div class="flex-1 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 min-h-[140px] flex flex-col justify-between">
                <div>
                  <div class="text-[10.5px] font-bold text-slate-800 mb-1">For: ${data.companyName || 'Your Company'}</div>
                  <div style="height: 52px; display: flex; align-items: flex-end; overflow: hidden; margin-bottom: 4px;">
                    ${data.companySignature ? `
                      <span style="font-family: ${companySigFont}; font-size: 32px; line-height: 1; color: #0f172a; padding-bottom: 2px; white-space: nowrap;">
                        ${data.companySignature}
                      </span>
                    ` : ''}
                  </div>
                  <div class="border-b border-slate-200 mb-2"></div>
                </div>
                <div class="text-[9.5px] text-slate-600 font-medium">
                  <div class="font-bold text-slate-800">${data.companySigner || 'Authorized Representative'}</div>
                  <div class="text-slate-400 mt-0.5">Date: ${data.date ? sigDate : 'Date'}</div>
                  ${data.place ? `<div class="text-slate-400 mt-0.5">Place: ${data.place}</div>` : ''}
                </div>
              </div>

              <!-- Client Signature Box -->
              <div class="flex-1 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 min-h-[140px] flex flex-col justify-between">
                <div>
                  <div class="text-[10.5px] font-bold text-slate-800 mb-1">For: ${data.clientName || 'Client Name'}</div>
                  <div style="height: 52px; display: flex; align-items: flex-end; overflow: hidden; margin-bottom: 4px;">
                    ${data.clientSignature ? `
                      <span style="font-family: ${clientSigFont}; font-size: 32px; line-height: 1; color: #0f172a; padding-bottom: 2px; white-space: nowrap;">
                        ${data.clientSignature}
                      </span>
                    ` : ''}
                  </div>
                  <div class="border-b border-slate-200 mb-2"></div>
                </div>
                <div class="text-[9.5px] text-slate-600 font-medium">
                  <div class="font-bold text-slate-800">${data.clientSigner || 'Authorized Representative'}</div>
                  <div class="text-slate-400 mt-0.5">Date: ${data.date ? sigDate : 'Date'}</div>
                  ${data.place ? `<div class="text-slate-400 mt-0.5">Place: ${data.place}</div>` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }

      case 'component': {
        if (!data?.kind) return '';
        const props = data.props || {};

        switch (data.kind) {
          case 'heading':
            return `
              <h3 class="text-[12px] font-extrabold text-slate-900 mb-1 mt-1">${props.text || 'Section Heading'}</h3>
            `;
          case 'phase':
            return `
              <div class="flex items-center gap-1.5 mb-2 mt-1">
                <span style="display: inline-flex; align-items: center; font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #2563eb; background: #eff6ff; border: 1px solid rgba(37,99,235,0.22); padding: 2px 7px; flex-shrink: 0; border-radius: 4px;">${props.badge || 'PHASE 1'}</span>
                <h3 style="font-size: 13.5px; font-weight: 800; color: #0f172a; margin: 0;">${props.title || 'Phase Title'}</h3>
              </div>
            `;
          case 'deliverable':
            return `
              <div style="background: rgba(5, 150, 105, 0.04); border-left: 3px solid #059669; padding: 6px 10px; border-radius: 8px; margin-top: 4px; margin-bottom: 4px;">
                <div class="flex items-center gap-1.5 mb-0.5" style="font-weight: 700; color: #0f172a;">
                  <span style="color: #059669; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 4px;">✓</span>
                  <strong class="text-[10px] font-extrabold text-slate-800">${props.label || 'Major Deliverables'}</strong>
                </div>
                <div class="text-[9.5px] text-slate-600 leading-relaxed pl-5">${props.text || ''}</div>
              </div>
            `;
          case 'tasklist':
            return `
              <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-2">
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-blue-500 font-bold">📋</span>
                  <strong class="text-[10px] font-extrabold text-slate-800">${props.label || 'Detailed Tasks'}</strong>
                </div>
                <ul class="list-disc pl-6 text-[9.5px] text-slate-600 leading-relaxed space-y-1 font-medium">
                  ${(props.items || []).map((it: string) => `<li>${it}</li>`).join('')}
                </ul>
              </div>
            `;
          case 'bullets':
            return `
              <ul class="list-disc pl-5 text-[8.5px] text-slate-700 leading-relaxed space-y-0.5 font-medium mb-1">
                ${(props.items || []).map((it: string) => `<li>${it}</li>`).join('')}
              </ul>
            `;
          case 'paragraph':
            return `
              <div class="text-[8.5px] text-slate-700 leading-normal font-medium mb-1">
                ${props.text || ''}
              </div>
            `;
          case 'keyvalue':
            return `
              <div class="mb-2">
                ${props.label ? `<h4 class="font-black text-[7.5px] text-slate-400 uppercase tracking-wider mb-1">${props.label}</h4>` : ''}
                <div class="grid grid-cols-2 gap-2">
                  ${(props.rows || []).map((r: any) => `
                    <div class="bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <div class="text-[7.5px] font-bold text-slate-400 uppercase mb-0.5">${r.k || ''}</div>
                      <div class="text-[11px] font-black text-slate-800">${r.v || ''}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          case 'callout': {
            const variant = props.variant || 'info';
            let bg = 'rgba(37,99,235,0.05)';
            let border = 'rgba(37,99,235,0.25)';
            let color = '#2563eb';
            let icon = 'ℹ️';
            if (variant === 'success') {
              bg = 'rgba(5,150,105,0.05)';
              border = 'rgba(5,150,105,0.25)';
              color = '#059669';
              icon = '✓';
            } else if (variant === 'warning') {
              bg = 'rgba(180,83,9,0.05)';
              border = 'rgba(180,83,9,0.22)';
              color = '#b45309';
              icon = '⚠️';
            } else if (variant === 'danger') {
              bg = 'rgba(239,68,68,0.04)';
              border = 'rgba(239,68,68,0.22)';
              color = '#ef4444';
              icon = '⚠️';
            }
            return `
              <div class="border rounded-xl p-3 mb-2" style="background-color: ${bg}; border-color: ${border};">
                <div class="flex items-center gap-1.5 mb-1" style="color: ${color}">
                  <span class="font-bold">${icon}</span>
                  <strong class="text-[9.5px] font-extrabold uppercase tracking-wide">${props.title || ''}</strong>
                </div>
                <p class="text-[8.5px] font-medium leading-relaxed" style="color: #475569">${props.text || ''}</p>
              </div>
            `;
          }
          case 'divider':
            return `<div class="h-px bg-slate-200 w-full my-3"></div>`;
          case 'spacer': {
            const size = props.size || 'medium';
            const height = size === 'small' ? '6px' : size === 'large' ? '24px' : '12px';
            return `<div style="height: ${height};"></div>`;
          }
          case 'table': {
            const columns = props.columns || [];
            const rows = props.rows || [];
            return `
              <div class="overflow-x-auto mb-2 border border-slate-200 rounded-xl">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50">
                    <tr>
                      ${columns.map((c: any) => `
                        <th class="px-3 py-1.5 text-left text-[8.5px] font-extrabold text-slate-500 uppercase tracking-wider" style="text-align: ${c.align || 'left'}; width: ${c.width}px;">
                          ${c.label || ''}
                        </th>
                      `).join('')}
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-200">
                    ${rows.map((row: any) => `
                      <tr style="height: ${row.height ? Math.round(row.height * 0.7) : 28}px;">
                        ${columns.map((c: any) => `
                          <td class="px-3 py-1.5 text-[9px] text-slate-700 font-medium" style="text-align: ${c.align || 'left'};">
                            ${row.cells?.[c.id] || ''}
                          </td>
                        `).join('')}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `;
          }
          case 'twoColumn':
            return `
              <div class="grid grid-cols-2 gap-4 mb-2">
                <div>
                  <h4 class="font-extrabold text-[10px] text-slate-900 mb-1">${props.leftTitle || ''}</h4>
                  <div class="text-[9px] text-slate-600 font-medium leading-relaxed">${props.left || ''}</div>
                </div>
                <div>
                  <h4 class="font-extrabold text-[10px] text-slate-900 mb-1">${props.rightTitle || ''}</h4>
                  <div class="text-[9px] text-slate-600 font-medium leading-relaxed">${props.right || ''}</div>
                </div>
              </div>
            `;
          case 'image':
            return `
              <div class="mb-2 text-center">
                ${props.src ? `<img class="max-w-full h-auto rounded-lg inline-block shadow-sm" src="${props.src}" alt="${props.caption || ''}" />` : ''}
                ${props.caption ? `<div class="text-[8.5px] text-slate-400 font-medium mt-1">${props.caption}</div>` : ''}
              </div>
            `;
          case 'gallery':
            return `
              <div class="grid grid-cols-3 gap-2.5 mb-2">
                ${(props.images || []).map((img: any) => `
                  <div class="text-center">
                    ${img.src ? `<img class="w-full h-auto rounded-lg shadow-sm" src="${img.src}" />` : ''}
                    ${img.caption ? `<div class="text-[8px] text-slate-400 font-medium mt-0.5">${img.caption}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            `;
          case 'video':
            return `
              <div class="mb-2 text-center bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span class="text-blue-500 text-sm mr-1.5">🎥</span>
                <span class="text-[9px] font-bold text-slate-700">Video Embed:</span>
                <a href="${props.url || '#'}" target="_blank" class="text-[9px] text-blue-600 underline ml-0.5">${props.url || 'No Link'}</a>
              </div>
            `;
          case 'quote':
            return `
              <blockquote class="border-l-4 border-blue-500 pl-3 py-1 italic my-2 bg-slate-50 rounded-r-lg p-2.5">
                <p class="text-[10px] font-medium text-slate-700 mb-1">"${props.text || ''}"</p>
                ${props.author ? `<cite class="text-[8.5px] font-black text-slate-500 not-italic">— ${props.author}</cite>` : ''}
              </blockquote>
            `;
          case 'cta':
            return `
              <div class="text-center my-3">
                <a href="#" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[9.5px] px-4 py-2 rounded-lg shadow-md transition duration-150 ease-in-out">
                  ${props.label || 'Accept Proposal'}
                </a>
              </div>
            `;
          default:
            return '';
        }
      }

      case 'text':
      case 'section':
        return `
          <div class="text-[9.5px] text-slate-700 leading-normal font-medium opacity-90">
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
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Alex+Brush&family=Caveat:wght@400;700&family=Mrs+Saint+Delafield&family=Monsieur+La+Doulaise&family=Parisienne&family=Pinyon+Script&family=Satisfy&display=swap');
    @page { margin: 0; size: A4; }
    body { 
      font-family: 'Inter', sans-serif; 
      background-color: white; 
      margin: 0; 
      padding: 0;
      -webkit-print-color-adjust: exact; 
      color: #1e293b;
      font-size: 10px;
    }
    
    table.master-container { 
      width: 100%; 
      border-collapse: collapse; 
    }

    .header-space { height: 6mm; }
    .footer-space { height: 6mm; }
    
    table.report-container { 
      width: 100%; 
      border-collapse: collapse; 
      table-layout: fixed;
    }
    
    .footer-space { height: 40px; }
    
    .footer-fixed {
      position: fixed;
      bottom: 5mm;
      left: 8mm;
      right: 8mm;
      height: 35px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: white;
      border-top: 1px solid #f1f5f9;
      padding-top: 4px;
      page-break-inside: avoid;
    }

    .page-border {
      position: fixed;
      top: 5mm;
      left: 8mm;
      right: 8mm;
      bottom: 5mm;
      border: 1px solid #f1f5f9;
      pointer-events: none;
      z-index: -100;
    }

    .avoid-break { page-break-inside: avoid; }
    .block-container { 
      margin-bottom: 10px;
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
        <td class="px-10">
          <div class="main-wrapper">
            ${blocks.map((block: any) => {
              if (block.type === 'cover') return renderBlock(block);
              
              const shouldAvoidSplit = ['pricing', 'signature'].includes(block.type);
              const isComponent = block.type === 'component';
              
              return `
                <div class="block-container ${shouldAvoidSplit ? 'avoid-break' : ''}">
                   ${!isComponent ? `
                     <div style="page-break-after: avoid; margin-bottom: 10px;">
                        <div class="flex items-center gap-4">
                           <h2 class="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded tracking-widest uppercase">${getBlockTitle(block)}</h2>
                           <div class="flex-1 h-px bg-slate-100"></div>
                        </div>
                     </div>
                   ` : ''}
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
