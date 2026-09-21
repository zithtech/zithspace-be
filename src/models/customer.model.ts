import { randomUUID } from "crypto";
import pool from "../config/dbpool";
import { CreateCustomerData, UpdateCustomerData } from "../types";

export interface Customer {
  id: string;
  tenantId: string;
  companyName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  gstin?: string;
  pan?: string;
  isActive: boolean;
  clientId?: string | null;
  projectIds?: string[];
  projects?: Array<{ id: string; name: string; code: string }>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface CustomerSelect {
  id: string;
  companyName: string;
  email?: string;
}

let tableInitDone = false;
async function ensureCustomerProjectsTable() {
  if (tableInitDone) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_projects (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS unique_customer_project_idx ON customer_projects (tenant_id, customer_id, project_id);
      CREATE INDEX IF NOT EXISTS idx_customer_projects_cust ON customer_projects (tenant_id, customer_id);
    `);
    tableInitDone = true;
  } catch (err) {
    console.error("Failed to ensure customer_projects table:", err);
  }
}

/**
 * Convert database row (snake_case) to Customer interface (camelCase)
 */
function mapRowToCustomer(row: any): Customer {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyName: row.company_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    country: row.country,
    taxId: row.tax_id,
    gstin: row.gstin,
    pan: row.pan,
    isActive: row.is_active,
    clientId: row.client_id,
    projectIds: row.project_ids || [],
    projects: row.projects || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

/**
 * Convert database row to CustomerSelect interface
 */
function mapRowToCustomerSelect(row: any): CustomerSelect {
  return {
    id: row.id,
    companyName: row.company_name,
    email: row.email,
  };
}

/**
 * Populate project details for a list of customers (from customer_projects and client_projects)
 */
async function populateCustomerProjects(tenantId: string, customers: Customer[]): Promise<Customer[]> {
  if (!customers.length) return customers;
  await ensureCustomerProjectsTable();

  const customerIds = customers.map((c) => c.id);
  const clientIds = customers.map((c) => c.clientId).filter(Boolean) as string[];

  // 1. Direct customer_projects
  const custProjRes = await pool.query(
    `SELECT cp.customer_id, p.id, p.name, p.code
       FROM customer_projects cp
       JOIN projects p ON p.id = cp.project_id
      WHERE cp.tenant_id = $1 AND cp.customer_id = ANY($2)`,
    [tenantId, customerIds]
  );

  // 2. Client projects if linked to a client
  let clientProjRes: { rows: any[] } = { rows: [] };
  if (clientIds.length > 0) {
    clientProjRes = await pool.query(
      `SELECT clp.client_id, p.id, p.name, p.code
         FROM client_projects clp
         JOIN projects p ON p.id = clp.project_id
        WHERE clp.tenant_id = $1 AND clp.client_id = ANY($2)`,
      [tenantId, clientIds]
    );
  }

  // Group by customer
  const projectsByCustomer = new Map<string, Array<{ id: string; name: string; code: string }>>();
  for (const c of customers) {
    projectsByCustomer.set(c.id, []);
  }

  for (const row of custProjRes.rows) {
    const list = projectsByCustomer.get(row.customer_id) || [];
    if (!list.some((p) => p.id === row.id)) {
      list.push({ id: row.id, name: row.name, code: row.code });
    }
    projectsByCustomer.set(row.customer_id, list);
  }

  for (const c of customers) {
    if (c.clientId) {
      const clientMatches = clientProjRes.rows.filter((r) => r.client_id === c.clientId);
      const list = projectsByCustomer.get(c.id) || [];
      for (const row of clientMatches) {
        if (!list.some((p) => p.id === row.id)) {
          list.push({ id: row.id, name: row.name, code: row.code });
        }
      }
      projectsByCustomer.set(c.id, list);
    }
  }

  return customers.map((c) => {
    const projs = projectsByCustomer.get(c.id) || [];
    return {
      ...c,
      projects: projs,
      projectIds: projs.map((p) => p.id),
    };
  });
}

export class CustomerModel {
  static ensureTable = ensureCustomerProjectsTable;

  /**
   * Get all customers for a tenant with pagination and search
   */
  static async getCustomers(
    tenantId: string, 
    page: number = 1, 
    limit: number = 20, 
    search?: string, 
    isActive?: boolean
  ): Promise<{ customers: Customer[]; total: number }> {
    const offset = (page - 1) * limit;
    
    let whereConditions = ['tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramIndex = 2;

    if (search) {
      whereConditions.push(`(
        company_name ILIKE $${paramIndex} OR 
        email ILIKE $${paramIndex + 1} OR 
        phone ILIKE $${paramIndex + 2}
      )`);
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      paramIndex += 3;
    }

    if (isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      queryParams.push(isActive);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get customers
    const customersQuery = `
      SELECT * FROM customers 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);

    const customersResult = await pool.query(customersQuery, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM customers 
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams.slice(0, -2));

    const mappedCustomers = customersResult.rows.map(mapRowToCustomer);
    const populatedCustomers = await populateCustomerProjects(tenantId, mappedCustomers);

    return {
      customers: populatedCustomers,
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(tenantId: string, id: string): Promise<Customer | null> {
    const query = `
      SELECT * FROM customers 
      WHERE tenant_id = $1 AND id = $2
    `;
    
    const result = await pool.query(query, [tenantId, id]);
    if (result.rows.length === 0) return null;

    const [populated] = await populateCustomerProjects(tenantId, [mapRowToCustomer(result.rows[0])]);
    return populated || null;
  }

  /**
   * Create a new customer
   */
  static async createCustomer(tenantId: string, data: CreateCustomerData, userId: string): Promise<Customer> {
    await ensureCustomerProjectsTable();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check email uniqueness only if email is provided
      if (data.email && data.email.trim()) {
        const emailCheckQuery = `
          SELECT id FROM customers 
          WHERE tenant_id = $1 AND email = $2
        `;
        const emailResult = await client.query(emailCheckQuery, [tenantId, data.email.trim()]);
        
        if (emailResult.rows.length > 0) {
          throw new Error('Customer with this email already exists in this tenant');
        }
      }

      // Insert customer
      const insertQuery = `
        INSERT INTO customers (
          id, tenant_id, company_name, email, phone, address, city, country,
          tax_id, gstin, pan, is_active, client_id, created_by, updated_by, created_at, updated_at
        ) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        RETURNING *
      `;

      const values = [
        tenantId,
        data.companyName,
        data.email?.trim() || null,
        data.phone || null,
        data.address || null,
        data.city || null,
        data.country || null,
        data.taxId || null,
        data.gstin || null,
        data.pan || null,
        data.isActive !== undefined ? data.isActive : true,
        data.clientId || null,
        userId,
        userId
      ];

      const result = await client.query(insertQuery, values);
      const newCustomer = result.rows[0];

      // Handle project associations
      const projectIdsToLink: string[] = Array.isArray(data.projectIds)
        ? data.projectIds.filter(Boolean)
        : data.projectId
        ? [data.projectId]
        : [];

      for (const pId of projectIdsToLink) {
        await client.query(
          `INSERT INTO customer_projects (id, tenant_id, customer_id, project_id, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT DO NOTHING`,
          [randomUUID(), tenantId, newCustomer.id, pId]
        );
      }

      await client.query('COMMIT');
      
      const mapped = mapRowToCustomer(newCustomer);
      const [populated] = await populateCustomerProjects(tenantId, [mapped]);
      return populated || mapped;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update customer by ID
   */
  static async updateCustomer(tenantId: string, id: string, data: UpdateCustomerData, userId: string): Promise<Customer> {
    await ensureCustomerProjectsTable();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if customer exists
      const existingQuery = `
        SELECT * FROM customers 
        WHERE tenant_id = $1 AND id = $2
      `;
      
      const existingResult = await client.query(existingQuery, [tenantId, id]);
      
      if (existingResult.rows.length === 0) {
        throw new Error('Customer not found in this tenant');
      }

      const existingCustomer = existingResult.rows[0];

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      // Normalize updates: convert empty strings to null
      const normalizedData: any = {};
      Object.entries(data).forEach(([key, value]) => {
        if (value === "") {
          normalizedData[key] = null;
        } else if (value !== undefined) {
          normalizedData[key] = value;
        }
      });

      // Check company name uniqueness if changed
      if (normalizedData.companyName && normalizedData.companyName !== existingCustomer.company_name) {
        const companyCheckQuery = `
          SELECT id FROM customers 
          WHERE tenant_id = $1 AND company_name = $2 AND id != $3
        `;
        const companyResult = await client.query(companyCheckQuery, [tenantId, normalizedData.companyName, id]);
        
        if (companyResult.rows.length > 0) {
          throw new Error('Another customer with this company name already exists');
        }
      }

      // Check email uniqueness if changed
      if (normalizedData.email && normalizedData.email !== existingCustomer.email) {
        const emailCheckQuery = `
          SELECT id FROM customers 
          WHERE tenant_id = $1 AND email = $2 AND id != $3
        `;
        const emailResult = await client.query(emailCheckQuery, [tenantId, normalizedData.email, id]);
        
        if (emailResult.rows.length > 0) {
          throw new Error('Another customer with this email already exists');
        }
      }

      // Map field names to database column names
      const fieldMapping: Record<string, string> = {
        companyName: 'company_name',
        email: 'email',
        phone: 'phone',
        address: 'address',
        city: 'city',
        country: 'country',
        taxId: 'tax_id',
        gstin: 'gstin',
        pan: 'pan',
        isActive: 'is_active',
        clientId: 'client_id'
      };

      Object.entries(normalizedData).forEach(([key, value]) => {
        if (fieldMapping[key]) {
          updateFields.push(`${fieldMapping[key]} = $${paramIndex++}`);
          updateValues.push(value);
        }
      });

      let updatedRow = existingCustomer;

      if (updateFields.length > 0) {
        updateFields.push(`updated_by = $${paramIndex++}`);
        updateFields.push(`updated_at = NOW()`);
        updateValues.push(userId);

        const updateQuery = `
          UPDATE customers
          SET ${updateFields.join(', ')}
          WHERE tenant_id = $${paramIndex++} AND id = $${paramIndex++}
          RETURNING *
        `;

        updateValues.push(tenantId, id);

        const updateResult = await client.query(updateQuery, updateValues);
        updatedRow = updateResult.rows[0];
      }

      // Handle project associations update if provided
      if (data.projectIds !== undefined || data.projectId !== undefined) {
        const projectIdsToLink: string[] = Array.isArray(data.projectIds)
          ? data.projectIds.filter(Boolean)
          : data.projectId
          ? [data.projectId]
          : [];

        await client.query(
          `DELETE FROM customer_projects WHERE tenant_id = $1 AND customer_id = $2`,
          [tenantId, id]
        );

        for (const pId of projectIdsToLink) {
          await client.query(
            `INSERT INTO customer_projects (id, tenant_id, customer_id, project_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT DO NOTHING`,
            [randomUUID(), tenantId, id, pId]
          );
        }
      }

      await client.query('COMMIT');
      
      const mapped = mapRowToCustomer(updatedRow);
      const [populated] = await populateCustomerProjects(tenantId, [mapped]);
      return populated || mapped;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete customer by ID
   */
  static async deleteCustomer(tenantId: string, id: string): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if customer exists
      const existingQuery = `
        SELECT id FROM customers 
        WHERE tenant_id = $1 AND id = $2
      `;
      
      const existingResult = await client.query(existingQuery, [tenantId, id]);
      
      if (existingResult.rows.length === 0) {
        throw new Error('Customer not found');
      }

      // Delete customer_projects first
      await client.query(
        `DELETE FROM customer_projects WHERE tenant_id = $1 AND customer_id = $2`,
        [tenantId, id]
      ).catch(() => {});

      // Delete customer
      await client.query('DELETE FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, id]);

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get customers for dropdown/select
   */
  static async getCustomersForSelect(tenantId: string): Promise<CustomerSelect[]> {
    const query = `
      SELECT id, company_name, email FROM customers 
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY company_name ASC
    `;
    
    const result = await pool.query(query, [tenantId]);
    
    return result.rows.map(mapRowToCustomerSelect);
  }
}
