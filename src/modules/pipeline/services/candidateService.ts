// src/modules/pipeline/services/candidateService.ts
import { pipelinePool, withTenant } from '../db/pool';
import { PipelineError } from '../types';
import { MailService } from '../../../services/mail/MailService';
import { prisma } from '../../../config/database';

export interface CreateCandidateDto {
  role: string;
  name: string;
  mobile?: string;
  email?: string;
  total_experience?: number;
  current_ctc?: number;
  expected_ctc?: number;
  resume_url?: string;
  skills?: string[];
}

export async function createCandidate(tenantId: string, userId: string, data: CreateCandidateDto) {
  return withTenant(tenantId, async (client) => {
    if (data.email || data.mobile) {
      const { rows: dups } = await client.query(
        `SELECT id FROM pipeline_candidates WHERE tenant_id = $1 AND (email = $2 OR mobile = $3)`,
        [tenantId, data.email || null, data.mobile || null]
      );
      if (dups.length > 0) {
        const existingCandidateId = dups[0].id;
        // Check when their last application was created
        const { rows: lastAppRows } = await client.query(
          `SELECT created_at FROM om_opening_applications 
           WHERE pipeline_candidate_id = $1 
           ORDER BY created_at DESC LIMIT 1`,
          [existingCandidateId]
        );
        
        const lastAppDate = lastAppRows.length > 0 ? new Date(lastAppRows[0].created_at) : null;
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        if (lastAppDate && lastAppDate > sixMonthsAgo) {
          throw new PipelineError('Candidate with this email or mobile has applied within the last 6 months', 'DUPLICATE_CANDIDATE');
        }

        // If older than 6 months (or no application found), update their info and return the existing record
        const { rows: updatedRows } = await client.query(
          `UPDATE pipeline_candidates 
           SET role = $2, name = $3, mobile = $4, email = $5, total_experience = COALESCE($6, total_experience), 
               resume_url = COALESCE($7, resume_url), skills = COALESCE($8, skills), updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            existingCandidateId,
            data.role,
            data.name,
            data.mobile,
            data.email,
            data.total_experience === undefined || data.total_experience === null || String(data.total_experience).trim() === '' || isNaN(Number(data.total_experience)) ? null : Number(data.total_experience),
            data.resume_url,
            data.skills ? JSON.stringify(data.skills) : null
          ]
        );
        return updatedRows[0];
      }
    }

    const { rows } = await client.query(
      `INSERT INTO pipeline_candidates 
       (tenant_id, role, name, mobile, email, total_experience, current_ctc, expected_ctc, resume_url, skills, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'New')
       RETURNING *`,
      [
        tenantId,
        data.role,
        data.name,
        data.mobile,
        data.email,
        data.total_experience === undefined || data.total_experience === null || String(data.total_experience).trim() === '' || isNaN(Number(data.total_experience)) ? null : Number(data.total_experience),
        data.current_ctc === undefined || data.current_ctc === null || String(data.current_ctc).trim() === '' || isNaN(Number(data.current_ctc)) ? null : Number(data.current_ctc),
        data.expected_ctc === undefined || data.expected_ctc === null || String(data.expected_ctc).trim() === '' || isNaN(Number(data.expected_ctc)) ? null : Number(data.expected_ctc),
        data.resume_url,
        data.skills ? JSON.stringify(data.skills) : '[]'
      ]
    );
    const candidate = rows[0];

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'CREATE', 'Candidate profile created')`,
      [tenantId, candidate.id, userId]
    );

    return candidate;
  });
}

export async function listCandidates(tenantId: string, page = 1, limit = 20, search = '') {
  const offset = (page - 1) * limit;
  
  let query = `SELECT * FROM pipeline_candidates WHERE tenant_id = $1`;
  const params: any[] = [tenantId];

  if (search) {
    query += ` AND (name ILIKE $2 OR email ILIKE $2 OR role ILIKE $2)`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const pagParams = [...params, limit, offset];

  const { rows } = await pipelinePool.query(query, pagParams);

  let countQuery = `SELECT COUNT(*) FROM pipeline_candidates WHERE tenant_id = $1`;
  const countParams: any[] = [tenantId];
  if (search) {
    countQuery += ` AND (name ILIKE $2 OR email ILIKE $2 OR role ILIKE $2)`;
    countParams.push(`%${search}%`);
  }
  const { rows: countRows } = await pipelinePool.query(countQuery, countParams);

  return {
    candidates: rows,
    total: parseInt(countRows[0].count, 10),
    page,
    limit,
  };
}

export async function getCandidate(tenantId: string, candidateId: string) {
  const { rows } = await pipelinePool.query(
    `SELECT * FROM pipeline_candidates WHERE tenant_id = $1 AND id = $2`,
    [tenantId, candidateId]
  );
  if (rows.length === 0) throw new PipelineError('Candidate not found', 'NOT_FOUND', 404);
  return rows[0];
}

export async function updateCandidate(tenantId: string, userId: string, id: string, data: Partial<CreateCandidateDto>) {
  return withTenant(tenantId, async (client) => {
    // Duplicate check for email or mobile if updated
    if (data.email || data.mobile) {
      const { rows: dups } = await client.query(
        `SELECT id FROM pipeline_candidates WHERE tenant_id = $1 AND (email = $2 OR mobile = $3) AND id != $4`,
        [tenantId, data.email || null, data.mobile || null, id]
      );
      if (dups.length > 0) {
        throw new PipelineError('Candidate with this email or mobile already exists', 'DUPLICATE_CANDIDATE');
      }
    }

    const { rows } = await client.query(
      `UPDATE pipeline_candidates 
       SET role = COALESCE($2, role), 
           name = COALESCE($3, name), 
           mobile = COALESCE($4, mobile), 
           email = COALESCE($5, email), 
           total_experience = $6, 
           current_ctc = $7, 
           expected_ctc = $8, 
           resume_url = COALESCE($9, resume_url),
           skills = COALESCE($10, skills),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $11
       RETURNING *`,
      [
        tenantId,
        data.role,
        data.name,
        data.mobile,
        data.email,
        data.total_experience === undefined || data.total_experience === null || String(data.total_experience).trim() === '' || isNaN(Number(data.total_experience)) ? null : Number(data.total_experience),
        data.current_ctc === undefined || data.current_ctc === null || String(data.current_ctc).trim() === '' || isNaN(Number(data.current_ctc)) ? null : Number(data.current_ctc),
        data.expected_ctc === undefined || data.expected_ctc === null || String(data.expected_ctc).trim() === '' || isNaN(Number(data.expected_ctc)) ? null : Number(data.expected_ctc),
        data.resume_url,
        data.skills ? JSON.stringify(data.skills) : null,
        id
      ]
    );
    const candidate = rows[0];

    if (candidate) {
      await client.query(
        `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
         VALUES ($1, $2, $3, 'UPDATE', 'Candidate profile updated')`,
        [tenantId, candidate.id, userId]
      );
    }

    return candidate;
  });
}

export async function deleteCandidate(tenantId: string, id: string) {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `DELETE FROM pipeline_candidates WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenantId, id]
    );
    return rows[0];
  });
}

export async function updateCandidateStatus(tenantId: string, userId: string, id: string, status: string, rejectedRoundId?: string) {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `UPDATE pipeline_candidates 
       SET status = $1, rejected_round_id = $4, updated_at = now()
       WHERE tenant_id = $2 AND id = $3
       RETURNING *`,
      [status, tenantId, id, rejectedRoundId || null]
    );
    const candidate = rows[0];

    if (candidate) {
      let roundName = '';
      if (status === 'Rejected' && rejectedRoundId) {
        const { rows: rRows } = await client.query(`SELECT round_name FROM pipeline_interview_rounds WHERE id = $1`, [rejectedRoundId]);
        if (rRows[0]) roundName = ` (Round: ${rRows[0].round_name})`;
      }

      await client.query(
        `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
         VALUES ($1, $2, $3, 'UPDATE', $4)`,
        [tenantId, candidate.id, userId, `Status updated to ${status}${roundName}`]
      );
    }

    return candidate;
  });
}

export async function resendEmail(tenantId: string, userId: string, emailId: string) {
  return withTenant(tenantId, async (client) => {
    const { rows: emailRows } = await client.query(
      `SELECT * FROM pipeline_emails WHERE id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );
    if (!emailRows.length) throw new Error('Email not found');
    const email = emailRows[0];

    const { rows: candRows } = await client.query(
      `SELECT email FROM pipeline_candidates WHERE id = $1`,
      [email.candidate_id]
    );
    if (!candRows.length || !candRows[0].email) throw new Error('Candidate email not found');
    const candidateEmail = candRows[0].email;

    const mailAccount = await prisma.mail_accounts.findFirst({
      where: { tenant_id: tenantId, user_id: userId }
    });

    if (!mailAccount) {
      throw new Error('No mail account connected to send email');
    }

    await MailService.sendMessage(userId, tenantId, mailAccount.email, {
      subject: email.subject,
      from: mailAccount.email,
      to: [candidateEmail],
      body: email.body
    });

    const { rows } = await client.query(
      `UPDATE pipeline_emails SET status = 'Sent', sent_at = now(), sender_id = $1
       WHERE id = $2 RETURNING *`,
      [userId, emailId]
    );

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'EMAIL_SENT', 'Resent email: ' || $4)`,
      [tenantId, email.candidate_id, userId, email.subject]
    );

    return rows[0];
  });
}

export async function updateAndSendEmail(tenantId: string, userId: string, emailId: string, subject: string, body: string) {
  return withTenant(tenantId, async (client) => {
    const { rows: emailRows } = await client.query(
      `SELECT * FROM pipeline_emails WHERE id = $1 AND tenant_id = $2`,
      [emailId, tenantId]
    );
    if (!emailRows.length) throw new Error('Email not found');
    const email = emailRows[0];

    const { rows: candRows } = await client.query(
      `SELECT email FROM pipeline_candidates WHERE id = $1`,
      [email.candidate_id]
    );
    if (!candRows.length || !candRows[0].email) throw new Error('Candidate email not found');
    const candidateEmail = candRows[0].email;

    const mailAccount = await prisma.mail_accounts.findFirst({
      where: { tenant_id: tenantId, user_id: userId }
    });

    if (!mailAccount) {
      throw new Error('No mail account connected to send email');
    }

    await MailService.sendMessage(userId, tenantId, mailAccount.email, {
      subject,
      from: mailAccount.email,
      to: [candidateEmail],
      body
    });

    const { rows } = await client.query(
      `UPDATE pipeline_emails SET subject = $1, body = $2, status = 'Sent', sent_at = now(), sender_id = $3
       WHERE id = $4 RETURNING *`,
      [subject, body, userId, emailId]
    );

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'EMAIL_SENT', 'Sent email: ' || $4)`,
      [tenantId, email.candidate_id, userId, subject]
    );

    return rows[0];
  });
}

export async function listCandidateEmails(tenantId: string, candidateId: string) {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM pipeline_emails WHERE tenant_id = $1 AND candidate_id = $2 ORDER BY sent_at DESC`,
      [tenantId, candidateId]
    );
    return rows;
  });
}
