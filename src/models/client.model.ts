import pool from "../config/dbpool";

export interface Client {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  contactPerson?: string;
  isActive: boolean;
  notes?: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    id: string;
    name: string;
    workEmail: string;
  };
}

export interface CreateClientData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  contactPerson?: string;
  notes?: string;
}

export interface UpdateClientData {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  contactPerson?: string;
  isActive?: boolean;
  notes?: string;
}

export interface ClientsFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Convert database row (snake_case) to Client interface (camelCase)
 */
function mapRowToClient(row: any): Client {
  const client: Client = {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    company: row.company || undefined,
    address: row.address || undefined,
    contactPerson: row.contact_person || undefined,
    isActive: row.is_active,
    notes: row.notes || undefined,
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.creator_id) {
    client.createdBy = {
      id: row.creator_id,
      name: row.creator_name,
      workEmail: row.creator_work_email,
    };
  }

  return client;
}

/**
 * Create a new client
 */
export async function createClient(
  tenantId: string,
  createdById: string,
  data: CreateClientData
): Promise<Client> {
  const id = require('crypto').randomUUID();
  const query = `
    INSERT INTO clients (
      id, tenant_id, name, email, phone, company, address, contact_person, notes, created_by_id, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
    RETURNING *
  `;
  const values = [
    id,
    tenantId,
    data.name,
    data.email ? data.email.toLowerCase() : null,
    data.phone || null,
    data.company || null,
    data.address || null,
    data.contactPerson || null,
    data.notes || null,
    createdById,
  ];

  const result = await pool.query(query, values);
  
  // Fetch details with creator info
  const client = await getClientById(id, tenantId);
  if (!client) {
    throw new Error("Failed to retrieve created client");
  }
  return client;
}

/**
 * Get client by ID
 */
export async function getClientById(id: string, tenantId: string): Promise<Client | null> {
  const query = `
    SELECT c.*, 
           u.id as creator_id, u.name as creator_name, u.work_email as creator_work_email
    FROM clients c
    LEFT JOIN users u ON c.created_by_id = u.id
    WHERE c.id = $1 AND c.tenant_id = $2
  `;
  const result = await pool.query(query, [id, tenantId]);
  return result.rows.length > 0 ? mapRowToClient(result.rows[0]) : null;
}

/**
 * Get client by Email (within tenant)
 */
export async function getClientByEmail(email: string, tenantId: string): Promise<Client | null> {
  const query = `
    SELECT c.*, 
           u.id as creator_id, u.name as creator_name, u.work_email as creator_work_email
    FROM clients c
    LEFT JOIN users u ON c.created_by_id = u.id
    WHERE LOWER(c.email) = LOWER($1) AND c.tenant_id = $2
  `;
  const result = await pool.query(query, [email, tenantId]);
  return result.rows.length > 0 ? mapRowToClient(result.rows[0]) : null;
}

/**
 * Update client
 */
export async function updateClient(
  id: string,
  tenantId: string,
  data: UpdateClientData
): Promise<Client | null> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    setClause.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.email !== undefined) {
    setClause.push(`email = $${paramIndex++}`);
    values.push(data.email ? data.email.toLowerCase() : null);
  }
  if (data.phone !== undefined) {
    setClause.push(`phone = $${paramIndex++}`);
    values.push(data.phone);
  }
  if (data.company !== undefined) {
    setClause.push(`company = $${paramIndex++}`);
    values.push(data.company);
  }
  if (data.address !== undefined) {
    setClause.push(`address = $${paramIndex++}`);
    values.push(data.address);
  }
  if (data.contactPerson !== undefined) {
    setClause.push(`contact_person = $${paramIndex++}`);
    values.push(data.contactPerson);
  }
  if (data.isActive !== undefined) {
    setClause.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }
  if (data.notes !== undefined) {
    setClause.push(`notes = $${paramIndex++}`);
    values.push(data.notes);
  }

  if (setClause.length === 0) {
    return await getClientById(id, tenantId);
  }

  setClause.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE clients
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `;
  values.push(id, tenantId);

  await pool.query(query, values);
  return await getClientById(id, tenantId);
}

/**
 * Soft delete client
 */
export async function deleteClient(id: string, tenantId: string): Promise<boolean> {
  const query = `
    UPDATE clients
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND tenant_id = $2
  `;
  const result = await pool.query(query, [id, tenantId]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Get all clients for a tenant with pagination and filtering
 */
export async function getClients(
  tenantId: string,
  options: ClientsFilters = {}
): Promise<{ clients: Client[]; total: number }> {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  const whereConditions: string[] = ['c.tenant_id = $1'];
  const values: any[] = [tenantId];
  let paramIndex = 2;

  // By default, only active clients are fetched, unless status is specified
  let isActiveVal = true;
  if (status) {
    isActiveVal = status === 'active';
  }
  whereConditions.push(`c.is_active = $${paramIndex++}`);
  values.push(isActiveVal);

  if (search) {
    whereConditions.push(`(
      c.name ILIKE $${paramIndex} OR 
      c.email ILIKE $${paramIndex} OR 
      c.company ILIKE $${paramIndex} OR 
      c.contact_person ILIKE $${paramIndex}
    )`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  const columnMapping: Record<string, string> = {
    'createdAt': 'c.created_at',
    'updatedAt': 'c.updated_at',
    'name': 'c.name',
    'email': 'c.email',
    'company': 'c.company',
    'contactPerson': 'c.contact_person',
  };

  const orderByColumn = columnMapping[sortBy] || 'c.created_at';
  const orderByClause = `ORDER BY ${orderByColumn} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
  const offset = (Number(page) - 1) * Number(limit);

  const mainQuery = `
    SELECT c.*, 
           u.id as creator_id, u.name as creator_name, u.work_email as creator_work_email
    FROM clients c
    LEFT JOIN users u ON c.created_by_id = u.id
    WHERE ${whereConditions.join(' AND ')}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM clients c
    WHERE ${whereConditions.join(' AND ')}
  `;

  // Clone values for count query before adding limit & offset
  const countValues = [...values];
  values.push(Number(limit), offset);

  const [invoicesResult, countResult] = await Promise.all([
    pool.query(mainQuery, values),
    pool.query(countQuery, countValues)
  ]);

  return {
    clients: invoicesResult.rows.map(mapRowToClient),
    total: countResult.rows[0].total
  };
}

