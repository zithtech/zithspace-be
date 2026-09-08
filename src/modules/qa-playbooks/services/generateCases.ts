// src/modules/qa-playbooks/services/generateCases.ts
//
// Turns selected playbook recommendations into real test cases.
//
// WHICH POOL, AND WHY:
//   Reads of playbook content go through the module's own pool. The WRITE goes
//   through the platform's shared `pool` and into qa_parent_test_cases /
//   qa_test_cases — the same tables the Cases page writes. A generated case is
//   an ordinary test case from that moment on: editable, runnable, deletable,
//   with no playbook dependency and no second source of truth.
//
// The mapping below is deliberately conservative. `test_type`, `priority` and
// `severity` are constrained to the values the existing Cases dropdowns offer,
// so a generated case opens in the editor with every field already valid. The
// playbook's own richer category (Security, Accessibility, …) is preserved in
// the case description rather than smuggled into a field the UI cannot render.

import pool from '@/config/dbpool';
import { PlaybookError } from '../http';
import { CATEGORY_LABELS, LEVEL_LABELS } from '../constants';
import type { PlaybookItemRow } from '../repositories/playbook.repo';

/** Playbook category → the test_type values the Cases editor offers. */
const TEST_TYPE_BY_CATEGORY: Record<string, string> = {
  ui: 'UI',
  input_validation: 'Functional',
  functional: 'Functional',
  boundary: 'Functional',
  account_state: 'Functional',
  api: 'API',
  auth: 'Functional',
  session: 'Functional',
  security: 'Functional',
  performance: 'Functional',
  browser_device: 'UI',
  accessibility: 'UI',
};

const PRIORITY_BY_RISK: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const SEVERITY_BY_RISK: Record<string, string> = {
  critical: 'Critical',
  high: 'Major',
  medium: 'Minor',
  low: 'Cosmetic',
};

function formatExamples(examples: unknown[]): string[] {
  return examples.map((ex) => {
    if (ex && typeof ex === 'object' && 'input' in (ex as any)) {
      const e = ex as { input: string; verdict: string };
      return `${e.input} → ${e.verdict}`;
    }
    return String(ex);
  });
}

/**
 * The case body. Steps come from the item where it has them; otherwise the
 * "what to test" line becomes the single step, and the examples become the
 * variations to run — which is what the recommendation was already telling a
 * tester to do.
 */
function stepsFor(item: PlaybookItemRow): string {
  if (item.steps?.length) {
    return item.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }
  const examples = formatExamples(item.examples ?? []);
  const lines = [`1. ${item.whatToTest ?? item.title}`];
  if (examples.length > 0) {
    lines.push('', 'Run with each of:');
    examples.forEach((ex) => lines.push(`- ${ex}`));
  }
  return lines.join('\n');
}

function descriptionFor(item: PlaybookItemRow, playbookName: string): string {
  const parts: string[] = [];
  if (item.whatToTest) parts.push(item.whatToTest);
  if (item.whyItMatters) parts.push(`\nWhy it matters: ${item.whyItMatters}`);

  /* Edge cases ride along in the description rather than becoming cases of
     their own: they are variants of THIS check, and one generated case per
     edge case would bury the run in near-duplicates. */
  const edges = (item.edgeCases ?? []).map((e) => String(e).trim()).filter(Boolean);
  if (edges.length > 0) {
    parts.push(`\nEdge cases to cover:\n${edges.map((e) => `- ${e}`).join('\n')}`);
  }

  const references = (item.references ?? [])
    .map((ref) => {
      const name = String(ref?.name ?? '').trim();
      if (!name) return '';
      const url = typeof ref?.url === 'string' && ref.url.trim() ? ` — ${ref.url.trim()}` : '';
      return `- ${name}${url}`;
    })
    .filter(Boolean);
  if (references.length > 0) {
    parts.push(`\nReference:\n${references.join('\n')}`);
  }
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;
  const tags = [categoryLabel, LEVEL_LABELS[item.level] ?? item.level];
  // A section named after its own category ("UI" inside "UI") would read as
  // "UI · UI · Junior", so it is only prepended when it adds something.
  if (item.sectionTitle && item.sectionTitle !== categoryLabel) {
    tags.unshift(item.sectionTitle);
  }
  parts.push(`\nFrom the ${playbookName} playbook — ${tags.join(' · ')}`);
  return parts.join('\n');
}

