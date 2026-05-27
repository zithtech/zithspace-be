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

export class CustomerModel {
  
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

    return {
      customers: customersResult.rows.map(mapRowToCustomer),
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
    return result.rows.length > 0 ? mapRowToCustomer(result.rows[0]) : null;
  }

  /**
   * Create a new customer
   */
  static async createCustomer(tenantId: string, data: CreateCustomerData, userId: string): Promise<Customer> {
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
      await client.query('COMMIT');
      
      return mapRowToCustomer(result.rows[0]);

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
      const fieldMapping = {
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

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

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
      await client.query('COMMIT');
      
      return mapRowToCustomer(updateResult.rows[0]);

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
