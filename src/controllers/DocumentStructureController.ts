import { Response } from 'express';
import { AuthRequest } from '../types';
import pool from '../config/dbpool';

export class DocumentStructureController {
  static async getStructures(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const result = await pool.query(`
        SELECT id, tenant_id AS "tenantId", name, html_content AS "htmlContent", created_by_id AS "createdById", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM document_structures
        WHERE tenant_id IN ($1, 'GLOBAL')
        ORDER BY created_at DESC
      `, [tenantId]);
      
      const structures = result.rows;

      return res.status(200).json({
        success: true,
        data: structures,
      });
    } catch (error: any) {
      console.error('Error fetching document structures:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  static async createStructure(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user?.id!;
      const { name, htmlContent } = req.body;

      if (!name || !htmlContent) {
        return res.status(400).json({
          success: false,
          message: 'Name and HTML content are required',
        });
      }

      const result = await pool.query(`
        INSERT INTO document_structures (id, tenant_id, name, html_content, created_by_id, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        RETURNING id, tenant_id AS "tenantId", name, html_content AS "htmlContent", created_by_id AS "createdById", created_at AS "createdAt", updated_at AS "updatedAt"
      `, [tenantId, name, htmlContent, userId]);
      
      const structure = result.rows[0];

      return res.status(201).json({
        success: true,
        data: structure,
      });
    } catch (error: any) {
      console.error('Error creating document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  static async updateStructure(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;
      const { name, htmlContent } = req.body;

      if (!name || !htmlContent) {
        return res.status(400).json({
          success: false,
          message: 'Name and HTML content are required',
        });
      }

      const existRes = await pool.query(`SELECT id, tenant_id AS "tenantId" FROM document_structures WHERE id = $1 LIMIT 1`, [id]);
      const existing = existRes.rows[0];

      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({
          success: false,
          message: 'Structure not found or you do not have permission',
        });
      }

      if (existing.tenantId === 'GLOBAL') {
        return res.status(403).json({
          success: false,
          message: 'Global structures cannot be edited',
        });
      }

      const updateRes = await pool.query(`
        UPDATE document_structures 
        SET name = $1, html_content = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, tenant_id AS "tenantId", name, html_content AS "htmlContent", created_by_id AS "createdById", created_at AS "createdAt", updated_at AS "updatedAt"
      `, [name, htmlContent, id]);
      
      const updated = updateRes.rows[0];

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error: any) {
      console.error('Error updating document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  static async deleteStructure(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const existRes = await pool.query(`SELECT id, tenant_id AS "tenantId" FROM document_structures WHERE id = $1 LIMIT 1`, [id]);
      const existing = existRes.rows[0];

      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({
          success: false,
          message: 'Structure not found or you do not have permission',
        });
      }

      if (existing.tenantId === 'GLOBAL') {
        return res.status(403).json({
          success: false,
          message: 'Global structures cannot be deleted',
        });
      }

      await pool.query(`DELETE FROM document_structures WHERE id = $1`, [id]);

      return res.status(200).json({
        success: true,
        message: 'Structure deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  static async getStructureById(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;

      const result = await pool.query(`
        SELECT id, tenant_id AS "tenantId", name, html_content AS "htmlContent", created_by_id AS "createdById", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM document_structures
        WHERE id = $1
        LIMIT 1
      `, [id]);
      
      const structure = result.rows[0];

      if (!structure || (structure.tenantId !== tenantId && structure.tenantId !== 'GLOBAL')) {
        return res.status(404).json({
          success: false,
          message: 'Structure not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: structure,
      });
    } catch (error: any) {
      console.error('Error fetching document structure:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }
}
