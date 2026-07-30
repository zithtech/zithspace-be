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
      case 'text': return 'Executive Summary';
      case 'pricing': return 'Investment & Costing';
      case 'scope': return 'Project Scope';
      case 'timeline': return 'Schedule & Timeline';
      case 'signature': return 'Agreement & Sign-Off';
      case 'cover': return 'Cover';
      case 'section': return 'Additional Details';
      default: return block.type ? block.type.charAt(0).toUpperCase() + block.type.slice(1) : 'Section';
    }
  };

  const renderBlock = (block: any) => {
    const data = block.data || {};

    switch (block.type) {
      case 'cover': {
        const logo = data.logoUrl || data.logo;
        const theme = data.theme || 'elegant-classic';

        const rawTitle = data.title || proposal.title || 'PROJECT PROPOSAL';
        const titleWords = rawTitle.trim().toUpperCase().split(/\s+/);
        let titlePart1 = 'PROJECT';
        let titlePart2 = 'PROPOSAL';

        if (titleWords.length === 1 && titleWords[0] !== '') {
          titlePart1 = 'PROJECT';
          titlePart2 = titleWords[0];
        } else if (titleWords.length > 1) {
          const mid = Math.ceil(titleWords.length / 2);
          titlePart1 = titleWords.slice(0, mid).join(' ');
          titlePart2 = titleWords.slice(mid).join(' ');
        }

        let titleFontSize = 64;
        if (rawTitle.length > 40) {
          titleFontSize = 42;
        } else if (rawTitle.length > 25) {
          titleFontSize = 52;
        }

        const senderSection = `
            <div style="position: absolute; bottom: 80px; left: 100px; z-index: 5; font-family: 'Inter', sans-serif;">
              <div style="font-size: 14px; font-weight: 700; color: ${theme === 'bold-dark' ? '#dc2626' : '#64748b'}; letter-spacing: 0.05em; margin-bottom: 12px;">PREPARED BY:</div>
              <div style="display: flex; flex-direction: column; gap: 4px; border-left: 2px solid ${theme === 'bold-dark' ? '#dc2626' : (theme === 'minimalist-light' ? '#10b981' : '#1e293b')}; padding-left: 16px;">
                <div style="font-size: 20px; font-weight: 800; color: ${theme === 'bold-dark' ? '#0f172a' : (theme === 'minimalist-light' ? '#10b981' : '#1e293b')};">
                  ${data.senderName || 'Your Name'}
                </div>
                ${(data.senderTitle || data.senderRole || data.senderPosition) ? `<div style="font-size: 15px; font-weight: 600; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">${data.senderTitle || data.senderRole || data.senderPosition}</div>` : `<div style="font-size: 15px; font-weight: 600; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">Manager</div>`}
                ${data.senderEmail ? `<div style="font-size: 14px; color: ${theme === 'bold-dark' ? '#334155' : '#475569'}; margin-top: 4px;">${data.senderEmail}</div>` : ''}
                ${data.senderPhone ? `<div style="font-size: 14px; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">${data.senderPhone}</div>` : ''}
                ${data.senderWebsite ? `<div style="font-size: 14px; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">${data.senderWebsite}</div>` : ''}
                ${data.senderAddress ? `<div style="font-size: 14px; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">${data.senderAddress}</div>` : ''}
              </div>
            </div>
        `;

        const clientSection = `
              <div style="margin-top: 50px; font-family: 'Inter', sans-serif;">
                <div style="font-size: 14px; font-weight: 700; color: ${theme === 'bold-dark' ? '#dc2626' : '#64748b'}; letter-spacing: 0.05em; margin-bottom: 12px;">PREPARED FOR:</div>
                <div style="display: flex; flex-direction: column; gap: 4px; border-left: 2px solid ${theme === 'bold-dark' ? '#dc2626' : (theme === 'minimalist-light' ? '#10b981' : '#1e293b')}; padding-left: 16px;">
                  <div style="font-size: 20px; font-weight: 800; color: ${theme === 'bold-dark' ? '#0f172a' : (theme === 'minimalist-light' ? '#10b981' : '#1e293b')};">
                    ${data.clientName || data.clientCompany || 'Client Name'}
                  </div>
                  ${data.clientCompany && data.clientName !== data.clientCompany ? `<div style="font-size: 15px; font-weight: 600; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">${data.clientCompany}</div>` : ''}
                  ${data.clientEmail ? `<div style="font-size: 14px; color: ${theme === 'bold-dark' ? '#334155' : '#475569'}; margin-top: 4px;">${data.clientEmail}</div>` : ''}
                  ${data.clientPhone ? `<div style="font-size: 14px; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">${data.clientPhone}</div>` : ''}
                  ${data.clientAddress ? `<div style="font-size: 14px; color: ${theme === 'bold-dark' ? '#334155' : '#475569'};">${data.clientAddress}</div>` : ''}
                </div>
              </div>
        `;

        const topRightLogo = `
            <div style="position: absolute; top: 80px; right: 100px; z-index: 5; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
              <span style="font-size: 18px; font-weight: 700; color: ${theme === 'bold-dark' ? '#dc2626' : '#0f172a'}; letter-spacing: 0.02em;">${data.senderCompany || 'Salford & Co.'}</span>
              ${logo ? `<img src="${logo}" style="height: 64px; width: auto; object-fit: contain; border-radius: 4px;" />` : `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${theme === 'bold-dark' ? '#dc2626' : '#1e293b'}" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
              `}
            </div>
        `;

        if (theme === 'minimalist-light') {
          return `
            <div class="cover-page" style="position: relative; height: 297mm; width: 100%; display: flex; flex-direction: column; box-sizing: border-box; background: #ffffff; overflow: hidden; margin: 0; padding: 0; font-family: 'Inter', sans-serif;">
              <!-- Top Right Waves -->
              <svg style="position: absolute; top: 0; right: 0; width: 500px; height: 600px; z-index: 2;" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 20 0 C 40 30, 80 60, 100 90 L 100 0 Z" fill="#1e293b" />
                <path d="M 40 0 C 50 20, 85 45, 100 70 L 100 0 Z" fill="#10b981" />
                <path d="M 60 0 C 65 10, 90 30, 100 50 L 100 0 Z" fill="#1e293b" />
              </svg>

              <!-- Bottom Left Waves -->
              <svg style="position: absolute; bottom: 0; left: 0; width: 100%; height: 250px; z-index: 2;" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 0 30 C 30 35, 70 80, 100 100 L 0 100 Z" fill="#1e293b" />
                <path d="M 0 50 C 20 50, 50 85, 80 100 L 0 100 Z" fill="#10b981" />
                <path d="M 0 70 C 15 70, 35 90, 60 100 L 0 100 Z" fill="#1e293b" />
              </svg>

              ${topRightLogo.replace('right: 100px;', 'left: 100px; right: auto; text-align: left; align-items: flex-start;')}

              <div style="position: absolute; top: 220px; left: 100px; z-index: 5; width: 55%; max-width: 650px;">
                <div style="font-size: ${titleFontSize}px; font-weight: 800; color: #1e293b; line-height: 1.15; letter-spacing: -0.02em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                  ${titlePart1}
                </div>
                <div style="font-size: ${titleFontSize}px; font-weight: 800; color: #1e293b; line-height: 1.15; letter-spacing: -0.02em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                  ${titlePart2}
                </div>

                <div style="margin-top: 60px;">
                  ${senderSection.replace('position: absolute; bottom: 80px; left: 100px;', 'position: relative; margin-bottom: 40px;')}
                  ${clientSection.replace('margin-top: 50px;', 'margin-top: 0;')}
                </div>
              </div>
            </div>
          `;
        }

        if (theme === 'bold-dark') {
          return `
            <div class="cover-page" style="position: relative; height: 297mm; width: 100%; display: flex; flex-direction: column; box-sizing: border-box; background: #f8fafc; overflow: hidden; margin: 0; padding: 0; font-family: 'Inter', sans-serif;">
              <!-- Top right dotted pattern -->
              <div style="position: absolute; top: -50px; right: -50px; width: 300px; height: 300px; background-image: radial-gradient(#dc2626 2px, transparent 2px); background-size: 16px 16px; opacity: 0.2; transform: rotate(45deg); z-index: 1;"></div>
              
              <!-- Top left geometric blocks -->
              <svg style="position: absolute; top: 0; left: 0; width: 300px; height: 300px; z-index: 2;" viewBox="0 0 300 300" preserveAspectRatio="none">
                <polygon points="0,0 300,0 0,300" fill="#334155" />
                <polygon points="0,0 200,0 0,200" fill="#dc2626" />
              </svg>

              <!-- Bottom right geometric blocks -->
              <svg style="position: absolute; bottom: 0; right: 0; width: 600px; height: 500px; z-index: 2;" viewBox="0 0 600 500" preserveAspectRatio="none">
                <polygon points="0,500 600,0 600,500" fill="#475569" />
                <polygon points="120,500 600,100 600,500" fill="#1e293b" />
                <polygon points="240,500 600,200 600,500" fill="#dc2626" />
              </svg>

              <!-- Top Right Logo -->
              ${topRightLogo}

              <!-- Main Title & Client -->
              <div style="position: absolute; top: 240px; left: 100px; z-index: 5; max-width: 650px;">
                <div style="font-size: ${titleFontSize}px; font-weight: 900; color: #0f172a; line-height: 1.15; letter-spacing: -0.02em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                  ${titlePart1}
                </div>
                <div style="font-size: ${titleFontSize}px; font-weight: 900; color: #dc2626; line-height: 1.15; letter-spacing: -0.02em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                  ${titlePart2}
                </div>

                <div style="margin-top: 60px;">
                  ${clientSection.replace('margin-top: 50px;', 'margin-top: 0;')}
                  <div style="height: 40px;"></div>
                  ${senderSection.replace('position: absolute; bottom: 80px; left: 100px;', 'position: relative;')}
                </div>
              </div>
            </div>
          `;
        }

        if (theme === 'elegant-classic') {
          return `
            <div class="cover-page" style="position: relative; height: 297mm; width: 100%; display: flex; flex-direction: column; box-sizing: border-box; background: #ffffff; overflow: hidden; margin: 0; padding: 0; font-family: 'Inter', sans-serif;">
              <!-- Right side vertical wave -->
              <svg style="position: absolute; top: 0; right: 0; width: 45%; height: 100%; z-index: 1;" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 50 0 C 20 40, 90 60, 40 100 L 100 100 L 100 0 Z" fill="#1e293b" />
                <path d="M 40 0 C 10 40, 80 60, 30 100" fill="none" stroke="#1f2937" stroke-width="4" vector-effect="non-scaling-stroke" />
              </svg>

              <!-- Top Left Logo -->
              ${topRightLogo.replace('right: 100px;', 'left: 100px; right: auto; text-align: left; align-items: flex-start;')}

              <div style="position: absolute; top: 220px; left: 100px; z-index: 5; width: 50%; max-width: 650px;">
                <div style="font-size: ${titleFontSize}px; font-weight: 700; color: #1e293b; line-height: 1.15; letter-spacing: 0.05em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                  ${titlePart1}
                </div>
                <div style="font-size: ${titleFontSize}px; font-weight: 700; color: #1e293b; line-height: 1.15; letter-spacing: 0.05em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                  ${titlePart2}
                </div>

                <div style="margin-top: 80px;">
                  ${clientSection.replace('margin-top: 50px;', 'margin-top: 0;')}
                </div>
              </div>

              ${senderSection}
            </div>
          `;
        }

        // Default fallback: modern-blue
        return `
          <div class="cover-page" style="position: relative; height: 297mm; width: 100%; display: flex; flex-direction: column; box-sizing: border-box; background: white; overflow: hidden; margin: 0; padding: 0; font-family: 'Inter', sans-serif;">
            
            <!-- Light blue chevron -->
            <div style="position: absolute; top: -350px; left: -350px; width: 700px; height: 700px; transform: rotate(45deg); border: 20px solid #7dd3fc; border-radius: 24px; z-index: 1;"></div>
            <!-- Bright blue solid -->
            <div style="position: absolute; top: -300px; left: -300px; width: 600px; height: 600px; transform: rotate(45deg); background: #0ea5e9; border-radius: 24px; z-index: 2;"></div>
            <!-- Dark blue solid -->
            <div style="position: absolute; top: -250px; left: -250px; width: 500px; height: 500px; transform: rotate(45deg); background: linear-gradient(135deg, #1e40af, #020617); border-radius: 24px; z-index: 3; box-shadow: 0 10px 30px rgba(0,0,0,0.15);"></div>

            <!-- Bright blue solid -->
            <div style="position: absolute; bottom: -350px; right: -350px; width: 700px; height: 650px; transform: rotate(45deg); background: #0ea5e9; border-radius: 32px; z-index: 2;"></div>
            <!-- Dark blue solid -->
            <div style="position: absolute; bottom: -250px; right: -300px; width: 500px; height: 600px; transform: rotate(45deg); background: linear-gradient(135deg, #0f172a, #1e3a8a); border-radius: 32px; z-index: 3; box-shadow: 0 10px 30px rgba(0,0,0,0.2);"></div>

            ${topRightLogo}

            <!-- Main Title -->
            <div style="position: absolute; top: 280px; left: 100px; z-index: 5; max-width: 650px;">
              <div style="font-size: ${titleFontSize}px; font-weight: 900; color: #0c4a6e; line-height: 1.15; letter-spacing: 0.02em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                ${titlePart1}
              </div>
              <div style="font-size: ${titleFontSize}px; font-weight: 900; color: #0c4a6e; line-height: 1.15; letter-spacing: 0.02em; text-transform: uppercase; word-wrap: break-word; overflow-wrap: break-word;">
                ${titlePart2}
              </div>

              ${clientSection}
            </div>

            ${senderSection}
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
                <div class="flex flex-wrap items-start gap-2 mb-2.5">
                   <span style="background: rgba(59, 130, 246, 0.1); color: #2563eb; padding: 2px 7px; border-radius: 20px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid rgba(59, 130, 246, 0.22); flex-shrink: 0; max-width: 100%; white-space: normal;">Phase ${idx + 1}</span>
                   <h3 class="text-[12px] font-extrabold text-slate-900 leading-tight" style="flex: 1 1 200px; min-width: 0;">${m.title || 'Untitled Phase'}</h3>
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
              <div class="flex flex-wrap items-start gap-2 mb-2 mt-1">
                <span style="display: inline-flex; align-items: center; font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #2563eb; background: #eff6ff; border: 1px solid rgba(37,99,235,0.22); padding: 2px 7px; flex-shrink: 0; max-width: 100%; white-space: normal; border-radius: 4px;">${props.badge || 'PHASE 1'}</span>
                <h3 style="font-size: 13.5px; font-weight: 800; color: #0f172a; margin: 0; flex: 1 1 260px; min-width: 0;">${props.title || 'Phase Title'}</h3>
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
          case 'video': {
            const videoSrc = props.src || props.url || '';
            const hasVideo = !!videoSrc;
            const isBase64 = videoSrc.startsWith('data:');
            let displayLink = videoSrc;
            if (isBase64) {
              displayLink = 'Uploaded Video';
            }
            return `
              <div class="mb-2 text-center bg-slate-50 border border-slate-200 rounded-lg p-3 avoid-break">
                <span class="text-blue-500 text-sm mr-1.5">🎥</span>
                <span class="text-[9px] font-bold text-slate-700">Video:</span>
                ${hasVideo ? (
                  isBase64 ? `
                    <span class="text-[9px] text-slate-600 ml-0.5 font-semibold">${displayLink} ${props.caption ? `(${props.caption})` : ''}</span>
                  ` : `
                    <a href="${videoSrc}" target="_blank" class="text-[9px] text-blue-600 underline ml-0.5">${displayLink}</a>
                  `
                ) : `
                  <span class="text-[9px] text-slate-400 ml-0.5 font-medium">No Link Provided</span>
                `}
                ${props.caption && !isBase64 ? `<div class="text-[8.5px] text-slate-400 font-medium mt-1">${props.caption}</div>` : ''}
              </div>
            `;
          }
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
      font-size: 16px;
      line-height: 1.6;
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
      margin-bottom: 32px;
      page-break-inside: auto; 
    }

    * {
      word-break: break-word;
      overflow-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="page-border"></div>

  <!-- Cover Page (Placed outside the master table for full bleed backgrounds) -->
  ${(() => {
      const coverBlock = blocks.find((b: any) => b.type === 'cover');
      if (!coverBlock) return '';
      return `
      <div style="page-break-after: always; height: 297mm; width: 100%; overflow: hidden; position: relative; box-sizing: border-box; margin: 0; padding: 0;">
        ${renderBlock(coverBlock)}
      </div>
    `;
    })()}

  <!-- Table of Contents Page -->
  ${(() => {
      const tocItems = blocks.filter((b: any) => {
        const title = getBlockTitle(b);
        if (proposal.title && title && title.trim().toLowerCase() === proposal.title.trim().toLowerCase()) {
            return false;
        }

        const data = b.data || {};
        const hasTitle = b.title || data.title || data.heading;
        if (hasTitle) return true;
        const validTypes = ['text', 'pricing', 'scope', 'timeline', 'signature', 'section'];
        return validTypes.includes(b.type);
      });

      if (tocItems.length === 0) return '';
      
      return `
      <div style="page-break-after: always; padding: 100px 120px; box-sizing: border-box; height: 297mm; background: white; font-family: 'Inter', sans-serif;">
        <h2 style="font-size: 48px; font-weight: 900; color: #0c4a6e; margin-bottom: 60px; text-transform: uppercase; letter-spacing: 0.02em;">TABLE OF CONTENTS</h2>
        <div style="display: flex; flex-direction: column;">
          ${tocItems.map((block: any, index: number) => {
             let title = getBlockTitle(block);
             if (title === title.toUpperCase() && title.length > 3) {
                 title = title.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
             }
             return `
               <div style="display: flex; align-items: center; border-bottom: 1px solid #f1f5f9; padding: 24px 0;">
                 <div style="font-size: 24px; font-weight: 800; color: #0ea5e9; margin-right: 40px; min-width: 40px;">
                   ${String(index + 1).padStart(2, '0')}
                 </div>
                 <div style="font-size: 20px; font-weight: 600; color: #334155;">
                   ${title}
                 </div>
               </div>
             `;
          }).join('')}
        </div>
      </div>
      `;
  })()}

  <table class="master-container">
    <thead><tr><td class="header-space"></td></tr></thead>
    <tbody>
      <tr>
        <td class="px-10">
          <div class="main-wrapper">
            ${blocks.filter((block: any) => !['cover', 'toc'].includes(block.type)).map((block: any) => {
      const shouldAvoidSplit = ['pricing', 'signature'].includes(block.type);
      const isComponent = block.type === 'component';

      return `
                <div class="block-container ${shouldAvoidSplit ? 'avoid-break' : ''}">
                   ${!isComponent ? `
                     <div style="page-break-after: avoid; margin-bottom: 20px;">
                        <div class="flex items-center gap-4">
                           <h2 class="text-[12px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded tracking-widest uppercase">${getBlockTitle(block)}</h2>
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
                <div class="h-px w-12 bg-slate-200"></div>
                <span class="text-[12px] font-black text-slate-400 uppercase tracking-[0.4em]">End of Proposal</span>
                <div class="h-px w-12 bg-slate-200"></div>
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
