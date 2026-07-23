import { PoolClient } from 'pg';

export interface MailConfig {
  replyToMode: 'logged_in_user' | 'custom';
  customReplyToEmail?: string;
  reportsToEnabled: boolean;
  additionalToEmails: string[];
  customToEmails: string[];
  officeCcEnabled: boolean;
  additionalCcEmails: string[];
  customCcEmails: string[];
}

export interface LeaveSettingsRow {
  tenantId: string;
  mailConfig: MailConfig;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_MAIL_CONFIG: MailConfig = {
  replyToMode: 'logged_in_user',
  reportsToEnabled: true,
  additionalToEmails: [],
  customToEmails: [],
  officeCcEnabled: true,
  additionalCcEmails: [],
  customCcEmails: []
};

export async function getSettings(client: any): Promise<MailConfig> {
  const result = await client.query(`
    SELECT mail_config
    FROM lv2_leave_settings
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return DEFAULT_MAIL_CONFIG;
  }

  // Merge default config with saved config for backwards compatibility if fields are missing
  return {
    ...DEFAULT_MAIL_CONFIG,
    ...result.rows[0].mail_config
  };
}

export async function upsertSettings(client: any, tenantId: string, config: MailConfig): Promise<MailConfig> {
  const result = await client.query(
    `
    INSERT INTO lv2_leave_settings (tenant_id, mail_config, updated_at)
    VALUES ($1, $2, now())
    ON CONFLICT (tenant_id) DO UPDATE 
      SET mail_config = EXCLUDED.mail_config,
          updated_at = now()
    RETURNING mail_config
    `,
    [tenantId, JSON.stringify(config)]
  );

  return result.rows[0].mail_config;
}