/**
 * The state the tester has to set up, and whether the case applies at all.
 *
 * The recommendation's own preconditions lead — that is what the field is for,
 * and a generated case that drops them sends someone to run a check from the
 * wrong starting state. The applies-when note follows as a caveat.
 */
function preconditionsFor(item: PlaybookItemRow): string {
  const parts: string[] = [];

  const preconditions = (item.preconditions ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (preconditions.length === 1) parts.push(preconditions[0]);
  else if (preconditions.length > 1) parts.push(preconditions.map((p) => `- ${p}`).join('\n'));

  const conditions = Object.entries(item.appliesWhen ?? {})
    .map(([key, values]) => `${key}: ${(values ?? []).join(', ')}`)
    .filter(Boolean);
  if (conditions.length > 0) {
    parts.push(`Applies only when the product uses — ${conditions.join('; ')}`);
  }

  return parts.join('\n\n');
}

export interface GenerateInput {
  tenantId: string;
  userId: string | null;
  playbookName: string;
  parentTitle: string;
  moduleId: string | null;
  projectId: string | null;
  feature: string | null;
  status: string;
  items: PlaybookItemRow[];
}

export interface GenerateResult {
  parentId: string;
  parentTitle: string;
  createdCount: number;
  caseIds: string[];
}

/**
 * Creates one parent scenario and one child case per selected recommendation,
 * in a single transaction — a partially generated scenario would be worse than
 * a failed one, because nobody would know which half is missing.
 */
export async function generateCasesFromItems(input: GenerateInput): Promise<GenerateResult> {
  if (input.items.length === 0) {
    throw new PlaybookError('Select at least one recommendation to generate from', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: parentRows } = await client.query(
      `INSERT INTO qa_parent_test_cases
         (tenant_id, title, module_id, feature, automation, owner, status, project_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'Manual', $5, $6, $7, $5, $5)
       RETURNING id, title`,
      [
        input.tenantId,
        input.parentTitle,
        input.moduleId,
        input.feature,
        input.userId,
        input.status,
        input.projectId,
      ]
    );
    const parent = parentRows[0];

    const caseIds: string[] = [];
    for (let i = 0; i < input.items.length; i += 1) {
      const item = input.items[i];
      // Same TC-001… convention as generateTestCaseId() in testCaseController,
      // derived from the index rather than by calling it: that helper counts
      // committed rows on a separate connection, so inside this transaction it
      // would return TC-001 for every case in the batch.
      const testCaseId = `TC-${String(i + 1).padStart(3, '0')}`;

      const { rows } = await client.query(
        `INSERT INTO qa_test_cases
           (tenant_id, parent_test_case_id, test_case_id, name, module_id, feature, description,
            preconditions, steps_to_reproduce, expected_result, priority, severity, test_type,
            automation, status, owner, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Manual', $14, $15, $15)
         RETURNING id`,
        [
          input.tenantId,
          parent.id,
          testCaseId,
          item.title,
          input.moduleId,
          input.feature,
          descriptionFor(item, input.playbookName),
          preconditionsFor(item),
          stepsFor(item),
          item.expected ?? '',
          PRIORITY_BY_RISK[item.risk] ?? 'Medium',
          SEVERITY_BY_RISK[item.risk] ?? 'Minor',
          TEST_TYPE_BY_CATEGORY[item.category] ?? 'Functional',
          input.status,
          input.userId,
        ]
      );
      caseIds.push(rows[0].id);
    }

    await client.query('COMMIT');
    return {
      parentId: parent.id,
      parentTitle: parent.title,
      createdCount: caseIds.length,
      caseIds,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
