// src/modules/project-agreements/repositories/branding.repo.ts
//
// The letterhead every generated agreement wears: logo + company name + tagline
// top-right, phone / email / website along the footer.
//
// WHY ITS OWN ROW rather than reading general_settings and cd_company_details
// on every render: a contract letterhead is a deliberate choice. The support
// number on an invoice and the number a client should call about a signed SOW
// are often different, and a tagline does not exist anywhere else in this
// database at all. So the row is SEEDED from those tables the first time
// anybody opens the branding page, then owned by this module.
//
// The seed is best-effort by design — a tenant that has not filled in company
// details yet gets an empty form, not a 500.

import { TenantClient } from '../db/pool';
import { Branding } from '../types';

const SELECT = `
  SELECT company_name AS "companyName",
         tagline,
         logo_url     AS "logoUrl",
         signature_url AS "signatureUrl",
         phone,
         email,
         website,
         location,
         footer_note  AS "footerNote",
         updated_at   AS "updatedAt"
    FROM pa_branding
   WHERE tenant_id = $1
`;

const EMPTY: Branding = {
  companyName: null,
  tagline: null,
  logoUrl: null,
  signatureUrl: null,
  phone: null,
  email: null,
  website: null,
  location: null,
  footerNote: null,
};

/** Read the letterhead, seeding it from company settings on first access. */
export async function getBranding(client: TenantClient): Promise<Branding> {
  const { rows } = await client.query<Branding>(SELECT, [client.tenantId]);
  if (rows[0]) return rows[0];

  const seed = await readSeed(client);
  const { rows: created } = await client.query<Branding>(
    `INSERT INTO pa_branding
       (tenant_id, company_name, tagline, logo_url, phone, email, website, location)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tenant_id) DO NOTHING
     RETURNING company_name AS "companyName", tagline, logo_url AS "logoUrl",
               signature_url AS "signatureUrl",
               phone, email, website, location, footer_note AS "footerNote",
               updated_at AS "updatedAt"`,
    [
      client.tenantId,
      seed.companyName,
      seed.tagline,
      seed.logoUrl,
      seed.phone,
      seed.email,
      seed.website,
      seed.location,
    ]
  );
  if (created[0]) return created[0];

  // Lost the insert race — read what the winner wrote.
  const { rows: again } = await client.query<Branding>(SELECT, [client.tenantId]);
  return again[0] ?? { ...EMPTY };
}

/**
 * Save the letterhead.
 *
 * OMITTED IS NOT THE SAME AS CLEARED. A key absent from `input` keeps whatever
 * is stored; a key sent as null or an empty string clears it. That distinction
 * is what lets the form save the tagline without shipping an 80KB logo data URI
 * back up the wire on every keystroke of a text field — and it stops a caller
 * that sends a partial letterhead from silently wiping the logo.
 */
export async function saveBranding(
  client: TenantClient,
  input: Partial<Branding>,
  userId: string | null
): Promise<Branding> {
  // Also guarantees the row exists, so the upsert below only ever updates.
  const current = await getBranding(client);
  const keep = <K extends keyof Branding>(key: K) =>
    input[key] === undefined ? current[key] : input[key];

  const { rows } = await client.query<Branding>(
    `INSERT INTO pa_branding
       (tenant_id, company_name, tagline, logo_url, phone, email, website, location,
        footer_note, signature_url, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     ON CONFLICT (tenant_id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       tagline      = EXCLUDED.tagline,
       logo_url      = EXCLUDED.logo_url,
       signature_url = EXCLUDED.signature_url,
       phone        = EXCLUDED.phone,
       email        = EXCLUDED.email,
       website      = EXCLUDED.website,
       location     = EXCLUDED.location,
       footer_note  = EXCLUDED.footer_note,
       updated_by   = EXCLUDED.updated_by,
       updated_at   = now()
     RETURNING company_name AS "companyName", tagline, logo_url AS "logoUrl",
               signature_url AS "signatureUrl",
               phone, email, website, location, footer_note AS "footerNote",
               updated_at AS "updatedAt"`,
    [
      client.tenantId,
      nullish(keep('companyName')),
      nullish(keep('tagline')),
      nullish(keep('logoUrl')),
      nullish(keep('phone')),
      nullish(keep('email')),
      nullish(keep('website')),
      nullish(keep('location')),
      nullish(keep('footerNote')),
      nullish(keep('signatureUrl')),
      userId,
    ]
  );
  return rows[0];
}

