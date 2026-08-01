import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import puppeteer from 'puppeteer';
import { Document, Packer, Paragraph, TextRun, ImageRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, BorderStyle, ShadingType, AlignmentType } from 'docx';
import HTMLtoDOCX from 'html-to-docx';
import { getFileBufferFromR2 } from '../utils/r2Client';
import { getStructure } from '../modules/payroll/services/structure.service';
import { calcStructure, CalcLineInput } from '../modules/payroll/services/structureCalc';

export interface GenerateLetterDto {
  templateId: string;
  referenceEntityId?: string;
  referenceEntityType?: string;
  documentNumber?: string;
  values: Record<string, string>;
}

export class GeneratedLetterService {
  static async generateSalaryStructureTableHtml(tenantId: string, ctcInput?: string, salaryStructureId?: string): Promise<string> {
    const numStr = ctcInput ? String(ctcInput).replace(/[^0-9.]/g, '') : '';
    const parsed = numStr ? parseFloat(numStr) : 0;

    let annualCtc = parsed > 0 ? (parsed <= 50000 ? Math.round(parsed * 12) : Math.round(parsed)) : 120000;
    let monthlyGross = Math.round(annualCtc / 12);

    let rowsHtml = '';
    let totalDeductions = 0;

    const formatINR = (val: number) => '₹' + val.toLocaleString('en-IN');

    if (salaryStructureId && tenantId) {
      try {
        const structure = await getStructure({ tenantId, userId: 'SYSTEM' }, salaryStructureId);

        const calcInputs = structure.lines.map(l => ({
          key: l.id,
          code: l.code,
          category: l.category,
          calculationType: l.calculationType,
          percentageOf: l.percentageOf,
          value: l.value,
          displayOrder: l.displayOrder,
        } as CalcLineInput));

        const breakdown = calcStructure(monthlyGross, calcInputs);
        monthlyGross = breakdown.grossSalary;
        annualCtc = monthlyGross * 12;
        totalDeductions = breakdown.totalDeductions;

        for (const line of breakdown.lines) {
          const mAmt = line.calculatedAmount;
          const aAmt = mAmt * 12;
          const categoryDisplay = line.category === 'earning' ? '● Earning' : line.category === 'deduction' ? '● DEDUCTION' : '● ' + line.category.toUpperCase();
          const categoryColor = line.category === 'earning' ? '#10b981' : line.category === 'deduction' ? '#ef4444' : '#3b82f6';

          let calcTypeDisplay = 'Fixed';
          let percentageDisplay = '-';
          if (line.calculationType === 'percentage') {
            calcTypeDisplay = line.percentageOf ? `% of ${line.percentageOf.charAt(0).toUpperCase() + line.percentageOf.slice(1)}` : '%';
            percentageDisplay = `${line.value}%`;
          }

          const componentName = structure.lines.find(l => l.id === line.key)?.name || line.code;

          rowsHtml += `<tr>` +
            `<td style="padding: 10px 14px; border: 1px solid #cbd5e1;">` +
            `<div style="font-weight: 600; color: #1e293b; font-size: 14px;">${componentName}</div>` +
            `<div style="font-size: 11px; color: ${categoryColor}; font-weight: 600; margin-top: 2px;">${categoryDisplay}</div>` +
            `</td>` +
            `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; color: #475569;">${calcTypeDisplay}</td>` +
            `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #334155;">${percentageDisplay}</td>` +
            `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(mAmt)}</td>` +
            `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(aAmt)}</td>` +
            `</tr>`;
        }
      } catch (err) {
        console.error("Failed to generate custom salary table", err);
      }
    }

    if (!rowsHtml) {
      const mBasic = Math.round(monthlyGross * 0.40);
      const aBasic = mBasic * 12;
      const mHra = Math.round(monthlyGross * 0.20);
      const aHra = mHra * 12;
      const mConv = Math.round(monthlyGross * 0.10);
      const aConv = mConv * 12;
      const mMed = monthlyGross - (mBasic + mHra + mConv);
      const aMed = mMed * 12;

      rowsHtml = `<tr>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1;">` +
        `<div style="font-weight: 600; color: #1e293b; font-size: 14px;">Basic</div>` +
        `<div style="font-size: 11px; font-weight: 600; margin-top: 2px;"><span style="color: #10b981">● Earning</span></div>` +
        `</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; color: #475569;">% of Gross</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #334155;">40%</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(mBasic)}</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(aBasic)}</td>` +
        `</tr>` +
        `<tr>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1;">` +
        `<div style="font-weight: 600; color: #1e293b; font-size: 14px;">House Rent Allowance</div>` +
        `<div style="font-size: 11px; font-weight: 600; margin-top: 2px;"><span style="color: #10b981">● Earning</span></div>` +
        `</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; color: #475569;">% of Gross</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #334155;">20%</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(mHra)}</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(aHra)}</td>` +
        `</tr>` +
        `<tr>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1;">` +
        `<div style="font-weight: 600; color: #1e293b; font-size: 14px;">Conveyance Allowance</div>` +
        `<div style="font-size: 11px; font-weight: 600; margin-top: 2px;"><span style="color: #10b981">● Earning</span></div>` +
        `</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; color: #475569;">% of Gross</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #334155;">10%</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(mConv)}</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(aConv)}</td>` +
        `</tr>` +
        `<tr>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1;">` +
        `<div style="font-weight: 600; color: #1e293b; font-size: 14px;">Medical Allowance</div>` +
        `<div style="font-size: 11px; font-weight: 600; margin-top: 2px;"><span style="color: #10b981">● Earning</span></div>` +
        `</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; color: #475569;">% of Gross</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #334155;">30%</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(mMed)}</td>` +
        `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; font-weight: 600; color: #1e293b; text-align: right;">${formatINR(aMed)}</td>` +
        `</tr>`;
    }

    const netPay = Math.round(monthlyGross - totalDeductions);

    return `<div data-salary-structure="true" style="margin-top: 20px; margin-bottom: 20px; font-family: 'Inter', system-ui, -apple-system, sans-serif;">` +
      `<div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 10px;">Salary Structure</div>` +
      `<table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; font-size: 13px; text-align: left; background: #ffffff;">` +
      `<thead>` +
      `<tr style="background-color: #f8fafc; border-bottom: 1px solid #cbd5e1; color: #475569;">` +
      `<th style="padding: 10px 14px; font-weight: 600; border: 1px solid #cbd5e1;">SALARY COMPONENT</th>` +
      `<th style="padding: 10px 14px; font-weight: 600; border: 1px solid #cbd5e1;">CALCULATION TYPE</th>` +
      `<th style="padding: 10px 14px; font-weight: 600; border: 1px solid #cbd5e1;">PERCENTAGE</th>` +
      `<th style="padding: 10px 14px; font-weight: 600; border: 1px solid #cbd5e1; text-align: right;">MONTHLY AMOUNT</th>` +
      `<th style="padding: 10px 14px; font-weight: 600; border: 1px solid #cbd5e1; text-align: right;">ANNUAL AMOUNT</th>` +
      `</tr>` +
      `</thead>` +
      `<tbody>` +
      rowsHtml +
      `</tbody>` +
      `<tfoot>` +
      `<tr style="background-color: #f8fafc; font-weight: 600; color: #475569; border-top: 2px solid #cbd5e1;">` +
      `<td colspan="3" style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: right;">Total Gross</td>` +
      `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: right;">${formatINR(monthlyGross)}</td>` +
      `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: right;">${formatINR(monthlyGross * 12)}</td>` +
      `</tr>` +
      `<tr style="background-color: #f8fafc; font-weight: 600; color: #ef4444;">` +
      `<td colspan="3" style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: right;">Total Deductions</td>` +
      `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: right;">${totalDeductions > 0 ? '- ' + formatINR(totalDeductions) : '₹0'}</td>` +
      `<td style="padding: 10px 14px; border: 1px solid #cbd5e1; text-align: right;">${totalDeductions > 0 ? '- ' + formatINR(totalDeductions * 12) : '₹0'}</td>` +
      `</tr>` +
      `<tr style="background-color: #f1f5f9; font-weight: 700; color: #0f172a;">` +
      `<td colspan="3" style="padding: 12px 14px; border: 1px solid #cbd5e1; text-align: right;">Net Pay</td>` +
      `<td style="padding: 12px 14px; border: 1px solid #cbd5e1; text-align: right;">${formatINR(netPay)}</td>` +
      `<td style="padding: 12px 14px; border: 1px solid #cbd5e1; text-align: right;">${formatINR(netPay * 12)}</td>` +
      `</tr>` +
      `<tr style="background-color: #e2e8f0; font-weight: 800; color: #0f172a; border-top: 2px solid #94a3b8;">` +
      `<td colspan="3" style="padding: 14px 14px; border: 1px solid #cbd5e1; text-align: right; text-transform: uppercase;">Total CTC</td>` +
      `<td style="padding: 14px 14px; border: 1px solid #cbd5e1; text-align: right; color: #10b981;">✓ Balanced (${formatINR(monthlyGross)})</td>` +
      `<td style="padding: 14px 14px; border: 1px solid #cbd5e1; text-align: right; font-size: 15px;">${formatINR(annualCtc)} / yr</td>` +
      `</tr>` +
      `</tfoot>` +
      `</table>` +
      `</div>`;
  }

