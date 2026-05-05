import pool from "../config/dbpool";

export enum MailProvider {
  GOOGLE = "GOOGLE",
  MICROSOFT = "MICROSOFT", 
  ZOHO = "ZOHO"
}

export enum TestStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  PENDING = "PENDING"
}

export interface MailConfiguration {
  id: string;
  tenantId: string;
  provider: MailProvider;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string; // This should be encrypted
  enableSsl: boolean;
  defaultFromEmail: string;
  isActive: boolean;
  lastTestSentAt?: Date;
  testStatus?: TestStatus;
  testErrorMessage?: string;
  metadata?: any;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
}

export interface CreateMailConfigurationData {
  tenantId: string;
  provider: MailProvider;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  enableSsl?: boolean;
  defaultFromEmail: string;
  isActive?: boolean;
  metadata?: any;
  createdBy: string;
}

export interface UpdateMailConfigurationData {
  provider?: MailProvider;
  email?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  enableSsl?: boolean;
  defaultFromEmail?: string;
  isActive?: boolean;
  metadata?: any;
  updatedBy: string;
}

/**
 * Convert database row (snake_case) to MailConfiguration interface (camelCase)
 */
function mapRowToMailConfiguration(row: any): MailConfiguration {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    email: row.email,
    smtpHost: row.smtp_host,
    smtpPort: parseInt(row.smtp_port),
    smtpUsername: row.smtp_username,
    smtpPassword: row.smtp_password,
    enableSsl: row.enable_ssl,
    defaultFromEmail: row.default_from_email,
    isActive: row.is_active,
    lastTestSentAt: row.last_test_sent_at,
    testStatus: row.test_status,
    testErrorMessage: row.test_error_message,
    metadata: row.metadata,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
  };
}

/**
 * Create a new mail configuration
 */
export async function createMailConfiguration(data: CreateMailConfigurationData): Promise<MailConfiguration> {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  
  const query = `
    INSERT INTO mail_configurations (
      id, tenant_id, provider, email, smtp_host, smtp_port, smtp_username, 
      smtp_password, enable_ssl, default_from_email, is_active, metadata, 
      created_by
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;
  
  const values = [
    id,
    data.tenantId,
    data.provider,
    data.email,
    data.smtpHost,
    data.smtpPort || 587,
    data.smtpUsername,
    data.smtpPassword, // Should be encrypted before storing
    data.enableSsl !== undefined ? data.enableSsl : true,
    data.defaultFromEmail,
    data.isActive !== undefined ? data.isActive : true,
    data.metadata ? JSON.stringify(data.metadata) : null,
    data.createdBy,
  ];

  const result = await pool.query(query, values);
  return mapRowToMailConfiguration(result.rows[0]);
}

/**
 * Get mail configuration by tenant ID
 */
export async function getMailConfigurationByTenantId(tenantId: string): Promise<MailConfiguration | null> {
  const query = `
    SELECT * FROM mail_configurations 
    WHERE tenant_id = $1 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.length > 0 ? mapRowToMailConfiguration(result.rows[0]) : null;
}

/**
 * Get mail configuration by ID
 */
export async function getMailConfigurationById(id: string, tenantId: string): Promise<MailConfiguration | null> {
  const query = `
    SELECT * FROM mail_configurations 
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToMailConfiguration(result.rows[0]) : null;
}

/**
 * Update mail configuration
 */
export async function updateMailConfiguration(
  tenantId: string, 
  data: UpdateMailConfigurationData
): Promise<MailConfiguration | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.provider !== undefined) {
    setClause.push(`provider = $${paramIndex++}`);
    values.push(data.provider);
  }
  if (data.email !== undefined) {
    setClause.push(`email = $${paramIndex++}`);
    values.push(data.email);
  }
  if (data.smtpHost !== undefined) {
    setClause.push(`smtp_host = $${paramIndex++}`);
    values.push(data.smtpHost);
  }
  if (data.smtpPort !== undefined) {
    setClause.push(`smtp_port = $${paramIndex++}`);
    values.push(data.smtpPort);
  }
  if (data.smtpUsername !== undefined) {
    setClause.push(`smtp_username = $${paramIndex++}`);
    values.push(data.smtpUsername);
  }
  if (data.smtpPassword !== undefined) {
    setClause.push(`smtp_password = $${paramIndex++}`);
    values.push(data.smtpPassword); // Should be encrypted before storing
  }
  if (data.enableSsl !== undefined) {
    setClause.push(`enable_ssl = $${paramIndex++}`);
    values.push(data.enableSsl);
  }
  if (data.defaultFromEmail !== undefined) {
    setClause.push(`default_from_email = $${paramIndex++}`);
    values.push(data.defaultFromEmail);
  }
  if (data.isActive !== undefined) {
    setClause.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }
  if (data.metadata !== undefined) {
    setClause.push(`metadata = $${paramIndex++}`);
    values.push(data.metadata ? JSON.stringify(data.metadata) : null);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE mail_configurations 
    SET ${setClause.join(', ')}
    WHERE tenant_id = $${paramIndex++} AND deleted_at IS NULL
    RETURNING *
  `;

  values.push(tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToMailConfiguration(result.rows[0]) : null;
}

/**
 * Update mail configuration by ID
 */
export async function updateMailConfigurationById(
  id: string, 
  tenantId: string, 
  data: UpdateMailConfigurationData
): Promise<MailConfiguration | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.provider !== undefined) {
    setClause.push(`provider = $${paramIndex++}`);
    values.push(data.provider);
  }
  if (data.email !== undefined) {
    setClause.push(`email = $${paramIndex++}`);
    values.push(data.email);
  }
  if (data.smtpHost !== undefined) {
    setClause.push(`smtp_host = $${paramIndex++}`);
    values.push(data.smtpHost);
  }
  if (data.smtpPort !== undefined) {
    setClause.push(`smtp_port = $${paramIndex++}`);
    values.push(data.smtpPort);
  }
  if (data.smtpUsername !== undefined) {
    setClause.push(`smtp_username = $${paramIndex++}`);
    values.push(data.smtpUsername);
  }
  if (data.smtpPassword !== undefined) {
    setClause.push(`smtp_password = $${paramIndex++}`);
    values.push(data.smtpPassword); // Should be encrypted before storing
  }
  if (data.enableSsl !== undefined) {
    setClause.push(`enable_ssl = $${paramIndex++}`);
    values.push(data.enableSsl);
  }
  if (data.defaultFromEmail !== undefined) {
    setClause.push(`default_from_email = $${paramIndex++}`);
    values.push(data.defaultFromEmail);
  }
  if (data.isActive !== undefined) {
    setClause.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }
  if (data.metadata !== undefined) {
    setClause.push(`metadata = $${paramIndex++}`);
    values.push(data.metadata ? JSON.stringify(data.metadata) : null);
  }

  setClause.push(`updated_by = $${paramIndex++}`);
  values.push(data.updatedBy);
  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE mail_configurations 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex} AND deleted_at IS NULL
    RETURNING *
  `;

  values.push(id, tenantId);

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? mapRowToMailConfiguration(result.rows[0]) : null;
}

/**
 * Soft delete mail configuration
 */
export async function deleteMailConfiguration(tenantId: string, deletedBy: string): Promise<boolean> {
  const query = `
    UPDATE mail_configurations 
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = $2 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [deletedBy, tenantId]);
  return result.rowCount > 0;
}

