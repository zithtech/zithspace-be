import pool from '@/config/dbpool';

export class ExperienceModel {

  static async create(data: any) {
    const query = `
      INSERT INTO experience (
        tenant_id, user_id, job_title, company_name,
        employment_type, location, start_date, end_date,
        current_job, description, responsibilities,
        achievements, skills_used
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *;
    `;

    const values = [
      data.tenant_id,
      data.user_id,
      data.job_title,
      data.company_name,
      data.employment_type,
      data.location,
      data.start_date,
      data.end_date,
      data.current_job,
      data.description,
      data.responsibilities || [],
      data.achievements || [],
      data.skills_used || []
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findAll(tenantId: string, userId: string) {
    const result = await pool.query(
      `SELECT * FROM experience WHERE tenant_id=$1 AND user_id=$2 ORDER BY start_date DESC`,
      [tenantId, userId]
    );
    return result.rows;
  }

  static async update(id: string, tenantId: string, userId: string, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    Object.entries(data).forEach(([key, value]) => {
      fields.push(`${key}=$${i}`);
      values.push(value);
      i++;
    });

    values.push(id, tenantId, userId);

    const query = `
      UPDATE experience SET ${fields.join(', ')}, updated_at=NOW()
      WHERE id=$${i} AND tenant_id=$${i+1} AND user_id=$${i+2}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id: string, tenantId: string, userId: string) {
    const result = await pool.query(
      `DELETE FROM experience WHERE id=$1 AND tenant_id=$2 AND user_id=$3`,
      [id, tenantId, userId]
    );
    return result.rowCount! > 0;
  }
}