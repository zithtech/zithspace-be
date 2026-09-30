// src/modules/mail-templates/repositories/recipient.repo.ts
//
// The ONLY place this module reads tables it does not own, so the coupling
// stays one file you can point at:
//
//   client_contacts_v2 / clients_v2 — owned by the Clients module
//   users / positions               — owned by Prisma
//
// They are read, never written. Each row is turned straight into the
// placeholder values its group defines (see ../placeholders.ts), so the
// token → column mapping lives here and nowhere else.
//
// NOTE ON RLS: none of these tables carries a row-level policy, so the
// explicit `tenant_id = $1` filter below is the only thing keeping one tenant
// out of another's contacts. Do not remove it.

import { TenantClient } from '../db/pool';
import { Recipient, Sender } from '../types';

/**
 * Trim, and treat blank as absent.
 *
 * Contact records collected over years are full of single-space columns. A
 * placeholder filled with " " renders as "Hi Krishnan  ," and — worse — counts
 * as resolved, so the sender is never warned. Blank must mean missing.
 */
function text(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function mapClientContact(r: any): Recipient {
  const name =
    text(r.display_name) ||
    [text(r.first_name), text(r.last_name)].filter(Boolean).join(' ') ||
    text(r.official_email) ||
    '';

  return {
    id: r.id,
    kind: 'client_contact',
    name,
    email: text(r.official_email) ?? text(r.secondary_email) ?? '',
    subtitle: text(r.company_name),
    values: {
      client_name: name || null,
      client_first_name: text(r.first_name),
      client_last_name: text(r.last_name),
      client_mail: text(r.official_email) ?? text(r.secondary_email),
      client_phone: text(r.mobile_number),
      client_company: text(r.company_name),
      client_designation: text(r.designation),
      client_department: text(r.department),
      // Whichever alternate number the record actually has.
      client_alt_phone: text(r.alternate_phone) ?? text(r.office_landline),
      client_website: text(r.website),
    },
  };
}

function mapMember(r: any): Recipient {
  const name = text(r.name) ?? text(r.work_email) ?? '';
  return {
    id: r.id,
    kind: 'member',
    name,
    email: text(r.work_email) ?? '',
    subtitle: text(r.position_title) ?? text(r.department),
    values: {
      member_name: name || null,
      // Users are stored as one `name` column, so the first word is the only
      // first name available.
      member_first_name: name.split(/\s+/)[0] || null,
      member_mail: text(r.work_email),
      member_phone: text(r.phone),
      member_position: text(r.position_title),
      member_department: text(r.department),
    },
  };
}

const SELECT_CONTACT = `
  SELECT cc.id, cc.first_name, cc.last_name, cc.display_name, cc.designation,
         cc.department, cc.official_email, cc.secondary_email, cc.mobile_number,
         cc.alternate_phone, cc.office_landline,
         c.company_name, c.website
    FROM client_contacts_v2 cc
    LEFT JOIN clients_v2 c ON c.id = cc.client_id AND c.tenant_id = cc.tenant_id`;

const SELECT_MEMBER = `
  SELECT u.id, u.name, u.work_email, u.phone, u.department,
         p.title AS position_title
    FROM users u
    LEFT JOIN positions p ON p.id = u.position_id AND p.tenant_id = u.tenant_id`;

/**
 * The signed-in member, as the `my_*` placeholder values a signature is built
 * from and resolved against.
 *
 * Deliberately the same query as a member recipient — the sender IS a member,
 * and reading them from a second source is how the two drift apart.
 */
export async function findSender(client: TenantClient, userId: string): Promise<Sender | null> {
  const { rows } = await client.query(`${SELECT_MEMBER} WHERE u.tenant_id = $1 AND u.id = $2`, [
    client.tenantId,
    userId,
  ]);
  if (!rows.length) return null;

  const member = mapMember(rows[0]);
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    values: {
      my_name: member.values.member_name,
      my_first_name: member.values.member_first_name,
      my_mail: member.values.member_mail,
      my_phone: member.values.member_phone,
      my_position: member.values.member_position,
      my_department: member.values.member_department,
    },
  };
}