/**
 * Soft delete mail configuration by ID
 */
export async function deleteMailConfigurationById(id: string, tenantId: string, deletedBy: string): Promise<boolean> {
  const query = `
    UPDATE mail_configurations 
    SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [deletedBy, id, tenantId]);
  return result.rowCount > 0;
}

/**
 * Update test status after sending test email
 */
export async function updateTestStatus(
  id: string, 
  tenantId: string, 
  status: TestStatus, 
  errorMessage?: string
): Promise<MailConfiguration | null> {
  const query = `
    UPDATE mail_configurations 
    SET last_test_sent_at = CURRENT_TIMESTAMP, 
        test_status = $1, 
        test_error_message = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [status, errorMessage || null, id, tenantId]);
  return result.rows.length > 0 ? mapRowToMailConfiguration(result.rows[0]) : null;
}

/**
 * Check if mail configuration exists for tenant
 */
export async function mailConfigurationExists(tenantId: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count FROM mail_configurations 
    WHERE tenant_id = $1 AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [tenantId]);
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Get active mail configuration for tenant
 */
export async function getActiveMailConfiguration(tenantId: string): Promise<MailConfiguration | null> {
  const query = `
    SELECT * FROM mail_configurations 
    WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [tenantId]);
  return result.rows.length > 0 ? mapRowToMailConfiguration(result.rows[0]) : null;
}

/**
 * Get all mail configurations (for admin purposes)
 */
export async function getAllMailConfigurations(
  options: {
    page?: number;
    limit?: number;
    provider?: MailProvider;
    isActive?: boolean;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}
): Promise<{ mailConfigurations: MailConfiguration[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    provider,
    isActive,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = options;

  const whereConditions: string[] = ['deleted_at IS NULL'];
  const values: any[] = [];
  let paramIndex = 1;

  if (provider) {
    whereConditions.push(`provider = $${paramIndex++}`);
    values.push(provider);
  }

  if (isActive !== undefined) {
    whereConditions.push(`is_active = $${paramIndex++}`);
    values.push(isActive);
  }

  if (search) {
    whereConditions.push(`(email ILIKE $${paramIndex++} OR smtp_host ILIKE $${paramIndex++})`);
    values.push(`%${search}%`, `%${search}%`);
  }

  // Map camelCase field names to snake_case database column names
  const columnMapping: { [key: string]: string } = {
    'createdAt': 'created_at',
    'updatedAt': 'updated_at',
    'smtpHost': 'smtp_host',
    'smtpPort': 'smtp_port',
    'smtpUsername': 'smtp_username',
    'smtpPassword': 'smtp_password',
    'enableSsl': 'enable_ssl',
    'defaultFromEmail': 'default_from_email',
    'isActive': 'is_active',
    'lastTestSentAt': 'last_test_sent_at',
    'testStatus': 'test_status',
    'testErrorMessage': 'test_error_message',
    'deletedAt': 'deleted_at',
    'deletedBy': 'deleted_by'
  };
  
  const dbColumnName = columnMapping[sortBy] || sortBy;
  const orderByClause = `ORDER BY ${dbColumnName} ${sortOrder.toUpperCase()}`;
  const offset = (page - 1) * limit;

  const query = `
    SELECT * FROM mail_configurations 
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM mail_configurations
    WHERE ${whereConditions.join(' AND ')}
  `;

  values.push(limit, offset);

  const [mailConfigResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, -2))
  ]);

  const mailConfigurations = mailConfigResult.rows.map(mapRowToMailConfiguration);

  return {
    mailConfigurations,
    total: parseInt(countResult.rows[0].total)
  };
}
