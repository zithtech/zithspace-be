import { Request, Response } from 'express';
import { registerModuleNames } from './qaModuleController';
import pool from '../config/dbpool';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';
import { SprintReportExportService } from '../services/sprintReportExportService';
import { RBACService } from '../modules/rbac/rbac.service';
import { Permissions } from '../types/permissions';
import { prisma } from '../config/database';

export const getTestScopes = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userName = (req as any).user?.name;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const {
      page = '1',
      pageSize = '10',
      search,
      status,
      priority,
      qa_owner,
      product,
      allowed_products,
      sortBy = 'created_at',
      sortOrder = 'desc',
      isApproval
    } = req.query;

    const limit = parseInt(pageSize as string) || 10;
    const offset = (parseInt(page as string) - 1) * limit;

    // Determine inaccessible projects
    const hasManagePermission = await RBACService.hasPermission(userId, tenantId, Permissions.PROJECT_MANAGE, userRole);
    const userProjectsQuery: any = {
      tenantId,
      status: { notIn: ["ARCHIVED", "DELETED", "archived", "deleted"] },
    };
    if (!hasManagePermission) {
      userProjectsQuery.OR = [
        { projectManagerId: userId },
        { members: { some: { userId } } },
      ];
    }
    const userProjects = await prisma.project.findMany({
      where: userProjectsQuery,
      select: { id: true }
    });
    const userProjectIds = userProjects.map((p: any) => p.id);

    const allProjects = await prisma.project.findMany({
      where: { tenantId },
      select: { id: true }
    });
    const allProjectIds = allProjects.map((p: any) => p.id);
    const inaccessibleProjectIds = allProjectIds.filter((id: string) => !userProjectIds.includes(id));

    let query = `SELECT * FROM qa_test_scopes WHERE tenant_id = $1`;
    let countQuery = `SELECT COUNT(*) FROM qa_test_scopes WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (inaccessibleProjectIds.length > 0) {
      query += ` AND (details->>'product' IS NULL OR details->>'product' != ALL($${paramIndex}))`;
      countQuery += ` AND (details->>'product' IS NULL OR details->>'product' != ALL($${paramIndex}))`;
      params.push(inaccessibleProjectIds);
      paramIndex++;
    }

    if (isApproval === 'true') {
      query += ` AND details->'approvalWorkflow'->>'user' = $${paramIndex} AND status != 'Draft'`;
      countQuery += ` AND details->'approvalWorkflow'->>'user' = $${paramIndex} AND status != 'Draft'`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      query += ` AND LOWER(REPLACE(status, ' ', '_')) = LOWER(REPLACE($${paramIndex}, ' ', '_'))`;
      countQuery += ` AND LOWER(REPLACE(status, ' ', '_')) = LOWER(REPLACE($${paramIndex}, ' ', '_'))`;
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      query += ` AND LOWER(REPLACE(priority, ' ', '_')) = LOWER(REPLACE($${paramIndex}, ' ', '_'))`;
      countQuery += ` AND LOWER(REPLACE(priority, ' ', '_')) = LOWER(REPLACE($${paramIndex}, ' ', '_'))`;
      params.push(priority);
      paramIndex++;
    }

    if (qa_owner) {
      query += ` AND qa_owner = $${paramIndex}`;
      countQuery += ` AND qa_owner = $${paramIndex}`;
      params.push(qa_owner);
      paramIndex++;
    }

    // Restrict visibility to scopes belonging to the user's accessible projects.
    // The frontend passes allowed_products as a comma-separated list of project names
    // the current user is a member of. Scopes with no product set are always visible.
    if (allowed_products && isApproval !== 'true') {
      const names = (allowed_products as string)
        .split(',')
        .map(n => n.trim().toLowerCase())
        .filter(Boolean);
      if (names.length > 0) {
        // Build placeholders for the IN clause
        const placeholders = names.map(() => `$${paramIndex++}`).join(',');
        const clause = ` AND (
          details->>'product' IS NULL OR 
          details->>'product' = '' OR 
          LOWER(details->>'product') IN (${placeholders}) OR
          details->'approvalWorkflow'->>'user' = $${paramIndex} OR
          LOWER(qa_owner) = LOWER($${paramIndex + 1})
        )`;
        query += clause;
        countQuery += clause;
        params.push(...names, userId, userName);
        paramIndex += 2;
      }
    }

    if (product) {
      query += ` AND LOWER(details->>'product') = LOWER($${paramIndex})`;
      countQuery += ` AND LOWER(details->>'product') = LOWER($${paramIndex})`;
      params.push(product);
      paramIndex++;
    }

    if (search) {
      const searchStr = `%${search}%`;
      query += ` AND (name ILIKE $${paramIndex} OR type ILIKE $${paramIndex} OR details->>'product' ILIKE $${paramIndex})`;
      countQuery += ` AND (name ILIKE $${paramIndex} OR type ILIKE $${paramIndex} OR details->>'product' ILIKE $${paramIndex})`;
      params.push(searchStr);
      paramIndex++;
    }

    const validSortCols = ['name', 'created_at', 'end_date'];
    const orderCol = validSortCols.includes(sortBy as string) ? (sortBy as string) : 'created_at';
    const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const nullsOrder = orderDir === 'ASC' ? 'NULLS LAST' : 'NULLS LAST';
    
    query += ` ORDER BY ${orderCol} ${orderDir} ${nullsOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
    const queryParams = [...params, limit, offset];

    const { rows } = await pool.query(query, queryParams);
    const { rows: countRows } = await pool.query(countQuery, params);
    const total = parseInt(countRows[0].count);

    res.status(200).json({ 
      success: true, 
      data: rows,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching test scopes:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const getTestScope = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const createTestScope = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { name, type, priority, status, qa_owner, start_date, end_date, details } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO qa_test_scopes (tenant_id, name, type, priority, status, qa_owner, start_date, end_date, details) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tenantId, name, type, priority, status, qa_owner, start_date || null, end_date || null, details || {}]
    );

    // The modules named on a scope are the workspace's module list — keep the
    // two in step rather than making someone add them twice.
    await registerModuleNames(tenantId, details?.modules).catch(err =>
      console.error('Failed to register scope modules:', err));

    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.QA_WORKSPACE,
      page: Page.QA_SCOPE_LIST,
      action: Action.CREATE,
      actionLabel: "Test Scope created",
      entityType: EntityType.QA_SCOPE,
      entityId: rows[0].id,
      entityLabel: name,
      afterData: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error creating test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const updateTestScope = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { id } = req.params;
    
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    console.log('UpdateTestScope called with id:', id, 'body:', req.body);
    const { name, type, priority, status, qa_owner, start_date, end_date, details } = req.body || {};

    // Check approve/reject permissions
    if (status === 'Approved' || status === 'Rejected') {
      const allowed = await RBACService.hasAnyPermission(
        (req as any).user.id, 
        tenantId, 
        [Permissions.QA_SCOPE_APPROVE, Permissions.QA_MANAGE], 
        (req as any).user.role
      );
      if (!allowed) {
        return res.status(403).json({ success: false, error: 'You do not have permission to approve or reject test scopes' });
      }
    }

    const query = `UPDATE qa_test_scopes 
       SET name = $1, type = $2, priority = $3, status = $4, qa_owner = $5, start_date = $6, end_date = $7, details = $8, updated_at = NOW()
       WHERE id = $9 AND tenant_id = $10 RETURNING *`;
    
    const params = [
      name || null, 
      type || null, 
      priority || null, 
      status || null, 
      qa_owner || null, 
      start_date || null, 
      end_date || null, 
      details || {}, 
      id, 
      tenantId
    ];
    console.log('Executing query with params:', params);

    const { rows: oldRows } = await pool.query(`SELECT * FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }
    const oldScope = oldRows[0];

    const { rows } = await pool.query(query, params);
    console.log('Update result rows:', rows.length);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }

    // Modules added while editing join the workspace's module list too.
    await registerModuleNames(tenantId, details?.modules).catch(err =>
      console.error('Failed to register scope modules:', err));

    const updatedScope = rows[0];
    const diff = diffShallow(oldScope, updatedScope);
    if (diff.changedFields.length > 0) {
      let action = Action.UPDATE as string;
      if (status === 'Approved') action = Action.APPROVE;
      else if (status === 'Rejected') action = Action.REJECT;

      recordTransaction({
        req: req as any,
        section: Section.WORK,
        module: Module.QA_WORKSPACE,
        page: Page.QA_SCOPE_DETAIL,
        action,
        actionLabel: "Test Scope updated",
        entityType: EntityType.QA_SCOPE,
        entityId: updatedScope.id,
        entityLabel: updatedScope.name,
        beforeData: diff.before,
        afterData: diff.after,
        changedFields: diff.changedFields,
      });
    }

    res.status(200).json({ success: true, data: updatedScope });
  } catch (error) {
    console.error('Error updating test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const deleteTestScope = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { id } = req.params;
    
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { rows: oldRows } = await pool.query(`SELECT * FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }
    const oldScope = oldRows[0];

    const { rows } = await pool.query(
      `DELETE FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );

    recordTransaction({
      req: req as any,
      section: Section.WORK,
      module: Module.QA_WORKSPACE,
      page: Page.QA_SCOPE_LIST,
      action: Action.DELETE,
      actionLabel: "Test Scope deleted",
      entityType: EntityType.QA_SCOPE,
      entityId: id,
      entityLabel: oldScope.name,
      beforeData: oldScope,
    });

    res.status(200).json({ success: true, message: 'Test scope deleted successfully' });
  } catch (error) {
    console.error('Error deleting test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

import { getAIProviderForTenant } from '../services/ai/resolver';
import { rewriteSelection } from '../services/aiDocumentService';

/**
 * Documents from the Document Hub, for the PRD reference picker.
 *
 * A PRD is nearly always already written in the hub, so pointing at it beats
 * pasting a URL: the reference can't rot, and Zai can read the document when
 * drafting the scope.
 */
export const getHubDocuments = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const search = String(req.query.search ?? '').trim();
    const params: any[] = [tenantId];
    let where = `d."tenantId" = $1 AND COALESCE(d.is_deleted, false) = false`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND d.title ILIKE $${params.length}`;
    }

    // Prisma maps these models to snake-case tables but leaves tenantId /
    // documentHubId / updatedAt camel-cased, so those need quoting.
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d."updatedAt" AS updated_at, dh.name AS hub_name
         FROM documents d
         LEFT JOIN document_hub dh ON dh.id = d."documentHubId"
        WHERE ${where}
        ORDER BY d."updatedAt" DESC
        LIMIT 200`,
      params,
    );

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching hub documents:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

/**
 * Flattens a Document Hub document (BlockNote JSON) to plain text.
 *
 * Walks for any `text` field rather than assuming a block shape, so a document
 * using tables, lists or nested blocks still contributes its wording instead of
 * silently arriving empty.
 */
const documentToText = (content: any, out: string[] = [], depth = 0): string => {
  if (depth > 12 || out.length > 4000) return out.join(' ');
  if (Array.isArray(content)) {
    for (const c of content) documentToText(c, out, depth + 1);
  } else if (content && typeof content === 'object') {
    if (typeof content.text === 'string' && content.text.trim()) out.push(content.text.trim());
    for (const key of ['content', 'children', 'rows', 'cells']) {
      if (content[key]) documentToText(content[key], out, depth + 1);
    }
  }
  return out.join(' ');
};

/** Loads a PRD's wording so the generator can work from it, or '' if unusable. */
const loadPrdText = async (documentId: string, tenantId: string): Promise<{ title: string; text: string } | null> => {
  try {
    const { rows } = await pool.query(
      `SELECT title, content FROM documents
        WHERE id = $1 AND "tenantId" = $2 AND COALESCE(is_deleted, false) = false`,
      [documentId, tenantId],
    );
    if (!rows.length) return null;
    const text = documentToText(rows[0].content).slice(0, 12000);
    return { title: rows[0].title, text };
  } catch (e) {
    console.error('Failed to read PRD document:', e);
    return null;
  }
};

export const generateScopeContentAI = async (req: Request, res: Response) => {
  try {
    console.log('generateScopeContentAI hit. User:', (req as any).user);
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      console.log('No tenant found in req.user');
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { field, projectOverview, modules, testingTypes, userPrompt, scopeName, existingContent, action, prdDocumentId } = req.body;

    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return res.status(400).json({ success: false, error: 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.' });
    }

    const isDescription = field === 'description';
    const fieldLabel = isDescription
      ? 'Description'
      : field === 'outScope' ? 'Out of Scope' : 'In Scope';

    let prompt = `You are a senior QA engineer writing a Test Scope document.\n`;

    if (action === 'optimize' && existingContent) {
      prompt += `Please optimize the existing "${fieldLabel}" section based on the following project context to make it more professional, structured, and clear.`;
    } else if (action === 'enhance' && existingContent) {
      prompt += `Please enhance and enrich the existing "${fieldLabel}" section based on the following project context, adding relevant details, expanding on key concepts, and ensuring comprehensiveness.`;
    } else {
      prompt += `Generate the "${fieldLabel}" section based on the following project context.`;
    }

    prompt += `

Test Scope Name: ${scopeName || 'N/A'}
Project Overview: ${projectOverview || 'N/A'}
Modules: ${modules && modules.length > 0 ? modules.join(', ') : 'N/A'}
Testing Types: ${testingTypes && testingTypes.length > 0 ? testingTypes.join(', ') : 'N/A'}
`;

    // The PRD is the strongest signal available, so it goes in ahead of the
    // thin context fields and the model is told to prefer it.
    if (prdDocumentId) {
      const prd = await loadPrdText(String(prdDocumentId), tenantId);
      if (prd?.text) {
        prompt += `
Source PRD — "${prd.title}". Base the section on this document. Only describe behaviour it actually specifies; do not invent features it does not mention.
---
${prd.text}
---
`;
      }
    }

    if (existingContent) {
      prompt += `\nExisting ${fieldLabel}:\n${existingContent}\n`;
    }

    if (userPrompt) {
      prompt += `\nAdditional user instructions: ${userPrompt}\n`;
    }

    prompt += isDescription
      ? `
Write a concise summary (2-4 sentences) a reviewer can read in one pass: what is being
tested and why it matters. Return ONLY plain text — no markdown, no HTML, no preamble.
`
      : `
Return ONLY a valid HTML snippet containing the content. Do not include any markdown fences (like \`\`\`html) or preamble.
Format it nicely using HTML tags like <p>, <ul>, <li>, <strong>.
`;

    const result = await provider.generateText(prompt, {
      temperature: 0.7,
      maxOutputTokens: 2048,
    });

    const cleaned = (result?.text || '')
      .replace(/^```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    res.json({ success: true, data: isDescription ? cleaned.replace(/<[^>]*>/g, '') : cleaned });
  } catch (err: any) {
    console.error('Failed to generate scope content', err);
    res.status(500).json({ success: false, error: 'Failed to generate content' });
  }
};

/**
 * Light-touch copy edit for a free-text field (currently the scope Description).
 * Fixes grammar/spelling only — never rewrites or expands the author's text.
 */
export const enhanceScopeText = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }
    if (text.length > 8000) {
      return res.status(400).json({ success: false, error: 'text is too long' });
    }

    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return res.status(400).json({ success: false, error: 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.' });
    }

    const input = text.trim();
    const prompt = `
You are a light-touch copy editor. Make ONLY minimal changes to the text below:
- Fix spelling, grammar, punctuation, capitalisation, and obvious typos.
- Preserve the author's voice, tone, structure, line breaks, and technical terms.
- Do NOT rewrite, summarise, expand, translate, or add anything new.
- Do NOT wrap in quotes or markdown. Do NOT add a preamble or explanation.
Return ONLY the corrected text as plain text.

Text:
${input}
`.trim();

    const out = ((await provider.generateText(prompt, { temperature: 0.2, maxOutputTokens: 2048 }))?.text || '').trim();
    const corrected = out
      .replace(/^```[a-zA-Z]*\n?/, '')
      .replace(/```$/, '')
      .trim() || input;

    res.json({ success: true, data: { text: corrected } });
  } catch (err: any) {
    console.error('Failed to enhance scope text', err);
    res.status(500).json({ success: false, error: 'Grammar enhancement failed' });
  }
};

/**
 * Rewrite a selected excerpt of the scope editor per a user instruction.
 * Mirrors POST /api/documenthub/ai-rewrite so the inline Zai menu works for
 * QA users, who hold scope permissions rather than DOCUMENT_UPDATE.
 */
export const aiRewriteScopeSelection = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { text, instruction } = req.body as { text?: string; instruction?: string };
    const cleanText = (text || '').trim();
    const cleanInstruction = (instruction || '').trim();

    if (!cleanText || cleanText.length < 2) {
      return res.status(400).json({ success: false, error: 'Selected text is required (min 2 characters)' });
    }
    if (cleanText.length > 8000) {
      return res.status(400).json({ success: false, error: 'Selected text is too long (max 8000 characters)' });
    }
    if (!cleanInstruction || cleanInstruction.length < 2) {
      return res.status(400).json({ success: false, error: 'Instruction is required' });
    }
    if (cleanInstruction.length > 500) {
      return res.status(400).json({ success: false, error: 'Instruction is too long (max 500 characters)' });
    }

    const result = await rewriteSelection(cleanText, cleanInstruction, tenantId);
    res.status(200).json({ success: true, data: result, message: 'Selection rewritten' });
  } catch (err: any) {
    console.error('AI rewrite scope selection error:', err);
    res.status(500).json({ success: false, error: 'Failed to rewrite selection' });
  }
};

export const exportPdf = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant context and authentication required",
      });
    }

    const { id } = req.params;
    const { htmlPayload } = req.body;

    if (!htmlPayload) {
      return res.status(400).json({
        success: false,
        error: "htmlPayload is required",
      });
    }

    // Generate the PDF buffer directly in memory
    const pdfBuffer = await SprintReportExportService.generatePDFBuffer(htmlPayload);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Test-Scope-${id}.pdf"`
    );

    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating Test Scope PDF:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate PDF",
    });
  }
};