/** Store just the signature, leaving the rest of the letterhead alone. */
export async function saveSignature(
  client: TenantClient,
  signatureUrl: string | null,
  userId: string | null
): Promise<Branding> {
  await getBranding(client); // guarantees the row exists
  const { rows } = await client.query<Branding>(
    `UPDATE pa_branding
        SET signature_url = $2, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1
      RETURNING company_name AS "companyName", tagline, logo_url AS "logoUrl",
                signature_url AS "signatureUrl",
                phone, email, website, location, footer_note AS "footerNote",
                updated_at AS "updatedAt"`,
    [client.tenantId, signatureUrl, userId]
  );
  return rows[0];
}

/** Store just the logo, leaving the rest of the letterhead alone. */
export async function saveLogo(
  client: TenantClient,
  logoUrl: string,
  userId: string | null
): Promise<Branding> {
  await getBranding(client); // guarantees the row exists
  const { rows } = await client.query<Branding>(
    `UPDATE pa_branding
        SET logo_url = $2, updated_by = $3, updated_at = now()
      WHERE tenant_id = $1
      RETURNING company_name AS "companyName", tagline, logo_url AS "logoUrl",
                signature_url AS "signatureUrl",
                phone, email, website, location, footer_note AS "footerNote",
                updated_at AS "updatedAt"`,
    [client.tenantId, logoUrl, userId]
  );
  return rows[0];
}

/**
 * First-run defaults, pulled from whatever the tenant has already filled in.
 * Both source tables are Prisma-/other-module-owned and may legitimately be
 * missing, so every lookup is wrapped: no company profile means an empty
 * letterhead to fill in, never a failed page load.
 */
async function readSeed(client: TenantClient): Promise<Branding> {
  const seed: Branding = { ...EMPTY };

  try {
    const { rows } = await client.query<any>(
      `SELECT registered_name, primary_email, primary_phone, website,
              city, pincode, country
         FROM cd_company_details
        WHERE tenant_id = $1
        LIMIT 1`,
      [client.tenantId]
    );
    if (rows[0]) {
      seed.companyName = rows[0].registered_name ?? null;
      seed.email = rows[0].primary_email ?? null;
      seed.phone = rows[0].primary_phone ?? null;
      seed.website = rows[0].website ?? null;
      // A footer location is a place, not a postal address: city with its
      // pincode and the country, the way letterheads actually print it
      // ("Chennai-91, India"). The full registered address stays in
      // cd_company_details, and the footer note is there for anyone who wants
      // to print more of it.
      const city = [rows[0].city, rows[0].pincode].filter(Boolean).join('-');
      seed.location = [city, rows[0].country].filter(Boolean).join(', ') || null;
    }
  } catch {
    // cd_company_details not migrated on this database yet — fine, skip it.
  }

  try {
    const { rows } = await client.query<any>(
      `SELECT company_name, company_logo
         FROM general_settings
        WHERE tenant_id = $1
        ORDER BY created_at ASC NULLS LAST
        LIMIT 1`,
      [client.tenantId]
    );
    if (rows[0]) {
      seed.companyName = seed.companyName ?? rows[0].company_name ?? null;
      seed.logoUrl = rows[0].company_logo ?? null;
    }
  } catch {
    // general_settings absent — skip.
  }

  return seed;
}

const nullish = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
