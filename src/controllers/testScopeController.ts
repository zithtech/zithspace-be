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

export const generateScopeContentAI = async (req: Request, res: Response) => {
  try {
    console.log('generateScopeContentAI hit. User:', (req as any).user);
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) {
      console.log('No tenant found in req.user');
      return res.status(401).json({ success: false, error: 'Unauthorized: No tenant found' });
    }

    const { field, projectOverview, modules, testingTypes, userPrompt } = req.body;
    
    const provider = await getAIProviderForTenant(tenantId);
    if (!provider || !provider.isConfigured()) {
      return res.status(400).json({ success: false, error: 'AI provider is not configured. Please add an API key in .env or Tenant AI settings.' });
    }

    const fieldLabel = field === 'outScope' ? 'Out of Scope' : 'In Scope';
    let prompt = `
You are a senior QA engineer writing a Test Scope document.
Generate the "${fieldLabel}" section based on the following project context.

Project Overview: ${projectOverview || 'N/A'}
Modules: ${modules && modules.length > 0 ? modules.join(', ') : 'N/A'}
Testing Types: ${testingTypes && testingTypes.length > 0 ? testingTypes.join(', ') : 'N/A'}
`;

    if (userPrompt) {
      prompt += `\nAdditional user instructions: ${userPrompt}\n`;
    }

    prompt += `
Return ONLY a valid HTML snippet containing the content. Do not include any markdown fences (like \`\`\`html) or preamble. 
Format it nicely using HTML tags like <p>, <ul>, <li>, <strong>.
`;
    
    const result = await provider.generateText(prompt, {
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
    
    const cleanHtml = result.replace(/^```html\s*/i, '').replace(/\s*```$/i, '').trim();

    res.json({ success: true, data: cleanHtml });
  } catch (err: any) {
    console.error('Failed to generate scope content', err);
    res.status(500).json({ success: false, error: 'Failed to generate content' });
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
