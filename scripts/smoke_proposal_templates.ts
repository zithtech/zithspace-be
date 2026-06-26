import pool from '../src/config/dbpool';
import { ProposalTemplateModel } from '../src/models/ProposalTemplate.model';

/**
 * Smoke test for the proposal_templates module.
 *
 * Exercises the full model lifecycle against the real DB:
 *   create → findAll → findById → update → setArchived → duplicate → remove
 * and asserts the frontend-facing (camelCase) row shape.
 *
 * Uses a disposable tenant id and cleans up after itself.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/smoke_proposal_templates.ts
 */
const TENANT = '__smoke_tenant_proposal_templates__';

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

async function run() {
  console.log('smoke: proposal_templates\n');

  // Clean any leftovers from a previous failed run.
  await pool.query(`DELETE FROM proposal_templates WHERE tenant_id = $1;`, [TENANT]);

  // ── create ────────────────────────────────────────────────────────────
  const created = await ProposalTemplateModel.create({
    tenant_id: TENANT,
    name: 'Smoke Template',
    description: 'created by smoke test',
    blocks: [{ id: 'b1', type: 'cover', data: { title: 'Hello' } }, { id: 'b2', type: 'text', data: { heading: 'Intro' } }],
    section_ids: ['sec-1', 'sec-2'],
    theme_id: 'azure',
    font_id: 'inter',
    created_by: 'smoke-runner',
  });
  console.log('create →');
  check('returns an id', !!created?.id);
  check('name persisted', created.name === 'Smoke Template');
  check('blocks round-trip as array', Array.isArray(created.blocks) && created.blocks.length === 2);
  check('block content preserved', created.blocks?.[0]?.data?.title === 'Hello');
  check('sectionIds is camelCase array', Array.isArray(created.sectionIds) && created.sectionIds.length === 2);
  check('themeId is camelCase', created.themeId === 'azure');
  check('fontId is camelCase', created.fontId === 'inter');
  check('system flag is camelCase boolean', created.system === false);
  check('archived defaults false', created.archived === false);
  check('createdAt present', !!created.createdAt);

  const id = created.id;

  // ── findAll ───────────────────────────────────────────────────────────
  const all = await ProposalTemplateModel.findAll(TENANT);
  console.log('findAll →');
  check('lists the created template', all.some((t) => t.id === id));

  // ── findById ──────────────────────────────────────────────────────────
  const found = await ProposalTemplateModel.findById(id, TENANT);
  console.log('findById →');
  check('finds by id', found?.id === id);
  check('tenant isolation: wrong tenant returns null', (await ProposalTemplateModel.findById(id, 'other-tenant')) === null);

  // ── update ────────────────────────────────────────────────────────────
  const updated = await ProposalTemplateModel.update(id, TENANT, {
    name: 'Smoke Template (edited)',
    blocks: [{ id: 'b1', type: 'cover', data: { title: 'Hi' } }],
    section_ids: ['sec-1', 'sec-2', 'sec-3'],
    theme_id: 'emerald',
  });
  console.log('update →');
  check('name updated', updated?.name === 'Smoke Template (edited)');
  check('blocks updated', updated?.blocks?.length === 1 && updated.blocks[0].data.title === 'Hi');
  check('sectionIds updated', updated?.sectionIds?.length === 3);
  check('themeId updated', updated?.themeId === 'emerald');
  check('fontId untouched', updated?.fontId === 'inter');

  // ── setArchived ───────────────────────────────────────────────────────
  const archived = await ProposalTemplateModel.setArchived(id, TENANT, true);
  console.log('setArchived →');
  check('archived = true', archived?.archived === true);
  const activeOnly = await ProposalTemplateModel.findAll(TENANT, false);
  check('hidden from non-archived listing', !activeOnly.some((t) => t.id === id));
  await ProposalTemplateModel.setArchived(id, TENANT, false);

  // ── duplicate ─────────────────────────────────────────────────────────
  const copy = await ProposalTemplateModel.duplicate(id, TENANT, 'smoke-runner');
  console.log('duplicate →');
  check('copy has a new id', !!copy?.id && copy.id !== id);
  check('copy name suffixed', copy?.name?.endsWith('(Copy)'));
  check('copy carries section_ids', copy?.sectionIds?.length === 3);

  // ── remove ────────────────────────────────────────────────────────────
  const removedId = await ProposalTemplateModel.remove(id, TENANT);
  const removedCopyId = copy ? await ProposalTemplateModel.remove(copy.id, TENANT) : null;
  console.log('remove →');
  check('remove returns deleted id', removedId === id);
  check('copy removed', removedCopyId === copy?.id);
  check('gone after delete', (await ProposalTemplateModel.findById(id, TENANT)) === null);

  // ── summary ───────────────────────────────────────────────────────────
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
}

run()
  .catch((err) => {
    console.error('💥 smoke test threw:', err);
    failed++;
  })
  .finally(async () => {
    // Safety-net cleanup, then exit non-zero if anything failed.
    await pool.query(`DELETE FROM proposal_templates WHERE tenant_id = $1;`, [TENANT]).catch(() => {});
    await pool.end().catch(() => {});
    process.exit(failed === 0 ? 0 : 1);
  });
