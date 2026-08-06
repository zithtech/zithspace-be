// src/modules/opening-management/repositories/openingTeam.repo.ts
//
// Raw-SQL data access for the three child collections of an opening:
//   om_opening_recruiters, om_opening_hiring_team, om_opening_documents.
//
// All three use REPLACE semantics: the service hands over the complete desired
// set and this layer deletes what is gone and inserts what is new, inside the
// caller's transaction. That keeps "PUT the whole list" endpoints simple and
// idempotent.
//
// As everywhere in this module, each query is scoped to a TenantClient AND
// filters `tenant_id = $1` explicitly.

import { TenantClient } from '../db/pool';
import { HiringTeamMember, HiringTeamMemberType, OpeningRecruiter, RequiredDocument } from '../types';

// ─── Recruiters ─────────────────────────────────────────────────────────────

interface RecruiterRow {
  id: string;
  opening_id: string;
  recruiter_id: string;
  recruiter_name: string | null;
  recruiter_email: string | null;
  is_primary: boolean;
  assigned_by: string | null;
  assigned_at: Date;
}

function mapRecruiter(row: RecruiterRow): OpeningRecruiter {
  return {
    id: row.id,
    openingId: row.opening_id,
    recruiterId: row.recruiter_id,
    recruiterName: row.recruiter_name,
    recruiterEmail: row.recruiter_email,
    isPrimary: row.is_primary,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
  };
}

export interface RecruiterData {
  recruiterId: string;
  isPrimary: boolean;
}

export async function findRecruiters(
  client: TenantClient,
  openingId: string
): Promise<OpeningRecruiter[]> {
  const { rows } = await client.query<RecruiterRow>(
    `SELECT r.id, r.opening_id, r.recruiter_id,
            u.name AS recruiter_name, u.work_email AS recruiter_email,
            r.is_primary, r.assigned_by, r.assigned_at
       FROM om_opening_recruiters r
       LEFT JOIN users u ON u.id = r.recruiter_id
      WHERE r.tenant_id = $1 AND r.opening_id = $2
      ORDER BY r.is_primary DESC, r.assigned_at ASC`,
    [client.tenantId, openingId]
  );
  return rows.map(mapRecruiter);
}

/** Recruiters for many openings at once — avoids an N+1 on list endpoints. */
export async function findRecruitersForOpenings(
  client: TenantClient,
  openingIds: string[]
): Promise<Map<string, OpeningRecruiter[]>> {
  const grouped = new Map<string, OpeningRecruiter[]>();
  if (openingIds.length === 0) return grouped;

  const { rows } = await client.query<RecruiterRow>(
    `SELECT r.id, r.opening_id, r.recruiter_id,
            u.name AS recruiter_name, u.work_email AS recruiter_email,
            r.is_primary, r.assigned_by, r.assigned_at
       FROM om_opening_recruiters r
       LEFT JOIN users u ON u.id = r.recruiter_id
      WHERE r.tenant_id = $1 AND r.opening_id = ANY($2::uuid[])
      ORDER BY r.is_primary DESC, r.assigned_at ASC`,
    [client.tenantId, openingIds]
  );

  for (const row of rows) {
    const list = grouped.get(row.opening_id) ?? [];
    list.push(mapRecruiter(row));
    grouped.set(row.opening_id, list);
  }
  return grouped;
}

/**
 * Replace the recruiter set for an opening.
 *
 * The DELETE runs first so the `one primary per opening` partial unique index
 * can never trip on the intermediate state.
 */
export async function replaceRecruiters(
  client: TenantClient,
  openingId: string,
  recruiters: RecruiterData[],
  assignedBy: string
): Promise<void> {
  await client.query(
    `DELETE FROM om_opening_recruiters WHERE tenant_id = $1 AND opening_id = $2`,
    [client.tenantId, openingId]
  );
  if (recruiters.length === 0) return;

  // One multi-row INSERT via UNNEST — a single round trip regardless of size.
  await client.query(
    `INSERT INTO om_opening_recruiters
       (tenant_id, opening_id, recruiter_id, is_primary, assigned_by)
     SELECT $1, $2, x.recruiter_id, x.is_primary, $5
       FROM UNNEST($3::text[], $4::boolean[]) AS x(recruiter_id, is_primary)`,
    [
      client.tenantId,
      openingId,
      recruiters.map((r) => r.recruiterId),
      recruiters.map((r) => r.isPrimary),
      assignedBy,
    ]
  );
}

// ─── Hiring team ────────────────────────────────────────────────────────────

