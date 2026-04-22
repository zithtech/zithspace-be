import pool from '../config/dbpool';

export interface BidIQData {
  id?: string;
  lead_id: string;
  tenant_id: string;
  strategic_score: number;
  skill_match_percentage: number;
  market_value: number;
  suggested_bid: number;
  anchor_price?: number;
  avg_bid_prediction?: number;
  client_quality_score?: number;
  budget_fairness_score?: number;
  predicted_bids_count?: number;
  complexity?: string;
  estimated_hours?: number;
  summary?: string;
  gaps?: any;
  risks?: any;
  missing_skills?: string[];
  created_at?: Date;
  updated_at?: Date;
}

export class BidIQModel {
  /**
   * Initialize the table if it doesn't exist
   */
  static async initTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS bidiq_intelligence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL,
        strategic_score INTEGER DEFAULT 0,
        skill_match_percentage INTEGER DEFAULT 0,
        market_value NUMERIC(15,2) DEFAULT 0,
        suggested_bid NUMERIC(15,2) DEFAULT 0,
        anchor_price NUMERIC(15,2),
        avg_bid_prediction NUMERIC(15,2),
        client_quality_score NUMERIC(5,2),
        budget_fairness_score NUMERIC(5,2),
        predicted_bids_count INTEGER,
        complexity VARCHAR(50),
        estimated_hours INTEGER,
        summary TEXT,
        gaps JSONB,
        risks JSONB,
        missing_skills JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lead_id)
      );
    `;
    await pool.query(query);
  }

  /**
   * Create or update intelligence for a lead
   */
  static async upsert(data: BidIQData): Promise<any> {
    const query = `
      INSERT INTO bidiq_intelligence (
        lead_id, tenant_id, strategic_score, skill_match_percentage, market_value, suggested_bid,
        anchor_price, avg_bid_prediction, client_quality_score, 
        budget_fairness_score, predicted_bids_count, complexity, 
        estimated_hours, summary, gaps, risks, missing_skills
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (lead_id) DO UPDATE SET
        strategic_score = EXCLUDED.strategic_score,
        skill_match_percentage = EXCLUDED.skill_match_percentage,
        market_value = EXCLUDED.market_value,
        suggested_bid = EXCLUDED.suggested_bid,
        anchor_price = EXCLUDED.anchor_price,
        avg_bid_prediction = EXCLUDED.avg_bid_prediction,
        client_quality_score = EXCLUDED.client_quality_score,
        budget_fairness_score = EXCLUDED.budget_fairness_score,
        predicted_bids_count = EXCLUDED.predicted_bids_count,
        complexity = EXCLUDED.complexity,
        estimated_hours = EXCLUDED.estimated_hours,
        summary = EXCLUDED.summary,
        gaps = EXCLUDED.gaps,
        risks = EXCLUDED.risks,
        missing_skills = EXCLUDED.missing_skills,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const values = [
      data.lead_id, data.tenant_id, data.strategic_score, data.skill_match_percentage, data.market_value, data.suggested_bid,
      data.anchor_price, data.avg_bid_prediction, data.client_quality_score,
      data.budget_fairness_score, data.predicted_bids_count, data.complexity,
      data.estimated_hours, data.summary, 
      JSON.stringify(data.gaps || {}), 
      JSON.stringify(data.risks || []),
      JSON.stringify(data.missing_skills || [])
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Find intelligence by lead ID
   */
  static async findByLeadId(leadId: string, tenantId: string): Promise<any> {
    const query = `
      SELECT * FROM bidiq_intelligence 
      WHERE lead_id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [leadId, tenantId]);
    return result.rows[0];
  }
}
