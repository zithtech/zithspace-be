import { TenantClient } from '../db/pool';
import { OpeningReferral, CreateReferralInput } from '../types';

function mapRow(row: any): OpeningReferral {
  return {
    id: row.id,
    openingId: row.opening_id,
    referredBy: row.referred_by,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    resumeUrl: row.resume_url,
    notes: row.notes,
    skills: row.skills,
    totalExperience: Number(row.total_experience),
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function createReferral(
  client: TenantClient,
  openingId: string,
  referredBy: string,
  input: CreateReferralInput
): Promise<OpeningReferral> {
  const res = await client.query(
    `INSERT INTO om_referrals (
      tenant_id, opening_id, referred_by, name, email, mobile,
      resume_url, notes, skills, total_experience
    ) VALUES (
      current_setting('app.current_tenant_id', true)::uuid,
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    ) RETURNING *`,
    [
      openingId,
      referredBy,
      input.name,
      input.email,
      input.mobile,
      input.resumeUrl || null,
      input.notes || null,
      JSON.stringify(input.skills || []),
      input.totalExperience || 0,
    ]
  );
  return mapRow(res.rows[0]);
}

export async function listReferrals(
  client: TenantClient,
  openingId: string
): Promise<OpeningReferral[]> {
  const res = await client.query(
    `SELECT * FROM om_referrals WHERE opening_id = $1 ORDER BY created_at DESC`,
    [openingId]
  );
  return res.rows.map(mapRow);
}

export async function getReferral(
  client: TenantClient,
  referralId: string
): Promise<OpeningReferral | null> {
  const res = await client.query(`SELECT * FROM om_referrals WHERE id = $1`, [referralId]);
  return res.rows.length ? mapRow(res.rows[0]) : null;
}

export async function markConverted(
  client: TenantClient,
  referralId: string
): Promise<OpeningReferral> {
  const res = await client.query(
    `UPDATE om_referrals SET status = 'converted', updated_at = now() WHERE id = $1 RETURNING *`,
    [referralId]
  );
  return mapRow(res.rows[0]);
}
export async function deleteReferral(
  client: TenantClient,
  referralId: string
): Promise<void> {
  await client.query(`DELETE FROM om_referrals WHERE id = $1`, [referralId]);
}