  /**
   * Substitute placeholder keys in HTML string with actual values
   */
  static async substitutePlaceholders(
    tenantId: string,
    html: string,
    values: Record<string, string>,
    placeholders?: Array<{ placeholderKey: string; placeholderLabel?: string }>
  ): Promise<string> {
    let output = html;

    const defaultLabels: Record<string, string> = {
      'employee_name': 'Employee Name',
      'work_email': 'Work Email',
      'designation': 'Designation / Title',
      'department': 'Department',
      'date_of_joining': 'Date of Joining',
      'salary_ctc': 'Annual Salary (CTC)',
      'reporting_manager': 'Reporting Manager',
      'current_date': 'Current Date',
      'company_name': 'Company Name',
    };

    const labelMap: Record<string, string> = { ...defaultLabels };
    if (placeholders && Array.isArray(placeholders)) {
      placeholders.forEach((p) => {
        if (p && p.placeholderLabel) {
          labelMap[p.placeholderKey] = p.placeholderLabel;
        }
      });
    }

    for (const [key, val] of Object.entries(values)) {
      if (!val || val.trim() === '') {
        continue;
      }

      const label = labelMap[key];
      const humanized = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

      // 1. Replace any span explicitly tagged by data-placeholder-key or data-id
      const attrSpanRegex = new RegExp(
        `<span[^>]*data-(?:placeholder-key|id)="${key}"[^>]*>[^<]*<\\/span>`,
        'gi'
      );
      output = output.replace(attrSpanRegex, val + (key === 'salary_ctc' ? '<!-- SALARY_STRUCTURE_MARKER -->' : ''));

      const searchTerms = Array.from(
        new Set([key, label, key.replace(/_/g, ' '), humanized].filter(Boolean))
      ) as string[];

      for (const term of searchTerms) {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 2. Replace any span containing {{Term}} or {{key:Term}}
        const contentSpanRegex = new RegExp(
          `<span[^>]*>[^<]*\\{\\{\\s*(?:${key}:)?${escapedTerm}\\s*\\}\\}[^<]*<\\/span>`,
          'gi'
        );
        output = output.replace(contentSpanRegex, val + (key === 'salary_ctc' ? '<!-- SALARY_STRUCTURE_MARKER -->' : ''));

        // 3. Replace plain {{Term}} anywhere in text
        const plainRegex = new RegExp(
          `\\{\\{\\s*(?:${key}:)?${escapedTerm}\\s*\\}\\}`,
          'gi'
        );
        output = output.replace(plainRegex, val + (key === 'salary_ctc' ? '<!-- SALARY_STRUCTURE_MARKER -->' : ''));
      }
    }

    const ctcVal = values['salary_ctc'] || '';
    const salaryStructureId = values['salary_structure_id'];
    if (output.includes('data-salary-structure="true"') || output.includes('SALARY COMPONENT') || output.includes('House Rent Allowance')) {
      if (ctcVal && ctcVal.trim() !== '') {
        const salaryHtml = await GeneratedLetterService.generateSalaryStructureTableHtml(tenantId, ctcVal, salaryStructureId);
        let replaced = false;

        // 1. First try replacing a div tagged with data-salary-structure="true" without regex greediness across tables
        const divMatchIdx = output.search(/<div[^>]*data-salary-structure="true"[^>]*>/i);
        if (divMatchIdx !== -1) {
          const endTableIdx = output.indexOf('</table>', divMatchIdx);
          if (endTableIdx !== -1) {
            const endDivIdx = output.indexOf('</div>', endTableIdx);
            const closeIdx = (endDivIdx !== -1 && (endDivIdx - endTableIdx) < 80) ? endDivIdx + 6 : endTableIdx + 8;
            output = output.substring(0, divMatchIdx) + salaryHtml + output.substring(closeIdx);
            replaced = true;
          }
        }

        // 2. Otherwise find the specific table containing SALARY COMPONENT or House Rent Allowance
        if (!replaced) {
          const keywordIdx = output.search(/SALARY COMPONENT|House Rent Allowance/i);
          if (keywordIdx !== -1) {
            let tableStartIdx = output.lastIndexOf('<table', keywordIdx);
            const tableEndIdx = output.indexOf('</table>', keywordIdx);
            if (tableStartIdx !== -1 && tableEndIdx !== -1) {
              // Check if right before <table there is a title/div like <div ...>Salary Structure</div> that belongs to the table
              const precedingText = output.substring(Math.max(0, tableStartIdx - 300), tableStartIdx);
              const titleMatch = precedingText.match(/<(div|p|h[1-6]|span|b|strong)[^>]*>\s*(?:<b>|<strong>)?\s*Salary Structure\s*(?:<\/b>|<\/strong>)?\s*<\/\1>\s*$/i);
              if (titleMatch && titleMatch.index !== undefined) {
                tableStartIdx = Math.max(0, tableStartIdx - 300) + titleMatch.index;
              }
              // Also check if wrapped in an outer div
              const beforeOuter = output.substring(Math.max(0, tableStartIdx - 200), tableStartIdx);
              const outerDivMatch = beforeOuter.match(/<div[^>]*>\s*$/i);
              const afterTable = output.substring(tableEndIdx + 8, Math.min(output.length, tableEndIdx + 100));
              const afterDivMatch = afterTable.match(/^\s*<\/div>/i);
              let closeIdx = tableEndIdx + 8;
              if (outerDivMatch && outerDivMatch.index !== undefined && afterDivMatch && afterDivMatch[0]) {
                tableStartIdx = Math.max(0, tableStartIdx - 200) + outerDivMatch.index;
                closeIdx = tableEndIdx + 8 + afterDivMatch[0].length;
              }
              output = output.substring(0, tableStartIdx) + salaryHtml + output.substring(closeIdx);
              replaced = true;
            }
          }
        }
      }
    } else {
      if (!output.includes('<!-- SALARY_STRUCTURE_MARKER -->')) {
        const salarySpanRegex = /<span[^>]*data-(?:placeholder-key|id)="salary_ctc"[^>]*>[^<]*<\/span>/i;
        if (salarySpanRegex.test(output)) {
          output = output.replace(salarySpanRegex, (match) => match + '<!-- SALARY_STRUCTURE_MARKER -->');
        } else {
          const salaryPlainRegex = /\{\{\s*(?:salary_ctc:)?Annual Salary \(CTC\)\s*\}\}/i;
          if (salaryPlainRegex.test(output)) {
            output = output.replace(salaryPlainRegex, (match) => match + '<!-- SALARY_STRUCTURE_MARKER -->');
          } else {
            const salaryKeyRegex = /\{\{\s*salary_ctc\s*\}\}/i;
            if (salaryKeyRegex.test(output)) {
              output = output.replace(salaryKeyRegex, (match) => match + '<!-- SALARY_STRUCTURE_MARKER -->');
            }
          }
        }
      }

      if (output.includes('<!-- SALARY_STRUCTURE_MARKER -->')) {
        const markerIdx = output.indexOf('<!-- SALARY_STRUCTURE_MARKER -->');
        const afterMarker = output.substring(markerIdx + '<!-- SALARY_STRUCTURE_MARKER -->'.length);
        const closeTagMatch = afterMarker.match(/(?:<\/p>|<\/li>|<\/div>|<br\s*\/?>|\n)/i);
        if (closeTagMatch && closeTagMatch.index !== undefined && closeTagMatch.index < 300) {
          const insertIdx = markerIdx + '<!-- SALARY_STRUCTURE_MARKER -->'.length + closeTagMatch.index + closeTagMatch[0].length;
          output = output.substring(0, insertIdx) + (await GeneratedLetterService.generateSalaryStructureTableHtml(tenantId, ctcVal, salaryStructureId)) + output.substring(insertIdx);
        } else {
          output = output.replace('<!-- SALARY_STRUCTURE_MARKER -->', '<br/>' + (await GeneratedLetterService.generateSalaryStructureTableHtml(tenantId, ctcVal, salaryStructureId)));
        }
      }
    }
    output = output.replace(/<!-- SALARY_STRUCTURE_MARKER -->/g, '');

    return output;
  }

