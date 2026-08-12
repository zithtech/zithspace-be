import { Prisma } from '@prisma/client';
import pool from '../config/dbpool';
import puppeteer from 'puppeteer';
import { Document, Packer, Paragraph, TextRun, ImageRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, BorderStyle, ShadingType, AlignmentType } from 'docx';
import HTMLtoDOCX from 'html-to-docx';
import * as cheerio from 'cheerio';
import { getFileBufferFromR2, uploadDocumentToR2 } from '../utils/r2Client';
import { getStructure } from '../modules/payroll/services/structure.service';
import { calcStructure, CalcLineInput } from '../modules/payroll/services/structureCalc';

export interface GenerateLetterDto {
  templateId: string;
  referenceEntityId?: string;
  referenceEntityType?: string;
  documentNumber?: string;
  documentName?: string;
  values: Record<string, string>;
  customContent?: string;
}

export class GeneratedLetterService {

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

    // First remove the marker as we don't append a new table anymore (we rely on the existing UI)
    output = output.replace(/<!-- SALARY_STRUCTURE_MARKER -->/g, '');

    if (salaryStructureId && tenantId && ctcVal && ctcVal.trim() !== '') {
      try {
        const numStr = String(ctcVal).replace(/[^0-9.]/g, '');
        const parsed = numStr ? parseFloat(numStr) : 0;
        let annualCtc = parsed > 0 ? (parsed <= 50000 ? Math.round(parsed * 12) : Math.round(parsed)) : 0;
        let monthlyGross = annualCtc > 0 ? Math.round(annualCtc / 12) : 0;

        const structure = await getStructure({ tenantId, userId: 'SYSTEM' }, salaryStructureId);

        if (monthlyGross === 0) {
          monthlyGross = structure.totals.grossSalary || (structure.monthlyCtc ? Number(structure.monthlyCtc) : 10000);
        }

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
        const totalDeductions = breakdown.totalDeductions;
        const netPay = Math.round(monthlyGross - totalDeductions);

        const formatINR = (val: number) => '₹' + val.toLocaleString('en-IN');

        const $ = cheerio.load(output, null, false);
        const table = $('table').filter((i, el) => {
          const text = $(el).text();
          return text.includes('COMPONENT') || text.includes('House Rent Allowance') || text.includes('Compensation') || $(el).closest('[data-salary-structure="true"]').length > 0;
        }).first();

        if (table.length > 0) {
          const allRows = table.find('tr');

          if (allRows.length > 0) {
            let headerRowIndex = 0;
            for (let i = 0; i < allRows.length; i++) {
              const text = $(allRows[i]).text().toUpperCase();
              if (text.includes('COMPONENT') || text.includes('COMPENSATION') || $(allRows[i]).find('th').length > 0) {
                headerRowIndex = i;
                break;
              }
            }

            let footerStartIndex = allRows.length;
            for (let i = headerRowIndex + 1; i < allRows.length; i++) {
              const rowEl = $(allRows[i]);
              const parentTag = rowEl.parent().get(0)?.tagName?.toLowerCase();
              if (parentTag === 'tfoot') {
                footerStartIndex = i;
                break;
              }
              const text = rowEl.text().toUpperCase();
              if (text.includes('GROSS SALARY') || text.includes('TOTAL DEDUCTION') || text.includes('NET PAY') || text.includes('TOTAL CTC') || text.includes('TOTAL EARNINGS')) {
                footerStartIndex = i;
                break;
              }
            }

            if (footerStartIndex > headerRowIndex) {
              const dummyCount = footerStartIndex - headerRowIndex - 1;

              let templateClone;
              if (dummyCount > 0) {
                templateClone = $(allRows[headerRowIndex + 1]).clone();
              } else {
                const headerCols = $(allRows[headerRowIndex]).find('th, td').length || 3;
                templateClone = $('<tr></tr>');
                for (let i = 0; i < headerCols; i++) templateClone.append('<td></td>');
              }

              for (let i = headerRowIndex + 1; i < footerStartIndex; i++) {
                $(allRows[i]).remove();
              }

              let insertAfterTarget = $(allRows[headerRowIndex]);

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

                const newRow = templateClone.clone();
                newRow.removeAttr('data-salary-row-template');
                newRow.removeAttr('style');

                const cols = newRow.find('td, th');

                const nameCol = newRow.find('[data-col="component_name"]');
                const calcCol = newRow.find('[data-col="calc_type"]');
                const percCol = newRow.find('[data-col="percentage"]');
                const monthlyCol = newRow.find('[data-col="monthly_amount"]');
                const annualCol = newRow.find('[data-col="annual_amount"]');

                if (nameCol.length > 0) {
                  nameCol.html(`<div style="font-weight: 600; color: #1e293b; font-size: 14px;">${componentName}</div><div style="font-size: 11px; color: ${categoryColor}; font-weight: 600; margin-top: 2px;">${categoryDisplay}</div>`);
                  if (calcCol.length > 0) calcCol.text(calcTypeDisplay);
                  if (percCol.length > 0) percCol.text(percentageDisplay);
                  if (monthlyCol.length > 0) monthlyCol.text(formatINR(mAmt));
                  if (annualCol.length > 0) annualCol.text(formatINR(aAmt));
                } else {
                  if (cols.length >= 5) {
                    $(cols[0]).html(`<div style="font-weight: 600; color: #1e293b; font-size: 14px;">${componentName}</div><div style="font-size: 11px; color: ${categoryColor}; font-weight: 600; margin-top: 2px;">${categoryDisplay}</div>`);
                    $(cols[1]).text(calcTypeDisplay);
                    $(cols[2]).text(percentageDisplay);
                    $(cols[3]).text(formatINR(mAmt));
                    $(cols[4]).text(formatINR(aAmt));
                  } else if (cols.length >= 3) {
                    $(cols[0]).html(`<div style="font-weight: 600; color: #1e293b; font-size: 14px;">${componentName}</div>`);
                    $(cols[1]).text(formatINR(mAmt));
                    $(cols[2]).text(formatINR(aAmt));
                  } else if (cols.length >= 2) {
                    $(cols[0]).text(componentName);
                    $(cols[1]).text(formatINR(mAmt));
                  }
                }

                // Force inner tags to td just in case the template cloned a th
                newRow.find('th').each(function () {
                  $(this).replaceWith($('<td>' + $(this).html() + '</td>'));
                });

                insertAfterTarget.after(newRow);
                insertAfterTarget = newRow;
              }

              const footerRows = [];
              for (let i = footerStartIndex; i < allRows.length; i++) {
                footerRows.push(allRows[i]);
              }

              const updateRightmostCols = (row: any, monthlyVal: string, annualVal: string) => {
                const tds = $(row).find('td, th');
                if (tds.length >= 2) {
                  $(tds[tds.length - 2]).text(monthlyVal);
                  $(tds[tds.length - 1]).text(annualVal);
                }
              };

              if (footerRows.length >= 4) {
                updateRightmostCols(footerRows[0], formatINR(monthlyGross), formatINR(monthlyGross * 12));
                updateRightmostCols(footerRows[1], totalDeductions > 0 ? '- ' + formatINR(totalDeductions) : '₹0', totalDeductions > 0 ? '- ' + formatINR(totalDeductions * 12) : '₹0');
                updateRightmostCols(footerRows[2], formatINR(netPay), formatINR(netPay * 12));
                const ctcTds = $(footerRows[3]).find('td, th');
                if (ctcTds.length >= 2) {
                  $(ctcTds[ctcTds.length - 2]).text(`${formatINR(monthlyGross)} / mon`);
                  $(ctcTds[ctcTds.length - 1]).text(`${formatINR(annualCtc)} / yr`);
                }
              } else if (footerRows.length >= 3) {
                updateRightmostCols(footerRows[0], formatINR(monthlyGross), formatINR(monthlyGross * 12));
                updateRightmostCols(footerRows[1], totalDeductions > 0 ? '- ' + formatINR(totalDeductions) : '₹0', totalDeductions > 0 ? '- ' + formatINR(totalDeductions * 12) : '₹0');
                updateRightmostCols(footerRows[2], formatINR(netPay), formatINR(netPay * 12));
              }

              output = $.html();
            }
          }
        }
      } catch (err) {
        console.error("Failed to dynamically populate salary table", err);
      }
    }

    return output;
  }

  static async previewLetter(tenantId: string, templateId: string, values: Record<string, string>, generatedDocumentId?: string, customContent?: string): Promise<string> {
    let contentToUse = customContent || null;

    if (!contentToUse && generatedDocumentId) {
      const docRes = await pool.query(`
        SELECT COALESCE(
          gd.snapshot_content,
          (SELECT tv.editor_content FROM template_versions tv WHERE tv.template_id = gd.template_id AND tv.created_at <= gd.generated_at ORDER BY tv.created_at DESC LIMIT 1)
        ) AS "snapshotContent" 
        FROM generated_documents gd 
        WHERE gd.id = $1 AND gd.tenant_id = $2 LIMIT 1`,
        [generatedDocumentId, tenantId]
      );
      if (docRes.rows.length > 0 && docRes.rows[0].snapshotContent) {
        contentToUse = docRes.rows[0].snapshotContent;
      }
    }

    let template = null;
    if (templateId) {
      const result = await pool.query(
        `SELECT dt.*, 
          (
            SELECT COALESCE(json_agg(json_build_object(
              'id', tp.id,
              'templateId', tp.template_id,
              'placeholderKey', tp.placeholder_key,
              'placeholderLabel', tp.placeholder_label,
              'dataType', tp.data_type,
              'required', tp.required,
              'defaultValue', tp.default_value,
              'displayOrder', tp.display_order
            )), '[]'::json)
            FROM template_placeholders tp 
            WHERE tp.template_id = dt.id
          ) AS placeholders 
         FROM document_templates dt 
         WHERE dt.id = $1 AND dt.tenant_id = $2 
         LIMIT 1`,
        [templateId, tenantId]
      );
      template = result.rows[0];
    }

    if (!template && !contentToUse) {
      throw new Error('Preview unavailable because the document snapshot is missing.');
    }

    if (!contentToUse && template) {
      contentToUse = template.editor_content;
    }

    return await this.substitutePlaceholders(tenantId, contentToUse as string, values, template?.placeholders || []);
  }

  static async getGeneratedLetters(tenantId: string, filters?: { templateId?: string; categoryId?: string; status?: string; referenceEntityId?: string; search?: string }) {
    const conditions = ['gd.tenant_id = $1'];
    const values: any[] = [tenantId];
    let paramIdx = 2;

    if (filters?.templateId) {
      conditions.push(`gd.template_id = $${paramIdx++}`);
      values.push(filters.templateId);
    }
    if (filters?.categoryId) {
      conditions.push(`gd.category_id = $${paramIdx++}`);
      values.push(filters.categoryId);
    }
    if (filters?.status) {
      conditions.push(`gd.status = $${paramIdx++}`);
      values.push(filters.status);
    }
    if (filters?.referenceEntityId) {
      conditions.push(`gd.reference_entity_id = $${paramIdx++}`);
      values.push(filters.referenceEntityId);
    }
    if (filters?.search) {
      conditions.push(`gd.document_number ILIKE $${paramIdx++}`);
      values.push(`%${filters.search}%`);
    }

    const query = `
      SELECT 
        gd.id, gd.tenant_id AS "tenantId", gd.template_id AS "templateId", 
        gd.category_id AS "categoryId", gd.reference_entity_id AS "referenceEntityId", 
        gd.reference_entity_type AS "referenceEntityType", gd.document_number AS "documentNumber", gd.document_name AS "documentName", 
        gd.status, gd.generated_by AS "generatedById", gd.generated_at AS "generatedAt", 
        gd.docx_file_path AS "docxFilePath", gd.pdf_file_path AS "pdfFilePath", 
        COALESCE(
          gd.snapshot_content,
          (SELECT tv.editor_content FROM template_versions tv WHERE tv.template_id = gd.template_id AND tv.created_at <= gd.generated_at ORDER BY tv.created_at DESC LIMIT 1)
        ) AS "snapshotContent",
        (SELECT json_build_object('id', dt.id, 'templateName', dt.template_name) FROM document_templates dt WHERE dt.id = gd.template_id) AS template,
        (SELECT json_build_object('id', dc.id, 'categoryName', dc.category_name) FROM document_categories dc WHERE dc.id = gd.category_id) AS category,
        (SELECT json_build_object('id', u.id, 'name', u.name, 'workEmail', u.work_email, 'avatarUrl', u.avatar_url) FROM users u WHERE u.id = gd.generated_by) AS "generatedBy",
        json_build_object(
          'values', (SELECT COUNT(*) FROM generated_document_values gdv WHERE gdv.generated_document_id = gd.id)::int,
          'files', (SELECT COUNT(*) FROM document_files df WHERE df.generated_document_id = gd.id)::int
        ) AS "_count"
      FROM generated_documents gd
      WHERE ${conditions.join(' AND ')}
      ORDER BY gd.generated_at DESC
    `;
    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getGeneratedLetterById(tenantId: string, id: string) {
    const query = `
      SELECT 
        gd.id, gd.tenant_id AS "tenantId", gd.template_id AS "templateId", 
        gd.category_id AS "categoryId", gd.reference_entity_id AS "referenceEntityId", 
        gd.reference_entity_type AS "referenceEntityType", gd.document_number AS "documentNumber", gd.document_name AS "documentName",
        gd.status, gd.generated_by AS "generatedById", gd.generated_at AS "generatedAt", 
        gd.docx_file_path AS "docxFilePath", gd.pdf_file_path AS "pdfFilePath", 
        COALESCE(
          gd.snapshot_content,
          (SELECT tv.editor_content FROM template_versions tv WHERE tv.template_id = gd.template_id AND tv.created_at <= gd.generated_at ORDER BY tv.created_at DESC LIMIT 1)
        ) AS "snapshotContent",
        (
          SELECT json_build_object(
            'id', dt.id, 'tenantId', dt.tenant_id, 'templateName', dt.template_name, 'description', dt.description, 'categoryId', dt.category_id, 'editorContent', dt.editor_content, 'status', dt.status, 'createdAt', dt.created_at, 'updatedAt', dt.updated_at, 'createdById', dt.created_by,
            'placeholders', (
              SELECT COALESCE(json_agg(json_build_object(
                'id', tp.id, 'templateId', tp.template_id, 'placeholderKey', tp.placeholder_key, 'placeholderLabel', tp.placeholder_label, 'dataType', tp.data_type, 'required', tp.required, 'defaultValue', tp.default_value, 'displayOrder', tp.display_order
              )), '[]'::json) FROM template_placeholders tp WHERE tp.template_id = dt.id
            )
          ) FROM document_templates dt WHERE dt.id = gd.template_id
        ) AS template,
        (SELECT json_build_object('id', dc.id, 'tenantId', dc.tenant_id, 'categoryName', dc.category_name, 'description', dc.description, 'status', dc.status, 'createdAt', dc.created_at, 'updatedAt', dc.updated_at) FROM document_categories dc WHERE dc.id = gd.category_id) AS category,
        (SELECT json_build_object('id', u.id, 'name', u.name, 'workEmail', u.work_email) FROM users u WHERE u.id = gd.generated_by) AS "generatedBy",
        (SELECT COALESCE(json_agg(json_build_object(
          'id', v.id, 'tenantId', v.tenant_id, 'generatedDocumentId', v.generated_document_id, 'placeholderKey', v.placeholder_key, 'placeholderValue', v.placeholder_value, 'createdAt', v.created_at
        )), '[]'::json) FROM generated_document_values v WHERE v.generated_document_id = gd.id) AS values,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', f.id, 'tenantId', f.tenant_id, 'generatedDocumentId', f.generated_document_id, 'fileName', f.file_name, 'fileType', f.file_type, 'filePath', f.file_path, 'storageProvider', f.storage_provider, 'createdAt', f.created_at
        )), '[]'::json) FROM document_files f WHERE f.generated_document_id = gd.id) AS files
      FROM generated_documents gd
      WHERE gd.id = $1 AND gd.tenant_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [id, tenantId]);
    const doc = result.rows[0];

    if (!doc) {
      throw new Error('Generated document not found');
    }

    return doc;
  }

  private static async getFullDoc(id: string) {
    const query = `
      SELECT 
        gd.id, gd.tenant_id AS "tenantId", gd.template_id AS "templateId", 
        gd.category_id AS "categoryId", gd.reference_entity_id AS "referenceEntityId", 
        gd.reference_entity_type AS "referenceEntityType", gd.document_number AS "documentNumber", 
        gd.status, gd.generated_by AS "generatedById", gd.generated_at AS "generatedAt", 
        gd.docx_file_path AS "docxFilePath", gd.pdf_file_path AS "pdfFilePath", 
        COALESCE(
          gd.snapshot_content,
          (SELECT tv.editor_content FROM template_versions tv WHERE tv.template_id = gd.template_id AND tv.created_at <= gd.generated_at ORDER BY tv.created_at DESC LIMIT 1)
        ) AS "snapshotContent",
        (SELECT json_build_object('id', dt.id, 'tenantId', dt.tenant_id, 'templateName', dt.template_name, 'description', dt.description, 'categoryId', dt.category_id, 'editorContent', dt.editor_content, 'status', dt.status, 'createdAt', dt.created_at, 'updatedAt', dt.updated_at, 'createdById', dt.created_by) FROM document_templates dt WHERE dt.id = gd.template_id) AS template,
        (SELECT json_build_object('id', dc.id, 'tenantId', dc.tenant_id, 'categoryName', dc.category_name, 'description', dc.description, 'status', dc.status, 'createdAt', dc.created_at, 'updatedAt', dc.updated_at) FROM document_categories dc WHERE dc.id = gd.category_id) AS category,
        (SELECT COALESCE(json_agg(json_build_object('id', v.id, 'tenantId', v.tenant_id, 'generatedDocumentId', v.generated_document_id, 'placeholderKey', v.placeholder_key, 'placeholderValue', v.placeholder_value, 'createdAt', v.created_at)), '[]'::json) FROM generated_document_values v WHERE v.generated_document_id = gd.id) AS values,
        (SELECT COALESCE(json_agg(json_build_object('id', f.id, 'tenantId', f.tenant_id, 'generatedDocumentId', f.generated_document_id, 'fileName', f.file_name, 'fileType', f.file_type, 'filePath', f.file_path, 'storageProvider', f.storage_provider, 'createdAt', f.created_at)), '[]'::json) FROM document_files f WHERE f.generated_document_id = gd.id) AS files
      FROM generated_documents gd
      WHERE gd.id = $1
      LIMIT 1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async generateLetter(tenantId: string, data: GenerateLetterDto, userId: string, ipAddress?: string) {
    const tplRes = await pool.query(`SELECT id, category_id AS "categoryId", template_name AS "templateName", editor_content AS "editorContent" FROM document_templates WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [data.templateId, tenantId]);
    const template = tplRes.rows[0];

    if (!template) {
      throw new Error('Template not found');
    }

    const documentNumber = data.documentNumber || `DOC-${Date.now().toString().slice(-6)}`;

    // Pre-generate UUID
    const uuidRes = await pool.query('SELECT gen_random_uuid() AS id');
    const generatedDocId = uuidRes.rows[0].id;

    // Generate PDF and DOCX before transaction
    const snapshotContentToSave = data.customContent || template.editorContent;
    const placeholdersRes = await pool.query('SELECT placeholder_key AS "placeholderKey" FROM template_placeholders WHERE template_id = $1', [template.id]);
    const templatePlaceholders = placeholdersRes.rows;

    const renderedHtmlWithConfig = await this.substitutePlaceholders(tenantId, snapshotContentToSave, data.values, templatePlaceholders);

    let pageConfig: any = {};
    const configRegex = /<script\s+id="zith-page-config"\s+type="application\/json">([\s\S]*?)<\/script>/i;
    const match = configRegex.exec(renderedHtmlWithConfig);
    if (match && match[1]) {
      try {
        pageConfig = JSON.parse(match[1]);
      } catch (e) { }
    }
    // Pass HTML with the config tag intact so generatePDFBuffer can read header/footer settings
    const renderedHtml = renderedHtmlWithConfig.replace(configRegex, '');

    const headerHtml = pageConfig.headerHtml;
    const footerHtml = pageConfig.footerHtml;

    const pdfBuffer = await this.generatePDFBuffer(renderedHtmlWithConfig);
    const docxBuffer = await this.generateDOCXBuffer(renderedHtml, `${template.templateName} - ${documentNumber}`, headerHtml, footerHtml);

    const safeTemplateName = template.templateName.replace(/\s+/g, '_');
    const pdfFileName = `${documentNumber}_${safeTemplateName}.pdf`;
    const docxFileName = `${documentNumber}_${safeTemplateName}.docx`;

    const pdfUrl = await uploadDocumentToR2(pdfBuffer, pdfFileName, tenantId, generatedDocId, 'application/pdf');
    const docxUrl = await uploadDocumentToR2(docxBuffer, docxFileName, tenantId, generatedDocId, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO generated_documents (id, tenant_id, template_id, category_id, reference_entity_id, reference_entity_type, document_number, document_name, status, generated_by, snapshot_content, docx_file_path, pdf_file_path, generated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GENERATED', $9, $10, $11, $12, NOW())`,
        [generatedDocId, tenantId, template.id, template.categoryId || null, data.referenceEntityId || null, data.referenceEntityType || 'EMPLOYEE', documentNumber, data.documentName || null, userId, snapshotContentToSave, docxUrl, pdfUrl]
      );

      const valueEntries = Object.entries(data.values);
      if (valueEntries.length > 0) {
        for (const [key, val] of valueEntries) {
          await client.query(
            `INSERT INTO generated_document_values (id, tenant_id, generated_document_id, placeholder_key, placeholder_value, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
            [tenantId, generatedDocId, key, val || '']
          );
        }
      }

      await client.query(
        `INSERT INTO document_files (id, tenant_id, generated_document_id, file_name, file_type, file_path, storage_provider, created_at) VALUES 
         (gen_random_uuid(), $1, $2, $3, 'PDF', $4, 'R2', NOW()),
         (gen_random_uuid(), $1, $2, $5, 'DOCX', $6, 'R2', NOW())`,
        [tenantId, generatedDocId, pdfFileName, pdfUrl, docxFileName, docxUrl]
      );

      await client.query(
        `INSERT INTO document_audit_logs (id, tenant_id, module, reference_id, action, performed_by, ip_address, remarks, created_at) VALUES (gen_random_uuid(), $1, 'Letter Generation', $2, 'Generated', $3, $4, $5, NOW())`,
        [tenantId, generatedDocId, userId, ipAddress || null, `Generated document "${documentNumber}" from template "${template.templateName}"`]
      );

      await client.query('COMMIT');

      return await this.getFullDoc(generatedDocId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async updateGeneratedLetter(tenantId: string, id: string, data: GenerateLetterDto, userId: string, ipAddress?: string) {
    const exRes = await pool.query(`SELECT id, template_id AS "templateId", document_number AS "documentNumber", snapshot_content AS "snapshotContent" FROM generated_documents WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, tenantId]);
    const existingDoc = exRes.rows[0];

    if (!existingDoc) {
      throw new Error('Generated document not found');
    }

    let template = null;
    if (data.templateId) {
      const tplRes = await pool.query(`SELECT id, category_id AS "categoryId", template_name AS "templateName", editor_content AS "editorContent" FROM document_templates WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [data.templateId, tenantId]);
      template = tplRes.rows[0];
    }

    if (!template) {
      throw new Error('Template not found');
    }

    const documentNumber = data.documentNumber || existingDoc.documentNumber;

    const snapshotContentToSave = data.customContent || ((existingDoc.templateId === data.templateId)
      ? existingDoc.snapshotContent
      : template.editorContent);

    // Pre-generate PDF and DOCX before transaction
    const placeholdersRes = await pool.query('SELECT placeholder_key AS "placeholderKey" FROM template_placeholders WHERE template_id = $1', [template.id]);
    const templatePlaceholders = placeholdersRes.rows;

    const renderedHtmlWithConfig = await this.substitutePlaceholders(tenantId, snapshotContentToSave, data.values, templatePlaceholders);

    let pageConfig: any = {};
    const configRegex = /<script\s+id="zith-page-config"\s+type="application\/json">([\s\S]*?)<\/script>/i;
    const match = configRegex.exec(renderedHtmlWithConfig);
    if (match && match[1]) {
      try {
        pageConfig = JSON.parse(match[1]);
      } catch (e) { }
    }
    // Pass HTML with the config tag intact so generatePDFBuffer can read header/footer settings
    const renderedHtml = renderedHtmlWithConfig.replace(configRegex, '');

    const headerHtml = pageConfig.headerHtml;
    const footerHtml = pageConfig.footerHtml;

    const pdfBuffer = await this.generatePDFBuffer(renderedHtmlWithConfig);
    const docxBuffer = await this.generateDOCXBuffer(renderedHtml, `${template.templateName} - ${documentNumber}`, headerHtml, footerHtml);

    const safeTemplateName = template.templateName.replace(/\s+/g, '_');
    const pdfFileName = `${documentNumber}_${safeTemplateName}.pdf`;
    const docxFileName = `${documentNumber}_${safeTemplateName}.docx`;

    const pdfUrl = await uploadDocumentToR2(pdfBuffer, pdfFileName, tenantId, existingDoc.id, 'application/pdf');
    const docxUrl = await uploadDocumentToR2(docxBuffer, docxFileName, tenantId, existingDoc.id, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE generated_documents SET template_id = $1, category_id = $2, reference_entity_id = $3, reference_entity_type = $4, document_number = $5, snapshot_content = $6, pdf_file_path = $7, docx_file_path = $8, document_name = $9 WHERE id = $10`,
        [template.id, template.categoryId || null, data.referenceEntityId || null, data.referenceEntityType || 'EMPLOYEE', documentNumber, snapshotContentToSave, pdfUrl, docxUrl, data.documentName || null, existingDoc.id]
      );

      await client.query(`DELETE FROM generated_document_values WHERE generated_document_id = $1`, [existingDoc.id]);

      const valueEntries = Object.entries(data.values);
      if (valueEntries.length > 0) {
        for (const [key, val] of valueEntries) {
          await client.query(
            `INSERT INTO generated_document_values (id, tenant_id, generated_document_id, placeholder_key, placeholder_value, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
            [tenantId, existingDoc.id, key, val || '']
          );
        }
      }

      await client.query(`DELETE FROM document_files WHERE generated_document_id = $1`, [existingDoc.id]);

      await client.query(
        `INSERT INTO document_files (id, tenant_id, generated_document_id, file_name, file_type, file_path, storage_provider, created_at) VALUES 
         (gen_random_uuid(), $1, $2, $3, 'PDF', $4, 'R2', NOW()),
         (gen_random_uuid(), $1, $2, $5, 'DOCX', $6, 'R2', NOW())`,
        [tenantId, existingDoc.id, pdfFileName, pdfUrl, docxFileName, docxUrl]
      );

      await client.query(
        `INSERT INTO document_audit_logs (id, tenant_id, module, reference_id, action, performed_by, ip_address, remarks, created_at) VALUES (gen_random_uuid(), $1, 'Letter Generation', $2, 'Updated', $3, $4, $5, NOW())`,
        [tenantId, existingDoc.id, userId, ipAddress || null, `Updated generated document "${documentNumber}"`]
      );

      await client.query('COMMIT');

      return await this.getFullDoc(existingDoc.id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async generatePDFBuffer(htmlContent: string): Promise<Buffer> {
    let pageConfig: any = null;
    const configRegex = /<script\s+id="zith-page-config"\s+type="application\/json">([\s\S]*?)<\/script>/i;
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
            .logo-placeholder-btn { display: none !important; }
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
              div.style.padding = '4px 20mm 0';
              div.style.position = 'absolute';
              div.style.visibility = 'hidden';
              div.style.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
              div.style.fontSize = '11px';
              div.style.lineHeight = '1.4';
              div.style.boxSizing = 'border-box';
              div.style.overflow = 'hidden';
              // Constrain images the same way the header template does
              // @ts-ignore
              const style = document.createElement('style');
              style.textContent = `
                .measure-div img { max-height: 55px !important; max-width: 120px !important; width: auto !important; height: auto !important; }
                .measure-div p, .measure-div div { margin: 0 !important; padding: 0 !important; line-height: 1.4 !important; }
                .measure-div table { width: 100% !important; border-collapse: collapse !important; border: none !important; margin: 0 !important; }
                .measure-div td, .measure-div th { border: none !important; padding: 0 4px !important; vertical-align: middle !important; }
              `;
              div.classList.add('measure-div');
              // @ts-ignore
              document.head.appendChild(style);
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
              // @ts-ignore
              document.head.removeChild(style);
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

          // A4 page height at 96 dpi: 297mm * 3.7795 ≈ 1122.5px
          const A4_HEIGHT_PX = 1122;
          // Reserve at least 80mm (≈ 302px) for body content
          const MIN_CONTENT_PX = 302;
          const MAX_TOTAL_MARGIN_PX = A4_HEIGHT_PX - MIN_CONTENT_PX; // ≈ 820px

          if (hasHeader) {
            const currentTop = parseMarginToPx(pdfOptions.margin.top);
            const neededTop = headerHeight + 10; // 10px safety buffer
            const resolvedTop = Math.max(currentTop, neededTop);
            pdfOptions.margin.top = `${resolvedTop}px`;
          } else {
            // Normalise to px so all margins are the same unit
            pdfOptions.margin.top = `${parseMarginToPx(pdfOptions.margin.top)}px`;
          }

          if (hasFooter) {
            const currentBottom = parseMarginToPx(pdfOptions.margin.bottom);
            const neededBottom = footerHeight + 10; // 10px safety buffer
            const resolvedBottom = Math.max(currentBottom, neededBottom);
            pdfOptions.margin.bottom = `${resolvedBottom}px`;
          } else {
            pdfOptions.margin.bottom = `${parseMarginToPx(pdfOptions.margin.bottom)}px`;
          }

          // Clamp: top + bottom must never exceed MAX_TOTAL_MARGIN_PX
          const topPx = parseMarginToPx(pdfOptions.margin.top);
          const bottomPx = parseMarginToPx(pdfOptions.margin.bottom);
          if (topPx + bottomPx > MAX_TOTAL_MARGIN_PX) {
            const scale = MAX_TOTAL_MARGIN_PX / (topPx + bottomPx);
            pdfOptions.margin.top = `${Math.floor(topPx * scale)}px`;
            pdfOptions.margin.bottom = `${Math.floor(bottomPx * scale)}px`;
          }

        }

        if (hasBorder || hasHeader || hasFooter) {
          pdfOptions.displayHeaderFooter = true;

          let headerTemplate = `<style>
            #header-wrap, #footer-wrap {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              font-size: 11px;
              line-height: 1.4;
              width: 100%;
              color: #1f2937;
              padding: 4px 20mm 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              box-sizing: border-box;
            }
            #header-wrap *, #footer-wrap * { box-sizing: border-box; }
            .logo-placeholder-btn { display: none !important; }
            /* Reset paragraph / div spacing inside header */
            #header-wrap p, #header-wrap div,
            #footer-wrap p, #footer-wrap div {
              margin: 0 !important;
              padding: 0 !important;
              line-height: 1.4 !important;
            }
            /* Constrain logo image size */
            #header-wrap img, #footer-wrap img {
              max-height: 55px !important;
              max-width: 120px !important;
              width: auto !important;
              height: auto !important;
              object-fit: contain !important;
              display: inline-block !important;
            }
            /* Table layout inside header — no borders, proper alignment */
            #header-wrap table, #footer-wrap table {
              width: 100% !important;
              border-collapse: collapse !important;
              border: none !important;
              margin: 0 !important;
            }
            #header-wrap td, #header-wrap th,
            #footer-wrap td, #footer-wrap th {
              border: none !important;
              padding: 0 4px !important;
              vertical-align: middle !important;
              word-break: break-word !important;
            }
          </style><div id="header-wrap" style="width: 100%;">`;

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
    const configRegex = /<script\s+id="zith-page-config"\s+type="application\/json">([\s\S]*?)<\/script>/i;
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
    const exRes = await pool.query(`SELECT id, document_number AS "documentNumber" FROM generated_documents WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, tenantId]);
    const existing = exRes.rows[0];

    if (!existing) {
      throw new Error('Generated document not found');
    }

    const delRes = await pool.query(`DELETE FROM generated_documents WHERE id = $1 RETURNING *`, [id]);
    const res = delRes.rows[0];

    await pool.query(
      `INSERT INTO document_audit_logs (id, tenant_id, module, reference_id, action, performed_by, ip_address, remarks, created_at) VALUES (gen_random_uuid(), $1, 'Letter Generation', $2, 'Deleted', $3, $4, $5, NOW())`,
      [tenantId, id, userId, ipAddress || null, `Deleted generated document "${existing.documentNumber}"`]
    );

    return res;
  }
}
