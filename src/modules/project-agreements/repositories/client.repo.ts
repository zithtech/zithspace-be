// src/modules/project-agreements/repositories/client.repo.ts
//
// The SECOND place this module reads tables it does not own (see
// project.repo.ts for the first, and the same rules apply).
//
// `clients_v2` and `client_contacts_v2` belong to the Clients module. They are
// read here — never written — so the coupling stays one file you can point at.
// Everything the composer takes from a client is COPIED onto the agreement
// (company name, contact name, email, phone), which is why renaming a client
// later does not rewrite a document somebody already signed.
//
// NOTE ON RLS: these tables carry no row-level policy, so the explicit
// `tenant_id = $1` filter below is the only thing keeping one tenant out of
// another's client list. Do not remove it.

import { TenantClient } from '../db/pool';
import { ClientContact, ClientOption } from '../types';

/** Active clients a document can be addressed to, most recent first. */
export async function listClients(
  client: TenantClient,
  search?: string
): Promise<ClientOption[]> {
  const params: any[] = [client.tenantId];
  // ACTIVE ONLY. Raising a new agreement against a client somebody has
  // deactivated is almost always a mistake, and the picker is the cheapest
  // place to prevent it.
  const where = ['c.tenant_id = $1', 'c.is_active = true'];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(
      `(lower(c.company_name) LIKE $${params.length}
        OR lower(COALESCE(c.client_code, '')) LIKE $${params.length})`
    );
  }

  const { rows } = await client.query<ClientOption>(
    `SELECT c.id,
            c.company_name AS "companyName",
            c.client_code  AS "clientCode",
            c.status,
            c.website,
            c.billing_address AS "billingAddress"
       FROM clients_v2 c
      WHERE ${where.join(' AND ')}
      ORDER BY c.created_at DESC
      LIMIT 500`,
    params
  );
  return rows;
}

/** One active client, or null. */
export async function getClient(
  client: TenantClient,
  clientId: string
): Promise<ClientOption | null> {
  const { rows } = await client.query<ClientOption>(
    `SELECT c.id,
            c.company_name AS "companyName",
            c.client_code  AS "clientCode",
            c.status,
            c.website,
            c.billing_address AS "billingAddress"
       FROM clients_v2 c
      WHERE c.tenant_id = $1 AND c.id = $2`,
    [client.tenantId, clientId]
  );
  return rows[0] ?? null;
}

/**
 * Who at this client the document can be addressed to.
 *
 * Primary contact first, then alphabetically — the primary is the answer most
 * of the time, and it should not need finding. Contacts with no email are kept
 * rather than filtered: the composer shows them greyed so it is clear the
 * record is incomplete, instead of silently offering a shorter list than the
 * client screen shows.
 */
export async function listContacts(
  client: TenantClient,
  clientId: string
): Promise<ClientContact[]> {
  const { rows } = await client.query<ClientContact>(
    `SELECT cc.id,
            cc.first_name     AS "firstName",
            cc.last_name      AS "lastName",
            cc.display_name   AS "displayName",
            cc.designation,
            cc.department,
            cc.contact_type   AS "contactType",
            cc.is_primary     AS "isPrimary",
            cc.official_email AS "officialEmail",
            cc.secondary_email AS "secondaryEmail",
            cc.mobile_number  AS "mobileNumber",
            cc.alternate_phone AS "alternatePhone",
            cc.office_landline AS "officeLandline",
            cc.status
       FROM client_contacts_v2 cc
      WHERE cc.tenant_id = $1 AND cc.client_id = $2
      ORDER BY cc.is_primary DESC NULLS LAST,
               lower(COALESCE(cc.display_name, cc.first_name, '')) ASC
      LIMIT 500`,
    [client.tenantId, clientId]
  );
  return rows;
}
