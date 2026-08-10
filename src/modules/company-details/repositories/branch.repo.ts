// src/modules/company-details/repositories/branch.repo.ts
//
// Raw-SQL data access for cd_company_branches — the additional office
// locations belonging to a tenant's registered company.
//
// EMAIL RESOLUTION: a branch stores `use_company_email` + an optional
// `branch_email`. Every read LEFT JOINs cd_company_details so callers receive
// `effectiveEmail` already resolved and never have to re-derive the rule.

import { TenantClient } from '../db/pool';
import { CompanyBranch } from '../types';
import { CreateBranchInput, UpdateBranchInput } from '../validators/companyDetails.validator';

function mapBranch(r: any): CompanyBranch {
  const branchEmail = r.use_company_email ? null : r.branch_email;
  return {
    id: r.id,
    branchName: r.branch_name,
    useCompanyEmail: r.use_company_email,
    branchEmail,
    effectiveEmail: r.use_company_email ? r.company_email ?? null : branchEmail,
    branchPhone: r.branch_phone,
    doorNumber: r.door_number,
    floor: r.floor,
    building: r.building,
    area: r.area,
    street: r.street,
    city: r.city,
    district: r.district,
    state: r.state,
    pincode: r.pincode,
    country: r.country,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_BRANCH = `
  SELECT b.id, b.branch_name, b.use_company_email, b.branch_email, b.branch_phone,
         b.door_number, b.floor, b.building, b.area, b.street, b.city, b.district,
         b.state, b.pincode, b.country, b.is_active, b.created_at, b.updated_at,
         c.primary_email AS company_email
    FROM cd_company_branches b
    LEFT JOIN cd_company_details c ON c.tenant_id = b.tenant_id`;

export async function findAll(client: TenantClient): Promise<CompanyBranch[]> {
  const { rows } = await client.query(
    `${SELECT_BRANCH} WHERE b.tenant_id = $1 ORDER BY b.created_at DESC`,
    [client.tenantId]
  );
  return rows.map(mapBranch);
}

export async function findById(client: TenantClient, id: string): Promise<CompanyBranch | null> {
  const { rows } = await client.query(`${SELECT_BRANCH} WHERE b.tenant_id = $1 AND b.id = $2`, [
    client.tenantId,
    id,
  ]);
  return rows.length ? mapBranch(rows[0]) : null;
}

/**
 * Reusing the company email is the default, so an absent flag means `true`.
 * (tsconfig runs with strict:false, which widens zod's `.default()` output to
 * optional — normalise here rather than trusting the inferred type.)
 */
function reusesCompanyEmail(input: { useCompanyEmail?: boolean }): boolean {
  return input.useCompanyEmail !== false;
}

export async function create(
  client: TenantClient,
  input: CreateBranchInput,
  userId: string
): Promise<CompanyBranch> {
  const useCompanyEmail = reusesCompanyEmail(input);
  const { rows } = await client.query(
    `INSERT INTO cd_company_branches (
       tenant_id, branch_name, use_company_email, branch_email, branch_phone,
       door_number, floor, building, area, street, city, district, state,
       pincode, country, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
     RETURNING id`,
    [
      client.tenantId,
      input.branchName,
      useCompanyEmail,
      // Never persist a stale address on a branch that reuses the company one.
      useCompanyEmail ? null : input.branchEmail,
      input.branchPhone,
      input.doorNumber,
      input.floor,
      input.building,
      input.area,
      input.street,
      input.city,
      input.district,
      input.state,
      input.pincode,
      input.country,
      userId,
    ]
  );
  // Re-read so the caller gets the resolved effectiveEmail in one shape.
  return (await findById(client, rows[0].id)) as CompanyBranch;
}

export async function update(
  client: TenantClient,
  id: string,
  input: UpdateBranchInput,
  userId: string
): Promise<CompanyBranch | null> {
  const useCompanyEmail = reusesCompanyEmail(input);
  const { rowCount } = await client.query(
    `UPDATE cd_company_branches SET
       branch_name       = $3,
       use_company_email = $4,
       branch_email      = $5,
       branch_phone      = $6,
       door_number       = $7,
       floor             = $8,
       building          = $9,
       area              = $10,
       street            = $11,
       city              = $12,
       district          = $13,
       state             = $14,
       pincode           = $15,
       country           = $16,
       is_active         = COALESCE($17, is_active),
       updated_by        = $18,
       updated_at        = now()
     WHERE tenant_id = $1 AND id = $2`,
    [
      client.tenantId,
      id,
      input.branchName,
      useCompanyEmail,
      useCompanyEmail ? null : input.branchEmail,
      input.branchPhone,
      input.doorNumber,
      input.floor,
      input.building,
      input.area,
      input.street,
      input.city,
      input.district,
      input.state,
      input.pincode,
      input.country,
      input.isActive ?? null,
      userId,
    ]
  );
  if (!rowCount) return null;
  return findById(client, id);
}

export async function remove(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM cd_company_branches WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id]
  );
  return !!rowCount;
}
