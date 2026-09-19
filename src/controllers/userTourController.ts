import { Request, Response } from 'express';
import pool, { withTenant } from '@/config/dbpool';

export class UserTourController {
  
  static async getTours(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const tenantId = (req as any).tenantId;
      if (!userId || !tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Use withTenant to ensure strict tenant isolation over raw pg pool
      const result = await withTenant(tenantId, async (client) => {
        return client.query(`
          SELECT 
            tour_key as "tourKey",
            status,
            current_step as "currentStep",
            started_at as "startedAt",
            completed_at as "completedAt",
            skipped_at as "skippedAt"
          FROM user_tour_progress
          WHERE user_id = $1 AND tenant_id = $2
        `, [userId, tenantId]);
      });

      return res.json({ tours: result.rows });
    } catch (error) {
      console.error('Error fetching tours:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async updateTourProgress(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const tenantId = (req as any).tenantId;
      if (!userId || !tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { tourKey } = req.params;
      const { status, currentStep } = req.body;

      if (!tourKey || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      let completedAt = null;
      let skippedAt = null;

      if (status === 'COMPLETED') {
        completedAt = new Date();
      } else if (status === 'SKIPPED') {
        skippedAt = new Date();
      }

      await withTenant(tenantId, async (client) => {
        await client.query(`
          INSERT INTO user_tour_progress (
            tenant_id, user_id, tour_key, status, current_step, completed_at, skipped_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7
          )
          ON CONFLICT (tenant_id, user_id, tour_key) DO UPDATE SET
            status = EXCLUDED.status,
            current_step = EXCLUDED.current_step,
            completed_at = COALESCE(EXCLUDED.completed_at, user_tour_progress.completed_at),
            skipped_at = COALESCE(EXCLUDED.skipped_at, user_tour_progress.skipped_at),
            updated_at = CURRENT_TIMESTAMP
        `, [tenantId, userId, tourKey, status, currentStep || 0, completedAt, skippedAt]);
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Error updating tour:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}
