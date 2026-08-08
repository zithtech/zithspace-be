import { Request, Response } from 'express';
import pool from '../config/dbpool';
import { SprintReportExportService } from '../services/sprintReportExportService';

export const getTestScopes = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM qa_test_scopes WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );

    res.status(200).json({ success: true, data: rows });
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

    const { rows } = await pool.query(query, params);
    console.log('Update result rows:', rows.length);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }

    res.status(200).json({ success: true, data: rows[0] });
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

    const { rows } = await pool.query(
      `DELETE FROM qa_test_scopes WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test Scope not found' });
    }

    res.status(200).json({ success: true, message: 'Test scope deleted successfully' });
  } catch (error) {
    console.error('Error deleting test scope:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

import { getAIProviderForTenant } from '../services/ai/resolver';
import { rewriteSelection } from '../services/aiDocumentService';

export const generateScopeContentAI = async (req: Request, res: Response) => {
  try {
    console.log('generateScopeContentAI hit. User:', (req as any).user);
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      console.log('No tenant found in req.user');
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { field, projectOverview, modules, testingTypes, userPrompt, scopeName, existingContent, action } = req.body;

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

    const cleaned = result
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

    const out = (await provider.generateText(prompt, { temperature: 0.2, maxOutputTokens: 2048 }) || '').trim();
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
