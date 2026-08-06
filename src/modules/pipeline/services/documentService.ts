import { pipelinePool, withTenant } from '../db/pool';
import { PipelineError } from '../types';
import { randomUUID } from 'crypto';
import { uploadCandidateDocumentToR2 } from '../../../utils/r2Client';
import { extractAndHashAadhaar } from './aadhaarExtractor';

export async function requestCandidateDocuments(tenantId: string, userId: string, candidateId: string, documents: string[]) {
  return withTenant(tenantId, async (client) => {
    // Check candidate
    const { rows: candRows } = await client.query(
      `SELECT id, document_portal_token FROM pipeline_candidates WHERE id = $1 AND tenant_id = $2`,
      [candidateId, tenantId]
    );
    if (!candRows.length) throw new PipelineError('Candidate not found', 'NOT_FOUND', 404);
    
    let token = candRows[0].document_portal_token;
    if (!token) {
      token = randomUUID();
      await client.query(
        `UPDATE pipeline_candidates SET document_portal_token = $1 WHERE id = $2`,
        [token, candidateId]
      );
    }

    // Insert documents
    for (const doc of documents) {
      // Check if this document already exists and is pending/under review/etc (optional logic to avoid dupes)
      const { rows: existing } = await client.query(
        `SELECT id FROM pipeline_candidate_documents WHERE candidate_id = $1 AND document_type = $2`,
        [candidateId, doc]
      );

      if (!existing.length) {
        await client.query(
          `INSERT INTO pipeline_candidate_documents (tenant_id, candidate_id, document_type, status)
           VALUES ($1, $2, $3, 'Pending')`,
          [tenantId, candidateId, doc]
        );
      }
    }

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'DOCUMENT_REQUEST', $4)`,
      [tenantId, candidateId, userId, `Requested ${documents.length} document(s)`]
    );

    return { token };
  });
}

export async function getCandidateDocuments(tenantId: string, candidateId: string) {
  const { rows } = await pipelinePool.query(
    `SELECT * FROM pipeline_candidate_documents WHERE tenant_id = $1 AND candidate_id = $2 ORDER BY created_at ASC`,
    [tenantId, candidateId]
  );
  return rows;
}

export async function verifyCandidateDocument(tenantId: string, userId: string, candidateId: string, documentId: string, status: string, remarks?: string) {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `UPDATE pipeline_candidate_documents 
       SET status = $1, remarks = $2, updated_at = now()
       WHERE id = $3 AND tenant_id = $4 AND candidate_id = $5
       RETURNING *`,
      [status, remarks || null, documentId, tenantId, candidateId]
    );
    if (!rows.length) throw new PipelineError('Document not found', 'NOT_FOUND', 404);

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'DOCUMENT_VERIFY', $4)`,
      [tenantId, candidateId, userId, `Document ${rows[0].document_type} status updated to ${status}`]
    );

    return rows[0];
  });
}

// PORTAL METHODS

export async function getPortalDocuments(token: string) {
  const { rows: candRows } = await pipelinePool.query(
    `SELECT id, name, role, tenant_id FROM pipeline_candidates WHERE document_portal_token = $1`,
    [token]
  );
  if (!candRows.length) throw new PipelineError('Invalid token', 'INVALID_TOKEN', 401);
  
  const candidate = candRows[0];

  const { rows: docRows } = await pipelinePool.query(
    `SELECT id, document_type, status, remarks, document_url, updated_at FROM pipeline_candidate_documents WHERE candidate_id = $1 ORDER BY created_at ASC`,
    [candidate.id]
  );

  return {
    candidate: { name: candidate.name, role: candidate.role },
    documents: docRows
  };
}

