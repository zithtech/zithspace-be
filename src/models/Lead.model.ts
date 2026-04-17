import pool from '@/config/dbpool';

export interface LeadData {
  id?: string;
  tenant_id: string;
  client_name: string;
  client_mail: string;
  client_phone?: string;
  client_location?: string;
  title: string;
  summary?: string;
  skills?: string[];
  duration?: string;
  hour_based_amount?: number;
  job_link?: string;
  est_project_duration?: string;
  status?: string;
  actions_item?: string;
  timeline_start?: Date;
  timeline_end?: Date;
  posted_on?: Date;
  documents?: { name: string; url: string }[];
  
  // Job Metadata
  external_job_id?: string;
  experience_level?: string;
  job_type?: string;
  budget?: string;
  hourly_rate?: string;
  
  // Client Quality Data
  client_rating?: string;
  client_spend?: string;
  client_jobs_posted?: string;
  client_payment_verified?: boolean;
  client_phone_verified?: boolean;
  
  // AI & Proposal Data
  ai_score?: number;
  proposal_text?: string;
  template_used?: string;
  platform?: string;
  internal_notes?: string;
  skill_analysis?: any;
  ai_summary?: string;
}

export class LeadModel {
  /**
   * Create a new lead
   */
  static async create(data: LeadData): Promise<any> {
    const query = `
      INSERT INTO leads (
        tenant_id, client_name, client_mail, client_phone, client_location,
        title, summary, skills, duration, hour_based_amount,
        job_link, est_project_duration, status, actions_item,
        timeline_start, timeline_end, posted_on, documents,
        external_job_id, experience_level, job_type, budget, hourly_rate,
        client_rating, client_spend, client_jobs_posted, client_payment_verified,
        client_phone_verified, ai_score, proposal_text, template_used, platform,
        internal_notes, skill_analysis, ai_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
      RETURNING *;
    `;

    const values = [
      data.tenant_id,
      data.client_name,
      data.client_mail,
      data.client_phone,
      data.client_location,
      data.title,
      data.summary,
      JSON.stringify(data.skills || []),
      data.duration,
      data.hour_based_amount || 0,
      data.job_link,
      data.est_project_duration,
      data.status || 'Open',
      data.actions_item,
      data.timeline_start,
      data.timeline_end,
      data.posted_on || new Date(),
      JSON.stringify(data.documents || []),
      data.external_job_id,
      data.experience_level,
      data.job_type,
      data.budget,
      data.hourly_rate,
      data.client_rating,
      data.client_spend,
      data.client_jobs_posted,
      data.client_payment_verified || false,
      data.client_phone_verified || false,
      data.ai_score || 0,
      data.proposal_text,
      data.template_used,
      data.platform || 'Upwork',
      data.internal_notes,
      data.skill_analysis ? JSON.stringify(data.skill_analysis) : null,
      data.ai_summary
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadModel.create:');
      console.error('Message:', error.message);
      console.error('Detail:', error.detail);
      console.error('Constraint:', error.constraint);
      throw error;
    }
  }

  /**
   * Find all leads for a specific tenant
   */
  static async findAll(tenantId: string): Promise<any[]> {
    const query = `
      SELECT * FROM leads 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [tenantId]);
    return result.rows;
  }

  /**
   * Find a specific lead by ID and tenant ID
   */
  static async findById(id: string, tenantId: string): Promise<any> {
    const query = `
      SELECT * FROM leads 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return result.rows[0];
  }

  /**
   * Update a lead
   */
  static async update(id: string, tenantId: string, data: Partial<LeadData>): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    // Build dynamic UPDATE query
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'tenant_id') {
        fields.push(`${key} = $${placeholderIndex}`);
        values.push(Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value);
        placeholderIndex++;
      }
    });

    if (fields.length === 0) return null;

    values.push(id, tenantId);
    const query = `
      UPDATE leads 
      SET ${fields.join(', ')} 
      WHERE id = $${placeholderIndex} AND tenant_id = $${placeholderIndex + 1}
      RETURNING *;
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('DATABASE ERROR in LeadModel.update:');
      console.error('Message:', error.message);
      console.error('Detail:', error.detail);
      console.error('Constraint:', error.constraint);
      throw error;
    }
  }

  /**
   * Delete a lead
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM leads 
      WHERE id = $1 AND tenant_id = $2;
    `;
    const result = await pool.query(query, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