/**
 * Get client statistics (tenant-aware)
 */
export async function getClientStats(tenantId: string): Promise<any> {
  const totalQuery = `
    SELECT COUNT(*)::int as total
    FROM clients
    WHERE tenant_id = $1
  `;
  const activeQuery = `
    SELECT COUNT(*)::int as active
    FROM clients
    WHERE tenant_id = $1 AND is_active = true
  `;
  const recentQuery = `
    SELECT c.*, 
           u.id as creator_id, u.name as creator_name, u.work_email as creator_work_email
    FROM clients c
    LEFT JOIN users u ON c.created_by_id = u.id
    WHERE c.tenant_id = $1 AND c.is_active = true
    ORDER BY c.created_at DESC
    LIMIT 10
  `;

  const [totalRes, activeRes, recentRes] = await Promise.all([
    pool.query(totalQuery, [tenantId]),
    pool.query(activeQuery, [tenantId]),
    pool.query(recentQuery, [tenantId]),
  ]);

  const totalClients = totalRes.rows[0].total;
  const activeClients = activeRes.rows[0].active;
  const inactiveClients = totalClients - activeClients;

  return {
    overview: {
      totalClients,
      activeClients,
      inactiveClients
    },
    recentClients: recentRes.rows.map(mapRowToClient)
  };
}

/**
 * Get clients for dropdown/select (tenant-aware)
 */
export async function getClientsForSelect(tenantId: string): Promise<any[]> {
  const query = `
    SELECT id, name, email, company, contact_person
    FROM clients
    WHERE tenant_id = $1 AND is_active = true
    ORDER BY name ASC
  `;
  const result = await pool.query(query, [tenantId]);
  return result.rows.map(row => ({
    value: row.id,
    label: row.name,
    email: row.email || '',
    company: row.company || '',
    contactPerson: row.contact_person || '',
  }));
}

/**
 * Bulk update client status (tenant-aware)
 */
export async function bulkUpdateClientStatus(
  clientIds: string[],
  isActive: boolean,
  tenantId: string
): Promise<number> {
  const query = `
    UPDATE clients
    SET is_active = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ANY($2::text[]) AND tenant_id = $3
  `;
  const result = await pool.query(query, [isActive, clientIds, tenantId]);
  return result.rowCount !== null ? result.rowCount : 0;
}

/**
 * Search clients (tenant-aware)
 */
export async function searchClients(
  tenantId: string,
  queryText: string,
  limit: number
): Promise<Client[]> {
  const query = `
    SELECT c.*, 
           u.id as creator_id, u.name as creator_name, u.work_email as creator_work_email
    FROM clients c
    LEFT JOIN users u ON c.created_by_id = u.id
    WHERE c.tenant_id = $1 AND c.is_active = true AND (
      c.name ILIKE $2 OR 
      c.email ILIKE $2 OR 
      c.company ILIKE $2 OR 
      c.contact_person ILIKE $2
    )
    ORDER BY c.name ASC
    LIMIT $3
  `;
  const result = await pool.query(query, [tenantId, `%${queryText}%`, limit]);
  return result.rows.map(mapRowToClient);
}

/**
 * Count active clients (for settings controller stats)
 */
export async function countActiveClients(tenantId: string): Promise<number> {
  const query = `
    SELECT COUNT(*)::int as total
    FROM clients
    WHERE tenant_id = $1 AND is_active = true
  `;
  const result = await pool.query(query, [tenantId]);
  return result.rows[0].total;
}