export const getTestScopesStats = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userName = (req as any).user?.name;
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role;
    
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Determine inaccessible projects
    const hasManagePermission = await RBACService.hasPermission(userId, tenantId, Permissions.PROJECT_MANAGE, userRole);
    const userProjectsQuery: any = {
      tenantId,
      status: { notIn: ["ARCHIVED", "DELETED", "archived", "deleted"] },
    };
    if (!hasManagePermission) {
      userProjectsQuery.OR = [
        { projectManagerId: userId },
        { members: { some: { userId } } },
      ];
    }
    const userProjects = await prisma.project.findMany({
      where: userProjectsQuery,
      select: { id: true }
    });
    const userProjectIds = userProjects.map((p: any) => p.id);

    const allProjects = await prisma.project.findMany({
      where: { tenantId },
      select: { id: true }
    });
    const allProjectIds = allProjects.map((p: any) => p.id);
    const inaccessibleProjectIds = allProjectIds.filter((id: string) => !userProjectIds.includes(id));

    let query = `SELECT * FROM qa_test_scopes WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (inaccessibleProjectIds.length > 0) {
      query += ` AND (details->>'product' IS NULL OR details->>'product' != ALL($${paramIndex}))`;
      params.push(inaccessibleProjectIds);
      paramIndex++;
    }

    const { rows } = await pool.query(query, params);

    const stats: any = {
      totalScopes: rows.length,
      approved: rows.filter(r => r.status === 'Approved').length,
      inReview: rows.filter(r => r.status === 'In Review').length,
      inDraft: rows.filter(r => r.status === 'Draft').length,
      rejected: rows.filter(r => r.status === 'Rejected').length,
      // pendingApprovals = scopes where THIS user is the approver (matches approvals tab)
      pendingApprovals: rows.filter(r => r.details?.approvalWorkflow?.user === userId && r.status !== 'Draft').length,
      routedForApproval: rows.filter(r => r.status === 'In Review').length,
      draftNoDueDate: rows.filter(r => r.status === 'Draft' && !r.end_date).length,
      overdueCount: rows.filter(r => {
        if (!r.end_date) return false;
        const end = new Date(r.end_date);
        end.setHours(0,0,0,0);
        const now = new Date();
        now.setHours(0,0,0,0);
        return end < now;
      }).length,
      yearlyScopesData: []
    };

    const currentYear = new Date().getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yearlyScopesMap: Record<string, number> = {};
    rows.forEach(r => {
      if (r.created_at) {
        const d = new Date(r.created_at);
        if (d.getFullYear() === currentYear) {
          const monthStr = months[d.getMonth()];
          yearlyScopesMap[monthStr] = (yearlyScopesMap[monthStr] || 0) + 1;
        }
      }
    });

    stats.yearlyScopesData = months.map(month => ({
      month,
      scopes: yearlyScopesMap[month] || 0
    }));

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching test scopes stats:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
