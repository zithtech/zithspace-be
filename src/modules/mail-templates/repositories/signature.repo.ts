// src/modules/mail-templates/repositories/signature.repo.ts
//
// Raw-SQL data access for mt_mail_signatures — one row per member, and no row
// at all for a member who has never saved one.
//
// RLS separates tenants; it does not separate colleagues, so every query here
// filters BOTH tenant_id and user_id. Reading another member's signature would
// be a leak of their phone number, and writing one would sign their mail.

import { TenantClient } from '../db/pool';

export interface SignatureRow {
  html: string;
  updatedAt: Date;
}

export async function findByUser(
  client: TenantClient,
  userId: string
): Promise<SignatureRow | null> {
  const { rows } = await client.query(
    `SELECT html, updated_at FROM mt_mail_signatures WHERE tenant_id = $1 AND user_id = $2`,
    [client.tenantId, userId]
  );
  return rows.length ? { html: rows[0].html, updatedAt: rows[0].updated_at } : null;
}

/** Save this member's signature, replacing whatever they had. */
export async function upsert(
  client: TenantClient,
  userId: string,
  html: string
): Promise<SignatureRow> {
  const { rows } = await client.query(
    `INSERT INTO mt_mail_signatures (tenant_id, user_id, html)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET html = EXCLUDED.html, updated_at = now()
     RETURNING html, updated_at`,
    [client.tenantId, userId, html]
  );
  return { html: rows[0].html, updatedAt: rows[0].updated_at };
}

/**
 * Drop this member's signature.
 *
 * Deleting the row IS "reset to my details": with nothing saved, the service
 * builds one from their record again.
 */
export async function remove(client: TenantClient, userId: string): Promise<void> {
  await client.query(`DELETE FROM mt_mail_signatures WHERE tenant_id = $1 AND user_id = $2`, [
    client.tenantId,
    userId,
  ]);
}
