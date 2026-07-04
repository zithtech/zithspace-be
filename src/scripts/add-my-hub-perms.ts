/**
 * Additive, idempotent migration for the "My Hub" permission module.
 *
 * SAFE FOR PRODUCTION. Unlike `seed-rbac.ts`, this script ONLY:
 *   1. Upserts the 7 my_hub.* Permission rows.
 *   2. Grants those permissions to EVERY role (system + custom), add-only.
 *
 * It NEVER deletes stale permissions and NEVER removes perms from any role, so
 * it cannot revoke anything or revert customized roles. Re-running is a no-op.
 *
 * Run:
 *   1. Point DATABASE_URL at the target DB (dev, then prod).
 *   2. npm run db:add-my-hub
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '@/config/database';
import { PERMISSIONS_BY_RESOURCE } from '@/types/permissions';

const MY_HUB_DESCRIPTIONS: Record<string, string> = {
  'my_hub.overview.read': 'Access the My Hub overview page',
  'my_hub.apply_leave.read': 'Apply for leave from My Hub',
  'my_hub.attendance.read': 'View own attendance / clock in-out from My Hub',
  'my_hub.escalation.read': 'View escalations targeting me from My Hub',
  'my_hub.performance.read': 'View own performance reports from My Hub',
  'my_hub.payslips.read': 'View own payslips from My Hub',
  'my_hub.profile.read': 'View own profile from My Hub',
};

async function main() {
  const target = process.env.DATABASE_URL?.replace(/:\/\/[^@]*@/, '://***@') ?? '(unset)';
  console.log(`🧭 Adding My Hub permissions to: ${target}\n`);

  const myHubPerms = PERMISSIONS_BY_RESOURCE.my_hub;

  // ── 1. Upsert the 7 my_hub permission rows ────────────────────────────────
  console.log('1️⃣  Upserting My Hub permissions...');
  for (const name of myHubPerms) {
    const [resource, ...actionParts] = name.split('.');
    const action = actionParts.join('.');
    await prisma.permission.upsert({
      where: { name },
      update: { resource, action, description: MY_HUB_DESCRIPTIONS[name] },
      create: { name, resource, action, description: MY_HUB_DESCRIPTIONS[name] },
    });
    console.log(`   ✅ ${name}`);
  }

  // ── 2. Grant them to EVERY role (add-only) ────────────────────────────────
  console.log('\n2️⃣  Granting to all roles...');
  const permRecords = await prisma.permission.findMany({
    where: { name: { in: myHubPerms } },
    select: { id: true },
  });
  const myHubPermIds = permRecords.map((p) => p.id);

  const roles = await prisma.role.findMany({ select: { id: true, name: true, tenantId: true } });
  console.log(`   Found ${roles.length} role(s)`);

  let totalGrants = 0;
  for (const role of roles) {
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id, permissionId: { in: myHubPermIds } },
      select: { permissionId: true },
    });
    const have = new Set(existing.map((e) => e.permissionId));
    const toAdd = myHubPermIds.filter((id) => !have.has(id));
    if (toAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
      totalGrants += toAdd.length;
      console.log(`   🔑 ${role.name} (${role.tenantId}): +${toAdd.length}`);
    }
  }

  console.log(`\n✅ Done. ${myHubPerms.length} permissions ensured, ${totalGrants} new grant(s) added.`);
}

main()
  .catch((e) => {
    console.error('❌ add-my-hub-perms failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
