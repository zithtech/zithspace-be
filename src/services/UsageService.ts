import pool from '../config/dbpool';

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

  async increment(tenantId: string, limitKey: string, amount: number = 1): Promise<void> {
    const period = this.getCurrentPeriod(limitKey);
    try {
        await pool.query(`
        INSERT INTO tenant_usage (tenant_id, usage_key, period, used)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, usage_key, period) 
        DO UPDATE SET used = tenant_usage.used + EXCLUDED.used, updated_at = CURRENT_TIMESTAMP
        `, [tenantId, limitKey, period, amount]);
    } catch (err) {
        console.error('Failed to increment usage', err);
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
