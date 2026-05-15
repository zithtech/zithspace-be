import { Response } from 'express';
import pool from '@/config/dbpool';
import { AuthRequest, ApiResponse } from '@/types';

/**
 * Per-user, per-table UI preferences (column visibility, density, etc.).
 * Stored as JSONB so every table can persist whatever shape it needs.
 */
export class UserTablePreferenceController {
  /**
   * Get a user's preferences for a specific table.
   * @route GET /api/user/table-preferences/:tableKey
   */
  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;
      const tenantId = req.tenantId;
      const tableKey = (req.params.tableKey || '').trim();

      if (!tableKey) {
        res.status(400).json({
          success: false,
          error: 'tableKey is required',
        } as ApiResponse);
        return;
      }

      const result = await pool.query(
        `SELECT preferences FROM user_table_preferences
         WHERE user_id = $1 AND tenant_id = $2 AND table_key = $3
         LIMIT 1`,
        [userId, tenantId, tableKey]
      );

      res.status(200).json({
        success: true,
        data: result.rows[0]?.preferences ?? {},
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get table preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch table preferences',
      } as ApiResponse);
    }
  }

  /**
   * Upsert a user's preferences for a specific table.
   * Body shape is opaque: { density?, hiddenCols?, ...anything }.
   * @route PUT /api/user/table-preferences/:tableKey
   */
  static async upsert(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;
      const tenantId = req.tenantId;
      const tableKey = (req.params.tableKey || '').trim();

      if (!tableKey) {
        res.status(400).json({
          success: false,
          error: 'tableKey is required',
        } as ApiResponse);
        return;
      }

      const preferences = req.body && typeof req.body === 'object' ? req.body : {};

      const result = await pool.query(
        `INSERT INTO user_table_preferences (user_id, tenant_id, table_key, preferences, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
         ON CONFLICT (user_id, tenant_id, table_key)
         DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()
         RETURNING preferences`,
        [userId, tenantId, tableKey, JSON.stringify(preferences)]
      );

      res.status(200).json({
        success: true,
        data: result.rows[0]?.preferences ?? preferences,
        message: 'Table preferences saved',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Upsert table preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save table preferences',
      } as ApiResponse);
    }
  }

  /**
   * Delete a user's preferences for a specific table (reset to defaults).
   * @route DELETE /api/user/table-preferences/:tableKey
   */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({
          success: false,
          error: 'Tenant context and authentication required',
        } as ApiResponse);
        return;
      }

      const userId = req.user.id;
      const tenantId = req.tenantId;
      const tableKey = (req.params.tableKey || '').trim();

      if (!tableKey) {
        res.status(400).json({
          success: false,
          error: 'tableKey is required',
        } as ApiResponse);
        return;
      }

      await pool.query(
        `DELETE FROM user_table_preferences
         WHERE user_id = $1 AND tenant_id = $2 AND table_key = $3`,
        [userId, tenantId, tableKey]
      );

      res.status(200).json({
        success: true,
        message: 'Table preferences cleared',
      } as ApiResponse);
    } catch (error: any) {
      console.error('Delete table preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete table preferences',
      } as ApiResponse);
    }
  }
}