export async function uploadPortalDocument(token: string, documentId: string, base64Str: string, fileName: string, mimetype: string) {
  // Use a regular pool client for the update, since we get tenant_id from the token
  const { rows: candRows } = await pipelinePool.query(
    `SELECT id, tenant_id FROM pipeline_candidates WHERE document_portal_token = $1`,
    [token]
  );
  if (!candRows.length) throw new PipelineError('Invalid token', 'INVALID_TOKEN', 401);
  const tenantId = candRows[0].tenant_id;
  const candidateId = candRows[0].id;

  const { rows: docRows } = await pipelinePool.query(
    `SELECT document_type FROM pipeline_candidate_documents WHERE id = $1 AND candidate_id = $2`,
    [documentId, candidateId]
  );
  if (!docRows.length) throw new PipelineError('Document not found', 'NOT_FOUND', 404);
  const docTypeStr = docRows[0].document_type;

  const dataUri = `data:${mimetype};base64,${base64Str}`;

  let finalHash = null;
  if (docTypeStr === 'Aadhaar Card') {
    finalHash = await extractAndHashAadhaar(dataUri);
    // Check duplicate
    const { rows: dupeRows } = await pipelinePool.query(
      `SELECT id FROM pipeline_candidates WHERE tenant_id = $1 AND aadhaar_hash = $2 AND id != $3`,
      [tenantId, finalHash, candidateId]
    );
    if (dupeRows.length > 0) {
      await pipelinePool.query(
        `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description) VALUES ($1, $2, NULL, $3, $4)`,
        [tenantId, candidateId, 'Duplicate_Aadhaar_Attempt', 'Candidate attempted to upload an Aadhaar card that is already registered for another application within 6 months.']
      );
      await pipelinePool.query(
        `UPDATE pipeline_candidates SET document_portal_token = NULL WHERE id = $1`,
        [candidateId]
      );
      throw new PipelineError('Duplicate Candidate: This Aadhaar is already registered for a 6-month period.', 'DUPLICATE_AADHAAR', 400);
    }
    // Store hash on candidate
    await pipelinePool.query(
      `UPDATE pipeline_candidates SET aadhaar_hash = $1 WHERE id = $2`,
      [finalHash, candidateId]
    );
  }

  const fileUrl = await uploadCandidateDocumentToR2(
    dataUri,
    fileName,
    tenantId,
    candidateId,
    docTypeStr
  );

  const { rows } = await pipelinePool.query(
    `UPDATE pipeline_candidate_documents 
     SET document_url = $1, status = 'Under Review', updated_at = now()
     WHERE id = $2 AND candidate_id = $3
     RETURNING *`,
    [fileUrl, documentId, candidateId]
  );

  await pipelinePool.query(
    `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
     VALUES ($1, $2, null, 'DOCUMENT_UPLOAD', $3)`,
    [tenantId, candidateId, `Candidate uploaded document: ${rows[0].document_type}`]
  );

  return rows[0];
}

export async function uploadManualDocument(tenantId: string, userId: string, candidateId: string, docTypeStr: string, base64Str: string, fileName: string, mimetype: string) {
  return withTenant(tenantId, async (client) => {
    const dataUri = `data:${mimetype};base64,${base64Str}`;

    let finalHash = null;
    if (docTypeStr === 'Aadhaar Card') {
      finalHash = await extractAndHashAadhaar(dataUri);
      // Check duplicate
      const { rows: dupeRows } = await client.query(
        `SELECT id FROM pipeline_candidates WHERE tenant_id = $1 AND aadhaar_hash = $2 AND id != $3`,
        [tenantId, finalHash, candidateId]
      );
      if (dupeRows.length > 0) {
        await client.query(
          `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description) VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, candidateId, userId, 'Duplicate_Aadhaar_Attempt', 'HR manually attempted to upload an Aadhaar card that is already registered for another application within 6 months.']
        );
        throw new PipelineError('Duplicate Candidate: This Aadhaar is already registered for a 6-month period.', 'DUPLICATE_AADHAAR', 400);
      }
      // Store hash on candidate
      await client.query(
        `UPDATE pipeline_candidates SET aadhaar_hash = $1 WHERE id = $2`,
        [finalHash, candidateId]
      );
    }

    const fileUrl = await uploadCandidateDocumentToR2(
      dataUri,
      fileName,
      tenantId,
      candidateId,
      docTypeStr
    );

    // Upsert the document
    const { rows: existingDocs } = await client.query(
      `SELECT id FROM pipeline_candidate_documents WHERE tenant_id = $1 AND candidate_id = $2 AND document_type = $3`,
      [tenantId, candidateId, docTypeStr]
    );

    let docRow;
    if (existingDocs.length > 0) {
      const { rows } = await client.query(
        `UPDATE pipeline_candidate_documents SET document_url = $1, status = 'Verified', updated_at = now() WHERE id = $2 RETURNING *`,
        [fileUrl, existingDocs[0].id]
      );
      docRow = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO pipeline_candidate_documents (tenant_id, candidate_id, document_type, status, document_url)
         VALUES ($1, $2, $3, 'Verified', $4) RETURNING *`,
        [tenantId, candidateId, docTypeStr, fileUrl]
      );
      docRow = rows[0];
    }

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'DOCUMENT_UPLOAD', $4)`,
      [tenantId, candidateId, userId, `HR manually uploaded document: ${docTypeStr}`]
    );

    return docRow;
  });
}