  static async previewLetter(tenantId: string, templateId: string, values: Record<string, string>): Promise<string> {
    const template = await prisma.documentTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: { placeholders: true },
    });
    if (!template) {
      throw new Error('Template not found');
    }

    return await this.substitutePlaceholders(tenantId, template.editorContent, values, template.placeholders);
  }

  static async getGeneratedLetters(tenantId: string, filters?: { templateId?: string; categoryId?: string; status?: string; referenceEntityId?: string; search?: string }) {
    const where: Prisma.GeneratedDocumentWhereInput = { tenantId };

    if (filters?.templateId) where.templateId = filters.templateId;
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.status) where.status = filters.status;
    if (filters?.referenceEntityId) where.referenceEntityId = filters.referenceEntityId;
    if (filters?.search) {
      where.documentNumber = { contains: filters.search, mode: 'insensitive' };
    }

    return await prisma.generatedDocument.findMany({
      where,
      include: {
        template: { select: { id: true, templateName: true } },
        category: { select: { id: true, categoryName: true } },
        generatedBy: { select: { id: true, name: true, workEmail: true } },
        _count: { select: { values: true, files: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  static async getGeneratedLetterById(tenantId: string, id: string) {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id, tenantId },
      include: {
        template: {
          include: { placeholders: true },
        },
        category: true,
        values: true,
        files: true,
        generatedBy: { select: { id: true, name: true, workEmail: true } },
      },
    });

    if (!doc) {
      throw new Error('Generated document not found');
    }

    return doc;
  }

  static async generateLetter(tenantId: string, data: GenerateLetterDto, userId: string, ipAddress?: string) {
    const template = await prisma.documentTemplate.findFirst({
      where: { id: data.templateId, tenantId },
      include: { category: true },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const documentNumber = data.documentNumber || `DOC-${Date.now().toString().slice(-6)}`;

    return await prisma.$transaction(async (tx) => {
      const generatedDoc = await tx.generatedDocument.create({
        data: {
          tenantId,
          templateId: template.id,
          categoryId: template.categoryId || null,
          referenceEntityId: data.referenceEntityId || null,
          referenceEntityType: data.referenceEntityType || 'EMPLOYEE',
          documentNumber,
          status: 'GENERATED',
          generatedById: userId,
          docxFilePath: `/api/hrms/generated-letters/download-docx`, // Stream endpoint reference
          pdfFilePath: `/api/hrms/generated-letters/download-pdf`,   // Stream endpoint reference
        },
      });

      // Save exact placeholder values
      const valueEntries = Object.entries(data.values);
      if (valueEntries.length > 0) {
        await tx.generatedDocumentValue.createMany({
          data: valueEntries.map(([key, val]) => ({
            tenantId,
            generatedDocumentId: generatedDoc.id,
            placeholderKey: key,
            placeholderValue: val || '',
          })),
        });
      }

      // Record file metadata
      await tx.documentFile.createMany({
        data: [
          {
            tenantId,
            generatedDocumentId: generatedDoc.id,
            fileName: `${template.templateName.replace(/\s+/g, '_')}_${documentNumber}.pdf`,
            fileType: 'PDF',
            filePath: `/api/hrms/generated-letters/${generatedDoc.id}/download-pdf`,
            storageProvider: 'DynamicStream',
          },
          {
            tenantId,
            generatedDocumentId: generatedDoc.id,
            fileName: `${template.templateName.replace(/\s+/g, '_')}_${documentNumber}.docx`,
            fileType: 'DOCX',
            filePath: `/api/hrms/generated-letters/${generatedDoc.id}/download-docx`,
            storageProvider: 'DynamicStream',
          },
        ],
      });

      // Audit log
      await tx.documentAuditLog.create({
        data: {
          tenantId,
          module: 'Letter Generation',
          referenceId: generatedDoc.id,
          action: 'Generated',
          performedById: userId,
          ipAddress: ipAddress || null,
          remarks: `Generated document "${documentNumber}" from template "${template.templateName}"`,
        },
      });

      return await tx.generatedDocument.findUnique({
        where: { id: generatedDoc.id },
        include: {
          template: true,
          category: true,
          values: true,
          files: true,
        },
      });
    });
  }

  static async updateGeneratedLetter(tenantId: string, id: string, data: GenerateLetterDto, userId: string, ipAddress?: string) {
    const existingDoc = await prisma.generatedDocument.findFirst({
      where: { id, tenantId }
    });

    if (!existingDoc) {
      throw new Error('Generated document not found');
    }

    const template = await prisma.documentTemplate.findFirst({
      where: { id: data.templateId, tenantId },
      include: { category: true },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const documentNumber = data.documentNumber || existingDoc.documentNumber;

    return await prisma.$transaction(async (tx) => {
      const generatedDoc = await tx.generatedDocument.update({
        where: { id: existingDoc.id },
        data: {
          templateId: template.id,
          categoryId: template.categoryId || null,
          referenceEntityId: data.referenceEntityId || null,
          referenceEntityType: data.referenceEntityType || 'EMPLOYEE',
          documentNumber,
        },
      });

      // Delete old placeholder values
      await tx.generatedDocumentValue.deleteMany({
        where: { generatedDocumentId: existingDoc.id },
      });

      // Save exact placeholder values
      const valueEntries = Object.entries(data.values);
      if (valueEntries.length > 0) {
        await tx.generatedDocumentValue.createMany({
          data: valueEntries.map(([key, val]) => ({
            tenantId,
            generatedDocumentId: generatedDoc.id,
            placeholderKey: key,
            placeholderValue: val || '',
          })),
        });
      }

      // Update file metadata if necessary
      await tx.documentFile.deleteMany({
        where: { generatedDocumentId: existingDoc.id },
      });

      await tx.documentFile.createMany({
        data: [
          {
            tenantId,
            generatedDocumentId: generatedDoc.id,
            fileName: `${template.templateName.replace(/\\s+/g, '_')}_${documentNumber}.pdf`,
            fileType: 'PDF',
            filePath: `/api/hrms/generated-letters/${generatedDoc.id}/download-pdf`,
            storageProvider: 'DynamicStream',
          },
          {
            tenantId,
            generatedDocumentId: generatedDoc.id,
            fileName: `${template.templateName.replace(/\\s+/g, '_')}_${documentNumber}.docx`,
            fileType: 'DOCX',
            filePath: `/api/hrms/generated-letters/${generatedDoc.id}/download-docx`,
            storageProvider: 'DynamicStream',
          },
        ],
      });

      // Audit log
      await tx.documentAuditLog.create({
        data: {
          tenantId,
          module: 'Letter Generation',
          referenceId: generatedDoc.id,
          action: 'Updated',
          performedById: userId,
          ipAddress: ipAddress || null,
          remarks: `Updated document "${documentNumber}" from template "${template.templateName}"`,
        },
      });

      return await tx.generatedDocument.findUnique({
        where: { id: generatedDoc.id },
        include: {
          template: true,
          category: true,
          values: true,
          files: true,
        },
      });
    });
  }

  /**
   * Generate PDF buffer from substituted HTML using Puppeteer
   */
  static async generatePDFBuffer(htmlContent: string): Promise<Buffer> {
    let pageConfig: any = null;
    const configRegex = /<script\s+id="zith-page-config"\s+type="application\/json">([\s\S]*?)<\/script>/is;
    const match = configRegex.exec(htmlContent);
    if (match && match[1]) {
      try {
        pageConfig = JSON.parse(match[1]);
      } catch (e) {
        console.error('Failed to parse pageConfig', e);
      }
      htmlContent = htmlContent.replace(configRegex, '');
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: 600; }
            table[data-layout="side-by-side"], table[data-layout="side-by-side"] th, table[data-layout="side-by-side"] td,
            table[style*="border: none"] th, table[style*="border: none"] td,
            table[style*="border-style: none"] th, table[style*="border-style: none"] td,
            table[style*="border-width: 0"] th, table[style*="border-width: 0"] td {
              border: none !important;
              background: transparent !important;
              padding: 4px 0 !important;
            }
            h1, h2, h3 { color: #111827; margin-top: 24px; margin-bottom: 12px; }
            p { margin-bottom: 12px; }
            .html2pdf__page-break hr { display: none !important; border: none !important; opacity: 0 !important; }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });

      let pdfOptions: any = {
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      };

      if (pageConfig) {
        const replaceImagesToBase64 = async (html: string) => {
          if (!html) return html;
          const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          let match;
          let newHtml = html;

          const matches = [];
          while ((match = regex.exec(html)) !== null) {
            matches.push({ full: match[0], src: match[1] });
          }

          for (const m of matches) {
            if (m.src.startsWith('data:image')) continue;
            try {
              let buffer;
              try {
                buffer = await getFileBufferFromR2(m.src);
              } catch (e) {
                const res = await fetch(m.src);
                const arrayBuf = await res.arrayBuffer();
                buffer = Buffer.from(arrayBuf);
              }
              if (buffer) {
                let mimeType = 'image/jpeg';
                if (m.src.toLowerCase().endsWith('.png')) mimeType = 'image/png';
                else if (m.src.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
                else if (m.src.toLowerCase().endsWith('.svg')) mimeType = 'image/svg+xml';
                else if (m.src.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';

                const b64 = buffer.toString('base64');
                const newSrc = `data:${mimeType};base64,${b64}`;
                newHtml = newHtml.replace(m.src, newSrc);
              }
            } catch (e) {
              console.error('Failed to convert image to base64 for PDF', e);
            }
          }
          return newHtml;
        };

        if (pageConfig.headerHtml) pageConfig.headerHtml = await replaceImagesToBase64(pageConfig.headerHtml);
        if (pageConfig.footerHtml) pageConfig.footerHtml = await replaceImagesToBase64(pageConfig.footerHtml);

        if (pageConfig.marginTop) pdfOptions.margin.top = pageConfig.marginTop;
        if (pageConfig.marginBottom) pdfOptions.margin.bottom = pageConfig.marginBottom;
        if (pageConfig.marginLeft) pdfOptions.margin.left = pageConfig.marginLeft;
        if (pageConfig.marginRight) pdfOptions.margin.right = pageConfig.marginRight;

        const hasBorder = pageConfig.borderWidth && pageConfig.borderWidth !== '0' && pageConfig.borderWidth !== '0px';
        const hasHeader = !!pageConfig.headerHtml;
        const hasFooter = !!pageConfig.footerHtml;

        if (hasHeader || hasFooter) {
          const { headerHeight, footerHeight } = await page.evaluate(async (htmlHeader, htmlFooter) => {
            const measure = async (html: string) => {
              if (!html) return 0;
              // @ts-ignore
              const div = document.createElement('div');
              div.innerHTML = html;
              div.style.width = '100%';
              div.style.padding = '0 20mm';
              div.style.position = 'absolute';
              div.style.visibility = 'hidden';
              div.style.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
              div.style.fontSize = '14px';
              div.style.lineHeight = '1.6';
              div.style.boxSizing = 'border-box';
              div.style.textAlign = 'center';
              div.style.overflow = 'hidden';
              // @ts-ignore
              document.body.appendChild(div);

              const images = Array.from(div.querySelectorAll('img'));
              await Promise.all(images.map((img: any) => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                  img.onload = resolve;
                  img.onerror = resolve;
                });
              }));

              const height = div.offsetHeight;
              // @ts-ignore
              document.body.removeChild(div);
              return height;
            };
            return {
              headerHeight: await measure(htmlHeader),
              footerHeight: await measure(htmlFooter)
            };
          }, pageConfig.headerHtml || '', pageConfig.footerHtml || '');

          const parseMarginToPx = (val) => {
            if (!val) return 75; // ~20mm
            const num = parseFloat(val);
            if (val.includes('mm')) return num * 3.78;
            if (val.includes('cm')) return num * 37.8;
            if (val.includes('in')) return num * 96;
            if (val.includes('px')) return num;
            return num;
          };

          if (hasHeader) {
            const currentTop = parseMarginToPx(pdfOptions.margin.top);
            const neededTop = headerHeight + 20; // 20px buffer for slight padding
            if (neededTop > currentTop) {
              pdfOptions.margin.top = `${neededTop}px`;
            }
          }
          if (hasFooter) {
            const currentBottom = parseMarginToPx(pdfOptions.margin.bottom);
            const neededBottom = footerHeight + 20; // 20px buffer for slight padding
            if (neededBottom > currentBottom) {
              pdfOptions.margin.bottom = `${neededBottom}px`;
            }
          }
        }

        if (hasBorder || hasHeader || hasFooter) {
          pdfOptions.displayHeaderFooter = true;

          let headerTemplate = `<style>
            #header-wrap, #footer-wrap { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; width: 100%; color: #1f2937; padding: 0 20mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
            #header-wrap *, #footer-wrap * { box-sizing: border-box; }
          </style><div id="header-wrap" style="width: 100%; text-align: center;">`;
          if (hasHeader) {
            headerTemplate += pageConfig.headerHtml;
          }
          if (hasBorder) {
            // Inject an absolutely positioned border overlay into the header
            headerTemplate += `<div style="position: absolute; top: 0; left: 0; width: calc(100vw - ${pageConfig.borderWidth || '0px'} * 2); height: calc(100vh - ${pageConfig.borderWidth || '0px'} * 2); border: ${pageConfig.borderWidth} ${pageConfig.borderStyle || 'solid'} ${pageConfig.borderColor || '#000000'}; box-sizing: border-box; pointer-events: none; z-index: -1;"></div>`;
          }
          headerTemplate += '</div>';
          pdfOptions.headerTemplate = headerTemplate;

          let footerTemplate = '<div id="footer-wrap" style="width: 100%; text-align: center;">';
          if (hasFooter) {
            footerTemplate += pageConfig.footerHtml;
          }
          footerTemplate += '</div>';
          pdfOptions.footerTemplate = footerTemplate;
        }
      }

      const buffer = await page.pdf(pdfOptions);
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Helper to resolve all images to Base64 (used by both PDF and DOCX)
   */
  static async replaceImagesToBase64(html: string): Promise<string> {
    if (!html) return html;
    const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    let newHtml = html;

    const matches = [];
    while ((match = regex.exec(html)) !== null) {
      matches.push({ full: match[0], src: match[1] });
    }

    for (const m of matches) {
      if (m.src.startsWith('data:image')) continue;
      try {
        let buffer;
        try {
          buffer = await getFileBufferFromR2(m.src);
        } catch (e) {
          const res = await fetch(m.src);
          const arrayBuf = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuf);
        }
        if (buffer) {
          let mimeType = 'image/jpeg';
          if (m.src.toLowerCase().endsWith('.png')) mimeType = 'image/png';
          else if (m.src.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
          else if (m.src.toLowerCase().endsWith('.svg')) mimeType = 'image/svg+xml';
          else if (m.src.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';

          const b64 = buffer.toString('base64');
          const newSrc = `data:${mimeType};base64,${b64}`;
          newHtml = newHtml.replace(m.src, newSrc);
        }
      } catch (e) {
        console.error('Failed to convert image to base64', e);
      }
    }
    return newHtml;
  }

  /**
   * Generate DOCX buffer from substituted HTML/text using html-to-docx library
   */
  static async generateDOCXBuffer(htmlContent: string, documentTitle: string, headerHtml?: string, footerHtml?: string): Promise<Buffer> {
    // 1. Filter out the zith-page-config script tag so it doesn't render in the document
    const configRegex = /<script\s+id="zith-page-config"\s+type="application\/json">([\s\S]*?)<\/script>/is;
    htmlContent = htmlContent.replace(configRegex, '');

    const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.7; }
    p { margin-bottom: 12pt; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border: 1px solid #cbd5e1; }
    h1 { font-size: 16pt; font-weight: bold; margin-top: 14pt; }
    h2 { font-size: 14pt; font-weight: bold; margin-top: 12pt; }
    h3 { font-size: 12pt; font-weight: bold; margin-top: 10pt; }
  </style>
</head>
<body>
  ${await GeneratedLetterService.replaceImagesToBase64(htmlContent)}
</body>
</html>`;

    let processedHeader = headerHtml ? await GeneratedLetterService.replaceImagesToBase64(headerHtml) : undefined;
    let processedFooter = footerHtml ? await GeneratedLetterService.replaceImagesToBase64(footerHtml) : undefined;

    if (processedHeader) {
      processedHeader = `<div style="text-align: center; width: 100%; margin-bottom: 20px;">${processedHeader}</div>`;
    }
    if (processedFooter) {
      processedFooter = `<div style="text-align: center; width: 100%; font-size: 9pt; color: #94a3b8; margin-top: 20px;">${processedFooter}</div>`;
    }

    const buffer = await HTMLtoDOCX(wrappedHtml, processedHeader, {
      title: documentTitle,
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch margins (in twips)
      font: 'Inter'
    }, processedFooter);

    return buffer as Buffer;
  }

  static async deleteGeneratedLetter(tenantId: string, id: string, userId: string, ipAddress?: string) {
    const existing = await prisma.generatedDocument.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new Error('Generated document not found');
    }

    const res = await prisma.generatedDocument.delete({
      where: { id },
    });

    await prisma.documentAuditLog.create({
      data: {
        tenantId,
        module: 'Letter Generation',
        referenceId: id,
        action: 'Deleted',
        performedById: userId,
        ipAddress: ipAddress || null,
        remarks: `Deleted generated document "${existing.documentNumber}"`,
      },
    });

    return res;
  }
}
