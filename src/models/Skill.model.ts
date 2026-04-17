import pool from '@/config/dbPool';

export interface Skill {
  id?: string;
  tenant_id: string;
  user_id: string;
  name: string;
  category?: string;
  proficiency_level?: string;
  years_of_experience?: number;
  description?: string;
  certifications?: string[];
  is_active?: boolean;
}

export class SkillModel {

  static async create(data: Skill) {
    const query = `
      INSERT INTO skills (
        tenant_id, user_id, name, category,
        proficiency_level, years_of_experience,
        description, certifications, is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *;
    `;

    const values = [
      data.tenant_id,
      data.user_id,
      data.name,
      data.category,
      data.proficiency_level,
      data.years_of_experience,
      data.description,
      data.certifications || [],
      data.is_active ?? true
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findAll(tenantId: string, userId: string) {
    const result = await pool.query(
      `SELECT * FROM skills WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC`,
      [tenantId, userId]
    );
    return result.rows;
  }

  static async update(id: string, tenantId: string, userId: string, data: Partial<Skill>) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    Object.entries(data).forEach(([key, value]) => {
      fields.push(`${key}=$${i}`);
      values.push(Array.isArray(value) ? value : value);
      i++;
    });

    values.push(id, tenantId, userId);

    const query = `
      UPDATE skills SET ${fields.join(', ')}, updated_at=NOW()
      WHERE id=$${i} AND tenant_id=$${i+1} AND user_id=$${i+2}
      RETURNING *;
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id: string, tenantId: string, userId: string) {
    const result = await pool.query(
      `DELETE FROM skills WHERE id=$1 AND tenant_id=$2 AND user_id=$3`,
      [id, tenantId, userId]
    );
    return result.rowCount! > 0;
  }

  static async bulkSync(tenantId: string, userId: string, skillNames: string[], platform: string) {
    if (!skillNames || skillNames.length === 0) return [];

    const normPlatform = platform.toLowerCase();

    // 1. Get all existing skills for this user to compare names
    const existingResult = await pool.query(
      `SELECT id, name, category FROM skills WHERE tenant_id=$1 AND user_id=$2`,
      [tenantId, userId]
    );
    
    const skillsByName = new Map<string, any>();
    existingResult.rows.forEach(r => {
      skillsByName.set(r.name.toLowerCase(), r);
    });

    const toInsert: string[] = [];
    const toUpdate: { id: string, newCategory: string }[] = [];

    // 2. Categorize incoming skills
    skillNames.forEach(name => {
      const lowerName = name.toLowerCase();
      const existing = skillsByName.get(lowerName);

      if (!existing) {
        // Brand new skill
        toInsert.push(name);
      } else {
        // Existing skill - check if we need to add this platform to its categories
        const currentCategories = (existing.category || '')
          .split(',')
          .map((c: string) => c.trim().toLowerCase())
          .filter((c: string) => c.length > 0);
        
        if (!currentCategories.includes(normPlatform)) {
          currentCategories.push(normPlatform);
          toUpdate.push({
            id: existing.id,
            newCategory: currentCategories.join(', ')
          });
        }
      }
    });

    const results: any[] = [];

    // 3. Batch Insert New Skills
    if (toInsert.length > 0) {
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      toInsert.forEach((name) => {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
        values.push(tenantId, userId, name, normPlatform);
        paramIndex += 4;
      });

      const insertQuery = `
        INSERT INTO skills (tenant_id, user_id, name, category)
        VALUES ${placeholders.join(', ')}
        RETURNING *;
      `;
      const insertRes = await pool.query(insertQuery, values);
      results.push(...insertRes.rows);
    }

    // 4. Update Existing Skills (Category Merge)
    for (const update of toUpdate) {
      const updateRes = await pool.query(
        `UPDATE skills SET category=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [update.newCategory, update.id]
      );
      results.push(updateRes.rows[0]);
    }

    console.log(`Bulk Sync: ${toInsert.length} inserted, ${toUpdate.length} updated.`);
    return results;
  }
}