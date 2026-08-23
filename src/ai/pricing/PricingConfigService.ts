import pool from '../../config/dbpool';

export class PricingConfigService {
    private static cache: Map<string, { value: string, timestamp: number }> = new Map();
    private static CACHE_TTL_MS = 60 * 1000; // 1 minute

    static async getConfigValue(key: string, defaultValue: string): Promise<string> {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
            return cached.value;
        }

        try {
            const result = await pool.query('SELECT value FROM ai_credit_config WHERE key = $1', [key]);
            if (result.rows.length > 0) {
                const value = result.rows[0].value;
                this.cache.set(key, { value, timestamp: Date.now() });
                return value;
            }
        } catch (err) {
            console.error('Error fetching ai_credit_config for key:', key, err);
        }

        return defaultValue;
    }

    static async getConversionRate(): Promise<number> {
        const val = await this.getConfigValue('credit_conversion_rate', '0.005');
        return parseFloat(val);
    }

    static async getMinimumCredit(): Promise<number> {
        const val = await this.getConfigValue('minimum_credit', '1');
        return parseFloat(val);
    }

    static async getRoundingStrategy(): Promise<'CEIL' | 'FLOOR' | 'ROUND'> {
        const val = await this.getConfigValue('rounding_strategy', 'CEIL');
        if (val === 'FLOOR' || val === 'ROUND') return val;
        return 'CEIL';
    }
}
