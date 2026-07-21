import pool from '../config/dbpool';
import { AIFeature } from '../ai/types/AIFeature';
import { PricingResult } from '../ai/interfaces/PricingResult';

export class UsageService {
  /**
   * Dynamically fetch usage based on the limit catalog type.
   */
  async getUsage(tenantId: string, limitKey: string, type: string): Promise<number> {
    switch (type) {
      case 'COUNT':
        return await this.getCountUsage(tenantId, limitKey);
      case 'SUM':
        return await this.getSumUsage(tenantId, limitKey);
      case 'INCREMENT':
        return await this.getIncrementalUsage(tenantId, limitKey);
      default:
        return 0;
    }
  }

  private async getCountUsage(tenantId: string, limitKey: string): Promise<number> {
    let query = '';
    switch (limitKey) {
      case 'members':
        query = 'SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND (is_deleted = false OR is_deleted IS NULL)';
        break;
      case 'clients':
        query = 'SELECT COUNT(*) FROM clients WHERE tenant_id = $1';
        break;
      case 'projects':
        query = 'SELECT COUNT(*) FROM projects WHERE tenant_id = $1';
        break;
      case 'leads':
        query = 'SELECT COUNT(*) FROM leads WHERE tenant_id = $1';
        break;
      case 'client_portal_users':
        query = 'SELECT COUNT(*) FROM client_portal_users WHERE tenant_id = $1';
        break;
      default:
        return 0;
    }
    
    try {
        const res = await pool.query(query, [tenantId]);
        return parseInt(res.rows[0].count, 10);
    } catch (err) {
        // Table might not exist yet if not all features implemented
        return 0;
    }
  }

  private async getSumUsage(tenantId: string, limitKey: string): Promise<number> {
    // Currently only storage_gb would use this
    if (limitKey === 'storage_gb') {
      // We need to implement cross-table storage sum or track it incrementally via R2 uploads.
      // The documents table does not have a file_size column as they are JSON hubs.
    }
    return 0;
  }

  private async getIncrementalUsage(tenantId: string, limitKey: string): Promise<number> {
    const period = this.getCurrentPeriod(limitKey);
    try {
        const res = await pool.query(`
        SELECT used FROM tenant_usage 
        WHERE tenant_id = $1 AND usage_key = $2 AND period = $3
        `, [tenantId, limitKey, period]);
        
        return res.rows.length ? parseFloat(res.rows[0].used) : 0;
    } catch (err) {
        return 0;
    }
  }

  async increment(tenantId: string, limitKey: string, feature: AIFeature, pricing: PricingResult): Promise<void> {
    const period = this.getCurrentPeriod(limitKey);
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Atomic upsert to tenant_usage
        await client.query(`
        INSERT INTO tenant_usage (tenant_id, usage_key, period, used)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, usage_key, period) 
        DO UPDATE SET used = tenant_usage.used + EXCLUDED.used, updated_at = CURRENT_TIMESTAMP
        `, [tenantId, limitKey, period, pricing.credits]);

        // 2. Insert audit log into usage_events
        await client.query(`
        INSERT INTO usage_events (
            tenant_id, feature, credits, ai_request_id, provider, model, 
            prompt_tokens, completion_tokens, provider_cost
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            tenantId, 
            feature, 
            pricing.credits,
            pricing.aiRequestId || null,
            pricing.provider,
            pricing.model,
            pricing.promptTokens,
            pricing.completionTokens,
            pricing.providerCost
        ]);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed to increment usage', err);
        throw err;
    } finally {
        client.release();
    }
  }

  async decrement(tenantId: string, limitKey: string, amount: number = 1): Promise<void> {
    const period = this.getCurrentPeriod(limitKey);
    try {
        await pool.query(`
        UPDATE tenant_usage 
        SET used = GREATEST(used - $4, 0), updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND usage_key = $2 AND period = $3
        `, [tenantId, limitKey, period, amount]);
    } catch (err) {
        console.error('Failed to decrement usage', err);
    }
  }

  private getCurrentPeriod(limitKey: string): string {
    if (limitKey.includes('month')) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return 'LIVE';
  }
}

export const usageService = new UsageService();
