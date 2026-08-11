// src/modules/company-details/repositories/companyDetails.repo.ts
//
// Raw-SQL data access for cd_company_details — the single registered-company
// row per tenant. The UNIQUE(tenant_id) constraint is what lets `save` be one
// atomic upsert instead of a read-then-branch race.

import { TenantClient } from '../db/pool';
import { CompanyDetails } from '../types';
import { SaveCompanyDetailsInput } from '../validators/companyDetails.validator';

export function mapCompanyDetails(r: any): CompanyDetails {
  return {
    id: r.id,
    registeredName: r.registered_name,
    gstNumber: r.gst_number,
    primaryEmail: r.primary_email,
    primaryPhone: r.primary_phone,
    website: r.website,
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLUMNS = `id, registered_name, gst_number, primary_email, primary_phone,
                 website, door_number, floor, building, area, street, city,
                 district, state, pincode, country, created_at, updated_at`;

/** The tenant's company profile, or null before it has ever been saved. */
export async function findByTenant(client: TenantClient): Promise<CompanyDetails | null> {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM cd_company_details WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return rows.length ? mapCompanyDetails(rows[0]) : null;
}

/** Just the primary email — used to resolve branches that reuse it. */
export async function findPrimaryEmail(client: TenantClient): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT primary_email FROM cd_company_details WHERE tenant_id = $1`,
    [client.tenantId]
  );
  return rows.length ? rows[0].primary_email : null;
}

/** Insert on first save, update thereafter. */
export async function save(
  client: TenantClient,
  input: SaveCompanyDetailsInput,
  userId: string
): Promise<CompanyDetails> {
  const { rows } = await client.query(
    `INSERT INTO cd_company_details (
       tenant_id, registered_name, gst_number, primary_email, primary_phone,
       website, door_number, floor, building, area, street, city, district,
       state, pincode, country, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17)
     ON CONFLICT (tenant_id) DO UPDATE SET
       registered_name = EXCLUDED.registered_name,
       gst_number      = EXCLUDED.gst_number,
       primary_email   = EXCLUDED.primary_email,
       primary_phone   = EXCLUDED.primary_phone,
       website         = EXCLUDED.website,
       door_number     = EXCLUDED.door_number,
       floor           = EXCLUDED.floor,
       building        = EXCLUDED.building,
       area            = EXCLUDED.area,
       street          = EXCLUDED.street,
       city            = EXCLUDED.city,
       district        = EXCLUDED.district,
       state           = EXCLUDED.state,
       pincode         = EXCLUDED.pincode,
       country         = EXCLUDED.country,
       updated_by      = EXCLUDED.updated_by,
       updated_at      = now()
     RETURNING ${COLUMNS}`,
    [
      client.tenantId,
      input.registeredName,
      input.gstNumber,
      input.primaryEmail,
      input.primaryPhone,
      input.website,
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
  return mapCompanyDetails(rows[0]);
}
