/**
 * Additive permission-catalogue sync.
 *
 * `seed-rbac.ts` is the full seed: it deletes stale permissions and does a FULL
 * REPLACE of every system role's permission set across every tenant. That is too
 * blunt to run just because the catalogue gained new entries — it would wipe any
 * hand-tuning done to the system roles.
 *
 * This script only ever adds or corrects:
 *   1. Creates permission rows for anything in ALL_PERMISSIONS missing from the DB.
 *   2. Fixes drift in resource/action/description on existing rows (e.g. bug.*
 *      rows still carrying resource='ticket' from an older seed, which is why
 *      Bug List showed up under Tickets instead of QA Space).
 *   3. Grants the newly created permissions to the system roles that are
 *      supposed to hold them, per ADMIN/USER defaults. Never revokes anything,
 *      never touches custom roles.
 *
 * Runs read-only by default. Pass --apply to write.
 *
 *   npx tsx src/scripts/sync-permissions.ts            # dry run
 *   npx tsx src/scripts/sync-permissions.ts --apply    # write
 */

import { prisma } from '../config/database';
import { ALL_PERMISSIONS, SystemRoles } from '../types/permissions';
import { ADMIN_DEFAULT_PERMISSIONS, USER_DEFAULT_PERMISSIONS } from '../modules/rbac/rbac.service';

const APPLY = process.argv.includes('--apply');

/** Same derivation the seed uses: bug.* is a sub-resource of qa. */
function resourceAndAction(permName: string): { resource: string; action: string } {
  const [head, ...actionParts] = permName.split('.');
  const resource = head === 'bug' ? 'qa' : head;
  return { resource, action: actionParts.join('.') };
}

const ROLE_TARGETS: Record<string, readonly string[]> = {
  [SystemRoles.SUPER_ADMIN]: ALL_PERMISSIONS,
  [SystemRoles.ADMIN]: ADMIN_DEFAULT_PERMISSIONS,
  [SystemRoles.USER]: USER_DEFAULT_PERMISSIONS,
};

async function main() {
  console.log(APPLY ? '🔧 Syncing permissions (WRITE)\n' : '🔍 Syncing permissions (dry run — pass --apply to write)\n');

  const existing = await prisma.permission.findMany();
  const byName = new Map(existing.map((p) => [p.name, p]));

  const toCreate: string[] = [];
  const toFix: { name: string; from: string; to: string }[] = [];

  for (const name of ALL_PERMISSIONS) {
    const { resource, action } = resourceAndAction(name);
    const row = byName.get(name);
    if (!row) {
      toCreate.push(name);
    } else if (row.resource !== resource || row.action !== action) {
      toFix.push({ name, from: `${row.resource}/${row.action}`, to: `${resource}/${action}` });
    }
  }

  console.log(`Catalogue: ${ALL_PERMISSIONS.length} defined, ${existing.length} in DB`);
  console.log(`  missing        : ${toCreate.length}`);
  console.log(`  resource drift : ${toFix.length}\n`);

  if (toCreate.length) {
    console.log('Will create:');
    toCreate.forEach((n) => console.log(`  + ${n}`));
    console.log('');
  }
  if (toFix.length) {
    console.log('Will re-home:');
    toFix.forEach((f) => console.log(`  ~ ${f.name}: ${f.from} → ${f.to}`));
    console.log('');
  }

  if (!APPLY) {
    // Still report which roles would gain what, so the effect is visible up front.
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    console.log(`Would grant the new permissions to system roles across ${tenants.length} tenant(s).`);
    console.log('\nNothing written. Re-run with --apply to commit.');
    await prisma.$disconnect();
    return;
  }

  // ── 1. Catalogue ──────────────────────────────────────────────────────────
  for (const name of ALL_PERMISSIONS) {
    const { resource, action } = resourceAndAction(name);
    await prisma.permission.upsert({
      where: { name },
      update: { resource, action },
      create: { name, resource, action },
    });
  }
  console.log(`✅ Catalogue synced (${toCreate.length} created, ${toFix.length} re-homed)`);

  if (!toCreate.length) {
    console.log('No new permissions — role grants unchanged.');
    await prisma.$disconnect();
    return;
  }

  // ── 2. Grant only the NEW permissions to the system roles that want them ──
  const refreshed = await prisma.permission.findMany({ where: { name: { in: toCreate } } });
  const newIdByName = new Map(refreshed.map((p) => [p.name, p.id]));

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    for (const slug of [SystemRoles.SUPER_ADMIN, SystemRoles.ADMIN, SystemRoles.USER]) {
      const role = await prisma.role.findUnique({
        where: { tenantId_slug: { tenantId: tenant.id, slug } },
      });
      if (!role) continue;

      const wanted = ROLE_TARGETS[slug];
      const grantIds = toCreate
        .filter((n) => wanted.includes(n as any))
        .map((n) => newIdByName.get(n))
        .filter((id): id is string => !!id);

      if (!grantIds.length) continue;

      await prisma.rolePermission.createMany({
        data: grantIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
      console.log(`   ${tenant.name} · ${slug}: +${grantIds.length}`);
    }
  }

  console.log('\n✅ Done. Users must re-login (or wait for the RBAC cache TTL) to pick up new permissions.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