/**
 * Both groups of recipients in one list, client contacts first.
 *
 * Active records only: addressing a template to a contact somebody has
 * deactivated is almost always a mistake, and the picker is the cheapest place
 * to prevent it. Contacts with no email are dropped — there is nothing to send
 * to and nothing to resolve `{{client_mail}}` from.
 */
export async function search(client: TenantClient, term?: string, limit = 50): Promise<Recipient[]> {
  const like = term ? `%${term.toLowerCase()}%` : null;

  const contactParams: any[] = [client.tenantId];
  const contactWhere = [
    'cc.tenant_id = $1',
    `lower(COALESCE(cc.status, 'active')) = 'active'`,
    `COALESCE(cc.official_email, cc.secondary_email, '') <> ''`,
  ];
  if (like) {
    contactParams.push(like);
    contactWhere.push(
      `(lower(COALESCE(cc.display_name, '')) LIKE $2
        OR lower(COALESCE(cc.first_name, '')) LIKE $2
        OR lower(COALESCE(cc.last_name, '')) LIKE $2
        OR lower(COALESCE(cc.official_email, '')) LIKE $2
        OR lower(COALESCE(c.company_name, '')) LIKE $2)`
    );
  }
  contactParams.push(limit);

  const memberParams: any[] = [client.tenantId];
  const memberWhere = ['u.tenant_id = $1', 'u.is_active = true', `COALESCE(u.work_email, '') <> ''`];
  if (like) {
    memberParams.push(like);
    memberWhere.push(
      `(lower(COALESCE(u.name, '')) LIKE $2
        OR lower(COALESCE(u.work_email, '')) LIKE $2
        OR lower(COALESCE(p.title, '')) LIKE $2)`
    );
  }
  memberParams.push(limit);

  const [contacts, members] = await Promise.all([
    client.query(
      `${SELECT_CONTACT}
        WHERE ${contactWhere.join(' AND ')}
        ORDER BY cc.is_primary DESC NULLS LAST,
                 lower(COALESCE(cc.display_name, cc.first_name, '')) ASC
        LIMIT $${contactParams.length}`,
      contactParams
    ),
    client.query(
      `${SELECT_MEMBER}
        WHERE ${memberWhere.join(' AND ')}
        ORDER BY lower(COALESCE(u.name, '')) ASC
        LIMIT $${memberParams.length}`,
      memberParams
    ),
  ]);

  return [...contacts.rows.map(mapClientContact), ...members.rows.map(mapMember)];
}

export async function findClientContact(
  client: TenantClient,
  id: string
): Promise<Recipient | null> {
  const { rows } = await client.query(`${SELECT_CONTACT} WHERE cc.tenant_id = $1 AND cc.id = $2`, [
    client.tenantId,
    id,
  ]);
  return rows.length ? mapClientContact(rows[0]) : null;
}

export async function findMember(client: TenantClient, id: string): Promise<Recipient | null> {
  const { rows } = await client.query(`${SELECT_MEMBER} WHERE u.tenant_id = $1 AND u.id = $2`, [
    client.tenantId,
    id,
  ]);
  return rows.length ? mapMember(rows[0]) : null;
}

/**
 * Find whoever owns this address.
 *
 * Client contacts are checked first: an address that belongs to both is far
 * more likely to be meant as the client-facing one, and a template addressed
 * to a client reads wrongly if it fills in member placeholders instead. Both
 * of the contact's addresses count — people reply from their secondary one.
 */
export async function findByEmail(client: TenantClient, email: string): Promise<Recipient | null> {
  const needle = email.trim().toLowerCase();

  const contact = await client.query(
    `${SELECT_CONTACT}
      WHERE cc.tenant_id = $1
        AND (lower(cc.official_email) = $2 OR lower(cc.secondary_email) = $2)
      ORDER BY cc.is_primary DESC NULLS LAST
      LIMIT 1`,
    [client.tenantId, needle]
  );
  if (contact.rows.length) return mapClientContact(contact.rows[0]);

  const member = await client.query(
    `${SELECT_MEMBER}
      WHERE u.tenant_id = $1 AND lower(u.work_email) = $2
      LIMIT 1`,
    [client.tenantId, needle]
  );
  return member.rows.length ? mapMember(member.rows[0]) : null;
}
