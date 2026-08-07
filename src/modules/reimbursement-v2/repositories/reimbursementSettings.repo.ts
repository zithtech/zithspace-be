// src/modules/reimbursement-v2/repositories/reimbursementSettings.repo.ts
//
// Mail routing configuration for the Reimbursement V2 module.
// Mirrors leaveSettings.repo.ts from the Leave V2 module.

import { TenantClient } from '../db/pool';

export interface ReimbMailConfig {
  replyToMode: 'logged_in_user' | 'custom';
  customReplyToEmail?: string;
  reportsToEnabled: boolean;
  additionalToEmails: string[];
  customToEmails: string[];
  officeCcEnabled: boolean;
  additionalCcEmails: string[];
  customCcEmails: string[];
}

const DEFAULT_MAIL_CONFIG: ReimbMailConfig = {
  replyToMode: 'logged_in_user',
  reportsToEnabled: true,
  additionalToEmails: [],
  customToEmails: [],
  officeCcEnabled: true,
  additionalCcEmails: [],
  customCcEmails: [],
};

export async function getSettings(client: TenantClient, tenantId: string): Promise<ReimbMailConfig> {
  const result = await client.query(`
    SELECT mail_config
    FROM rb2_reimbursement_settings
    WHERE tenant_id = $1
    LIMIT 1
  `, [tenantId]);

  if (result.rows.length === 0) {
    return DEFAULT_MAIL_CONFIG;
  }

  return {
    ...DEFAULT_MAIL_CONFIG,
    ...result.rows[0].mail_config,
  };
}

export async function upsertSettings(
  client: TenantClient,
  tenantId: string,
  config: ReimbMailConfig
): Promise<ReimbMailConfig> {
  const result = await client.query(
    `
    INSERT INTO rb2_reimbursement_settings (tenant_id, mail_config, updated_at)
    VALUES ($1, $2, now())
    ON CONFLICT (tenant_id) DO UPDATE
      SET mail_config = EXCLUDED.mail_config,
          updated_at  = now()
    RETURNING mail_config
    `,
    [tenantId, JSON.stringify(config)]
  );

  return result.rows[0].mail_config;
}