interface HiringTeamRow {
  id: string;
  opening_id: string;
  member_type: HiringTeamMemberType;
  member_id: string | null;
  member_name: string | null;
  member_email: string | null;
  created_at: Date;
}

function mapHiringTeamMember(row: HiringTeamRow): HiringTeamMember {
  return {
    id: row.id,
    openingId: row.opening_id,
    memberType: row.member_type,
    memberId: row.member_id,
    memberName: row.member_name,
    memberEmail: row.member_email,
    createdAt: row.created_at,
  };
}

export interface HiringTeamMemberData {
  memberType: HiringTeamMemberType;
  memberId: string | null;
  memberName: string | null;
  memberEmail: string | null;
}

/**
 * For internal members the stored name/email are ignored in favour of the live
 * values from `users`; external members fall back to what was stored.
 */
const HIRING_TEAM_SELECT = `
  SELECT t.id, t.opening_id, t.member_type, t.member_id,
         COALESCE(u.name, t.member_name) AS member_name,
         COALESCE(u.work_email, t.member_email) AS member_email,
         t.created_at
    FROM om_opening_hiring_team t
    LEFT JOIN users u ON u.id = t.member_id
`;

export async function findHiringTeam(
  client: TenantClient,
  openingId: string
): Promise<HiringTeamMember[]> {
  const { rows } = await client.query<HiringTeamRow>(
    `${HIRING_TEAM_SELECT}
      WHERE t.tenant_id = $1 AND t.opening_id = $2
      ORDER BY t.member_type ASC, t.created_at ASC`,
    [client.tenantId, openingId]
  );
  return rows.map(mapHiringTeamMember);
}

export async function replaceHiringTeam(
  client: TenantClient,
  openingId: string,
  members: HiringTeamMemberData[],
  createdBy: string
): Promise<void> {
  await client.query(
    `DELETE FROM om_opening_hiring_team WHERE tenant_id = $1 AND opening_id = $2`,
    [client.tenantId, openingId]
  );
  if (members.length === 0) return;

  await client.query(
    `INSERT INTO om_opening_hiring_team
       (tenant_id, opening_id, member_type, member_id, member_name, member_email, created_by)
     SELECT $1, $2, x.member_type, x.member_id, x.member_name, x.member_email, $7
       FROM UNNEST($3::text[], $4::text[], $5::text[], $6::text[])
              AS x(member_type, member_id, member_name, member_email)`,
    [
      client.tenantId,
      openingId,
      members.map((m) => m.memberType),
      members.map((m) => m.memberId),
      members.map((m) => m.memberName),
      members.map((m) => m.memberEmail),
      createdBy,
    ]
  );
}

// ─── Required documents ─────────────────────────────────────────────────────

interface DocumentRow {
  id: string;
  opening_id: string;
  document_name: string;
  is_mandatory: boolean;
  notes: string | null;
  created_at: Date;
}

function mapDocument(row: DocumentRow): RequiredDocument {
  return {
    id: row.id,
    openingId: row.opening_id,
    documentName: row.document_name,
    isMandatory: row.is_mandatory,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export interface RequiredDocumentData {
  documentName: string;
  isMandatory: boolean;
  notes: string | null;
}

export async function findDocuments(
  client: TenantClient,
  openingId: string
): Promise<RequiredDocument[]> {
  const { rows } = await client.query<DocumentRow>(
    `SELECT id, opening_id, document_name, is_mandatory, notes, created_at
       FROM om_opening_documents
      WHERE tenant_id = $1 AND opening_id = $2
      ORDER BY is_mandatory DESC, document_name ASC`,
    [client.tenantId, openingId]
  );
  return rows.map(mapDocument);
}

export async function replaceDocuments(
  client: TenantClient,
  openingId: string,
  documents: RequiredDocumentData[],
  createdBy: string
): Promise<void> {
  await client.query(
    `DELETE FROM om_opening_documents WHERE tenant_id = $1 AND opening_id = $2`,
    [client.tenantId, openingId]
  );
  if (documents.length === 0) return;

  await client.query(
    `INSERT INTO om_opening_documents
       (tenant_id, opening_id, document_name, is_mandatory, notes, created_by)
     SELECT $1, $2, x.document_name, x.is_mandatory, x.notes, $6
       FROM UNNEST($3::text[], $4::boolean[], $5::text[])
              AS x(document_name, is_mandatory, notes)`,
    [
      client.tenantId,
      openingId,
      documents.map((d) => d.documentName),
      documents.map((d) => d.isMandatory),
      documents.map((d) => d.notes),
      createdBy,
    ]
  );
}
