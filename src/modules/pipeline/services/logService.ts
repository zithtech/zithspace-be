// src/modules/pipeline/services/logService.ts
import { pipelinePool } from '../db/pool';

export async function listCandidateLogs(tenantId: string, candidateId: string) {
  const { rows } = await pipelinePool.query(
    `SELECT l.*, u.name as user_name 
     FROM pipeline_activity_logs l 
     LEFT JOIN users u ON l.user_id::text = u.id::text
     WHERE l.tenant_id = $1::uuid AND l.candidate_id = $2::uuid 
     ORDER BY l.created_at DESC`,
    [tenantId, candidateId]
  );
  return rows;
}
