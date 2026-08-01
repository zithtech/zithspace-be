// src/modules/pipeline/services/configService.ts
import { pipelinePool, withTenant } from '../db/pool';

export interface CreateConfigDto {
  role: string;
  min_experience?: number;
  max_experience?: number;
  rounds: {
    round_number: number;
    round_name: string;
    round_type: string;
    is_start_round: boolean;
    is_final_round: boolean;
    scorecards: {
      criteria_name: string;
      weight_percentage: number;
    }[];
  }[];
}

export async function createConfig(tenantId: string, data: CreateConfigDto) {
  return withTenant(tenantId, async (client) => {
    const { rows: configRows } = await client.query(
      `INSERT INTO pipeline_interview_configs (tenant_id, role, min_experience, max_experience)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, data.role, data.min_experience, data.max_experience]
    );
    const config = configRows[0];

    const rounds = [];
    for (const r of data.rounds) {
      const { rows } = await client.query(
        `INSERT INTO pipeline_interview_rounds 
         (tenant_id, config_id, round_number, round_name, round_type, is_start_round, is_final_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [tenantId, config.id, r.round_number, r.round_name, r.round_type, r.is_start_round, r.is_final_round]
      );
      const insertedRound = rows[0];
      const scorecards = [];
      if (r.scorecards) {
        for (const s of r.scorecards) {
          const { rows: scRows } = await client.query(
            `INSERT INTO pipeline_scorecard_criteria (tenant_id, round_id, criteria_name, weight_percentage)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenantId, insertedRound.id, s.criteria_name, s.weight_percentage]
          );
          scorecards.push(scRows[0]);
        }
      }
      rounds.push({ ...insertedRound, scorecards });
    }

    return { ...config, rounds };
  });
}

export async function getConfig(tenantId: string, id: string) {
  const { rows: configRows } = await pipelinePool.query(
    `SELECT * FROM pipeline_interview_configs WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  if (configRows.length === 0) throw new Error('Config not found');
  const config = configRows[0];

  const { rows: roundsRows } = await pipelinePool.query(
    `SELECT * FROM pipeline_interview_rounds WHERE tenant_id = $1 AND config_id = $2 ORDER BY round_number ASC`,
    [tenantId, id]
  );
  
  const roundIds = roundsRows.map(r => r.id);
  const rounds = [...roundsRows];

  if (roundIds.length > 0) {
    const { rows: scorecards } = await pipelinePool.query(
      `SELECT * FROM pipeline_scorecard_criteria WHERE tenant_id = $1 AND round_id = ANY($2) ORDER BY created_at ASC`,
      [tenantId, roundIds]
    );

    for (const r of rounds) {
      r.scorecards = scorecards.filter((sc: any) => sc.round_id === r.id);
    }
  }

  return { ...config, rounds };
}

export async function updateConfig(tenantId: string, id: string, data: CreateConfigDto) {
  return withTenant(tenantId, async (client) => {
    const { rows: configRows } = await client.query(
      `UPDATE pipeline_interview_configs 
       SET role = COALESCE($2, role), 
           min_experience = $3, 
           max_experience = $4,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $5 RETURNING *`,
      [tenantId, data.role, data.min_experience, data.max_experience, id]
    );
    const config = configRows[0];

    // Simple upsert logic: delete old rounds/criteria and insert new ones
    // Note: cascade delete on rounds will delete scorecards and interviews
    await client.query(`DELETE FROM pipeline_interview_rounds WHERE tenant_id = $1 AND config_id = $2`, [tenantId, id]);
    
    const rounds = [];
    for (const r of data.rounds) {
      const { rows } = await client.query(
        `INSERT INTO pipeline_interview_rounds 
         (tenant_id, config_id, round_number, round_name, round_type, is_start_round, is_final_round)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [tenantId, id, r.round_number, r.round_name, r.round_type, r.is_start_round, r.is_final_round]
      );
      const insertedRound = rows[0];
      const scorecards = [];
      if (r.scorecards) {
        for (const s of r.scorecards) {
          const { rows: scRows } = await client.query(
            `INSERT INTO pipeline_scorecard_criteria (tenant_id, round_id, criteria_name, weight_percentage)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenantId, insertedRound.id, s.criteria_name, s.weight_percentage]
          );
          scorecards.push(scRows[0]);
        }
      }
      rounds.push({ ...insertedRound, scorecards });
    }

    return { ...config, rounds };
  });
}

export async function deleteConfig(tenantId: string, id: string) {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `DELETE FROM pipeline_interview_configs WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenantId, id]
    );
    return rows[0];
  });
}

export async function listConfigs(tenantId: string) {
  const { rows: configs } = await pipelinePool.query(
    `SELECT * FROM pipeline_interview_configs WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );

  const configsMap = new Map(configs.map((c: any) => [c.id, { ...c, rounds: [] }]));

  if (configs.length > 0) {
    const { rows: rounds } = await pipelinePool.query(
      `SELECT * FROM pipeline_interview_rounds WHERE tenant_id = $1 ORDER BY round_number ASC`,
      [tenantId]
    );

    const roundsMap = new Map(rounds.map((r: any) => [r.id, { ...r, scorecards: [] }]));

    const { rows: scorecards } = await pipelinePool.query(
      `SELECT * FROM pipeline_scorecard_criteria WHERE tenant_id = $1`,
      [tenantId]
    );

    for (const s of scorecards) {
      if (roundsMap.has(s.round_id)) {
        roundsMap.get(s.round_id).scorecards.push(s);
      }
    }

    for (const r of roundsMap.values()) {
      if (configsMap.has(r.config_id)) {
        configsMap.get(r.config_id).rounds.push(r);
      }
    }
  }

  return Array.from(configsMap.values());
}
