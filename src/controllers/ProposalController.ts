import { Response } from 'express';
import pool from '@/config/dbpool';
import { 
  AuthRequest, 
  ApiResponse, 
  ValidationError 
} from '@/types';
import { ProposalExportService } from '@/services/proposalExportService';

export class ProposalController {

  /**
   * Get all proposals for a tenant
   */
  static async getProposals(req: AuthRequest, res: Response): Promise<void> {
    try {
      let tenantId = req.tenantId;
      const user = req.user;
      
      console.log('🔍 [PROPOSAL FETCH] User:', user?.email, 'Active Tenant:', tenantId);
      
      if (!tenantId) throw new ValidationError('Tenant context required');

      let { rows } = await pool.query('SELECT id, title, client_name, status, created_at FROM proposals WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);

      // DEVELOPMENT FALLBACK: If no results for current tenant but we are in dev, 
      // check if they exist under the default zithtech tenant
      if (rows.length === 0 && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        if (tenantId !== fallbackId) {
            console.log('⚠️ [DEV FALLBACK] No proposals for current tenant. Trying fallback:', fallbackId);
            const { rows: fallbackRows } = await pool.query('SELECT id, title, client_name, status, created_at FROM proposals WHERE tenant_id = $1 ORDER BY created_at DESC', [fallbackId]);
            if (fallbackRows.length > 0) {
                rows = fallbackRows;
                console.log(`✨ [DEV FALLBACK] Found ${rows.length} proposals under fallback ID`);
            }
        }
      }

      // If empty, let's look for a generic count for debugging
      if (rows.length === 0) {
        const { rows: debugRows } = await pool.query('SELECT count(*) FROM proposals');
        console.log(`ℹ️ [DEBUG] Total proposals in DB (all tenants): ${debugRows[0].count}`);
      }

      res.status(200).json({
        success: true,
        data: rows,
        debug: { tenantId } // Send back the ID so we can see it in the dev tools
      } as ApiResponse & { debug: any });
    } catch (error: any) {
      console.error('Error fetching proposals:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch proposals'
      } as ApiResponse);
    }
  }

  /**
   * Get a single proposal by ID
   */
  static async getProposalById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      let tenantId = req.tenantId;

      let { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

      // DEV FALLBACK
      if (rows.length === 0 && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        console.log('⚠️ [DEV FALLBACK] Detail fetch trying fallback:', fallbackId);
        const { rows: fallbackRows } = await pool.query('SELECT * FROM proposals WHERE id = $1 AND tenant_id = $2', [id, fallbackId]);
        rows = fallbackRows;
      }

      if (rows.length === 0) {
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: rows[0]
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Create a new proposal
   */
  static async createProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      console.log('🔵 [PROPOSAL CREATE] Incoming request:', {
        tenantId: req.tenantId,
        userId: req.user?.id,
        body: req.body
      });

      const { title, client_name, blocks, status = 'draft' } = req.body;
      const tenantId = req.tenantId;
      const userId = req.user?.id;

      if (!title) {
        throw new ValidationError('Proposal title is required');
      }

      if (!blocks) {
        throw new ValidationError('Proposal blocks data is required');
      }

      const query = `
        INSERT INTO proposals (tenant_id, title, client_name, blocks_data, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const { rows } = await pool.query(query, [
        tenantId,
        title,
        client_name,
        JSON.stringify(blocks),
        status,
        userId
      ]);

      res.status(201).json({
        success: true,
        data: rows[0],
        message: 'Proposal created successfully'
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Update an existing proposal
   */
  static async updateProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, client_name, blocks, status } = req.body;
      const tenantId = req.tenantId;

      const query = `
        UPDATE proposals 
        SET title = COALESCE($1, title), 
            client_name = COALESCE($2, client_name), 
            blocks_data = COALESCE($3, blocks_data), 
            status = COALESCE($4, status),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND tenant_id = $6
        RETURNING *
      `;

      const { rows } = await pool.query(query, [
        title,
        client_name,
        blocks ? JSON.stringify(blocks) : null,
        status,
        id,
        tenantId
      ]);

      if (rows.length === 0) {
        res.status(404).json({ success: false, error: 'Proposal not found or unauthorized' });
        return;
      }

      res.status(200).json({
        success: true,
        data: rows[0],
        message: 'Proposal updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Delete a proposal
   */
  static async deleteProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      let { rowCount } = await pool.query('DELETE FROM proposals WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      
      // DEV FALLBACK: If delete failed but we are in dev, try deleting from fallback tenant
      if (rowCount === 0 && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        console.log('⚠️ [DEV FALLBACK] Delete failed for current tenant. Trying fallback:', fallbackId);
        const { rowCount: fallbackCount } = await pool.query('DELETE FROM proposals WHERE id = $1 AND tenant_id = $2', [id, fallbackId]);
        rowCount = fallbackCount;
      }

      if (rowCount === 0) {
        console.log(`❌ [DELETE FAILED] ID: ${id}, Tenant: ${tenantId}`);
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }


      res.status(200).json({
        success: true,
        message: 'Proposal deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Export a proposal to PDF and Word
   */
  static async exportProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      let tenantId = req.tenantId;

      // 1. Fetch proposal data
      let { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

      // DEV FALLBACK
      if (rows.length === 0 && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        const { rows: fallbackRows } = await pool.query('SELECT * FROM proposals WHERE id = $1 AND tenant_id = $2', [id, fallbackId]);
        rows = fallbackRows;
      }

      if (rows.length === 0) {
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }

      const proposal = rows[0];

      // 2. Generate and upload exports
      const { pdfUrl, docxUrl } = await ProposalExportService.generateAndUpload(proposal);

      res.status(200).json({
        success: true,
        data: { pdfUrl, docxUrl },
        message: 'Proposal exported successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Export error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
