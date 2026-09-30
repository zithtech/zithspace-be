// src/modules/mail-templates/repositories/mailTemplate.repo.ts
//
// Raw-SQL data access for mt_mail_templates.
//
// The stored row knows nothing about placeholders; the tokens reported on the
// way out are derived from the copy itself so a template can never disagree
// with its own body.

import { TenantClient } from '../db/pool';
import { KNOWN_FIELDS, tokensIn } from '../placeholders';
import { MailTemplate, TemplateCategory, UNCATEGORIZED } from '../types';
import { CreateTemplateInput, UpdateTemplateInput } from '../validators/mailTemplate.validator';

function mapTemplate(r: any): MailTemplate {
  const placeholders = tokensIn(r.subject, r.body);
  return {
    id: r.id,
    name: r.name,
    subject: r.subject,
    body: r.body,
    category: r.category,
    isDefault: r.is_default,
    placeholders,
    unknownPlaceholders: placeholders.filter((t) => !KNOWN_FIELDS.has(t)),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_TEMPLATE = `
  SELECT id, name, subject, body, category, is_default, created_at, updated_at
    FROM mt_mail_templates`;

export async function findAll(
  client: TenantClient,
  search?: string,
  category?: string
): Promise<MailTemplate[]> {
  const params: any[] = [client.tenantId];
  const where = ['tenant_id = $1'];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(lower(name) LIKE $${params.length} OR lower(subject) LIKE $${params.length})`);
  }

  // Templates written before anyone thought about categories are a real group
  // in the sidebar, not an absence of one — so they get a filter of their own
  // rather than being reachable only by scrolling past everything else.
  if (category === UNCATEGORIZED) {
    where.push(`(category IS NULL OR category = '')`);
  } else if (category) {
    params.push(category.toLowerCase());
    where.push(`lower(category) = $${params.length}`);
  }

  const { rows } = await client.query(
    `${SELECT_TEMPLATE}
      WHERE ${where.join(' AND ')}
      ORDER BY is_default DESC, updated_at DESC
      LIMIT 500`,
    params
  );
  return rows.map(mapTemplate);
}

/**
 * The categories in use, with how many templates sit in each.
 *
 * Derived from the templates themselves rather than kept in a table of their
 * own: a category exists exactly as long as something is filed under it, so
 * renaming the last template out of one makes it disappear on its own and the
 * sidebar can never list an empty shelf.
 *
 * Grouped case-insensitively ("Client" and "client" are one shelf) but shown
 * with the spelling most recently used, so the label matches what people type.
 */
export async function findCategories(client: TenantClient): Promise<TemplateCategory[]> {
  const { rows } = await client.query(
    `SELECT DISTINCT ON (lower(category))
            category AS name,
            count(*) OVER (PARTITION BY lower(category))::int AS count
       FROM mt_mail_templates
      WHERE tenant_id = $1 AND category IS NOT NULL AND category <> ''
      ORDER BY lower(category), updated_at DESC`,
    [client.tenantId]
  );

  const { rows: none } = await client.query(
    `SELECT count(*)::int AS count
       FROM mt_mail_templates
      WHERE tenant_id = $1 AND (category IS NULL OR category = '')`,
    [client.tenantId]
  );

  const categories: TemplateCategory[] = rows
    .map((r: any) => ({ name: r.name as string, count: r.count as number }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  // Uncategorised always sits last, and only when there is something in it.
  if (none[0]?.count > 0) categories.push({ name: null, count: none[0].count });
  return categories;
}

export async function findById(client: TenantClient, id: string): Promise<MailTemplate | null> {
  const { rows } = await client.query(`${SELECT_TEMPLATE} WHERE tenant_id = $1 AND id = $2`, [
    client.tenantId,
    id,
  ]);
  return rows.length ? mapTemplate(rows[0]) : null;
}

/** Is this name already taken? `exceptId` lets a rename keep its own name. */
export async function nameExists(
  client: TenantClient,
  name: string,
  exceptId?: string
): Promise<boolean> {
  const params: any[] = [client.tenantId, name.toLowerCase()];
  let sql = `SELECT 1 FROM mt_mail_templates WHERE tenant_id = $1 AND lower(name) = $2`;
  if (exceptId) {
    params.push(exceptId);
    sql += ` AND id <> $3`;
  }
  const { rows } = await client.query(`${sql} LIMIT 1`, params);
  return rows.length > 0;
}

/**
 * Clear the tenant's current default.
 *
 * Called inside the same transaction as the write that sets a new one, so the
 * partial unique index never sees two defaults at once.
 */
export async function clearDefault(client: TenantClient, exceptId?: string): Promise<void> {
  const params: any[] = [client.tenantId];
  let sql = `UPDATE mt_mail_templates SET is_default = false WHERE tenant_id = $1 AND is_default`;
  if (exceptId) {
    params.push(exceptId);
    sql += ` AND id <> $2`;
  }
  await client.query(sql, params);
}

export async function create(
  client: TenantClient,
  input: CreateTemplateInput,
  userId: string
): Promise<MailTemplate> {
  const { rows } = await client.query(
    `INSERT INTO mt_mail_templates (
       tenant_id, name, subject, body, category, is_default, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING id`,
    [
      client.tenantId,
      input.name,
      input.subject,
      input.body,
      input.category ?? null,
      input.isDefault === true,
      userId,
    ]
  );
  return (await findById(client, rows[0].id))!;
}

export async function update(
  client: TenantClient,
  id: string,
  input: UpdateTemplateInput,
  userId: string
): Promise<MailTemplate | null> {
  // Only the fields actually sent are touched — a rename must not blank a body.
  const sets: string[] = [];
  const params: any[] = [];
  const set = (column: string, value: any) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (input.name !== undefined) set('name', input.name);
  if (input.subject !== undefined) set('subject', input.subject);
  if (input.body !== undefined) set('body', input.body);
  if (input.category !== undefined) set('category', input.category);
  if (input.isDefault !== undefined) set('is_default', input.isDefault);

  params.push(userId);
  sets.push(`updated_by = $${params.length}`);
  sets.push(`updated_at = now()`);

  params.push(client.tenantId, id);
  const { rowCount } = await client.query(
    `UPDATE mt_mail_templates SET ${sets.join(', ')}
      WHERE tenant_id = $${params.length - 1} AND id = $${params.length}`,
    params
  );
  return rowCount ? findById(client, id) : null;
}

export async function remove(client: TenantClient, id: string): Promise<boolean> {
  const { rowCount } = await client.query(
    `DELETE FROM mt_mail_templates WHERE tenant_id = $1 AND id = $2`,
    [client.tenantId, id]
  );
  return rowCount > 0;
}
