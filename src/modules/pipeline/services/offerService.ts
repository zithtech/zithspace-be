// src/modules/pipeline/services/offerService.ts
import { pipelinePool, withTenant } from '../db/pool';

export interface GenerateOfferDto {
  candidate_id: string;
  salary: number;
}

export async function generateOffer(tenantId: string, userId: string, data: GenerateOfferDto) {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO pipeline_offers (tenant_id, candidate_id, salary, status)
       VALUES ($1, $2, $3, 'Draft') RETURNING *`,
      [tenantId, data.candidate_id, data.salary]
    );
    const offer = rows[0];

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'GENERATE_OFFER', 'Drafted offer letter')`,
      [tenantId, data.candidate_id, userId]
    );

    await client.query(
      `UPDATE pipeline_candidates SET status = 'Offered' WHERE id = $1 AND tenant_id = $2`,
      [data.candidate_id, tenantId]
    );

    return offer;
  });
}

export async function listCandidateOffers(tenantId: string, candidateId: string) {
  const { rows } = await pipelinePool.query(
    `SELECT * FROM pipeline_offers WHERE tenant_id = $1 AND candidate_id = $2 ORDER BY created_at DESC`,
    [tenantId, candidateId]
  );
  return rows;
}
