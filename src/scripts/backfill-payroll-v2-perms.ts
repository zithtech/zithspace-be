// src/scripts/backfill-payroll-v2-perms.ts
//
// One-time backfill: the Payroll 2.0 RBAC moved from the old flat payroll.* keys
// to 12 page-based permission groups. This grants every existing role the NEW
// page permissions that correspond to the OLD payroll perms it already holds, so
// nobody loses payroll access on deploy. Idempotent — safe to run repeatedly.
//
// Run:  npx ts-node -r tsconfig-paths/register src/scripts/backfill-payroll-v2-perms.ts

import dotenv from 'dotenv';
dotenv.config();
import { prisma } from '@/config/database';

const NEW_PERMS = [
  'payroll.settings.read', 'payroll.settings.update',
  'payroll.components.read', 'payroll.components.create', 'payroll.components.update', 'payroll.components.delete',
  'payroll.structures.read', 'payroll.structures.create', 'payroll.structures.update', 'payroll.structures.delete',
  'payroll.schedules.read', 'payroll.schedules.create', 'payroll.schedules.update', 'payroll.schedules.delete',
  'payroll.statutory.read', 'payroll.statutory.update',
  'payroll.state_statutory.read', 'payroll.state_statutory.create', 'payroll.state_statutory.update', 'payroll.state_statutory.delete',
  'payroll.workflows.read', 'payroll.workflows.create', 'payroll.workflows.update', 'payroll.workflows.delete',
  'payroll.payslip_bank.read', 'payroll.payslip_bank.update',
  'payroll.employees.read', 'payroll.employees.create', 'payroll.employees.update', 'payroll.employees.delete',
  'payroll.run.read', 'payroll.run.create', 'payroll.run.process', 'payroll.run.approve', 'payroll.run.finalize', 'payroll.run.pay', 'payroll.run.payslips', 'payroll.run.delete',
  'payroll.reports.read', 'payroll.reports.export',
  'payroll.my_payslips.read',
];

// OLD flat perm → NEW page perms it should now imply.
const OLD_TO_NEW: Record<string, string[]> = {
  'payroll.setting.read': ['payroll.settings.read', 'payroll.components.read', 'payroll.schedules.read', 'payroll.statutory.read', 'payroll.state_statutory.read', 'payroll.workflows.read', 'payroll.payslip_bank.read'],
  'payroll.setting.create': ['payroll.components.create', 'payroll.schedules.create', 'payroll.state_statutory.create', 'payroll.workflows.create'],
  'payroll.setting.update': ['payroll.settings.update', 'payroll.components.update', 'payroll.schedules.update', 'payroll.statutory.update', 'payroll.state_statutory.update', 'payroll.workflows.update', 'payroll.payslip_bank.update'],
  'payroll.setting.delete': ['payroll.components.delete', 'payroll.schedules.delete', 'payroll.state_statutory.delete', 'payroll.workflows.delete'],
  'payroll.structure.read': ['payroll.structures.read'],
  'payroll.structure.create': ['payroll.structures.create'],
  'payroll.structure.update': ['payroll.structures.update'],
  'payroll.structure.delete': ['payroll.structures.delete'],
  'payroll.read': ['payroll.employees.read', 'payroll.run.read', 'payroll.reports.read', 'payroll.my_payslips.read'],
  'payroll.create': ['payroll.employees.create'],
  'payroll.update': ['payroll.employees.update'],
  'payroll.delete': ['payroll.employees.delete', 'payroll.run.delete'],
  'payroll.process': ['payroll.run.create', 'payroll.run.process', 'payroll.run.finalize'],
  'payroll.approve': ['payroll.run.approve'],
  'payroll.pay': ['payroll.run.pay'],
  'payroll.payslip.read': ['payroll.run.read'],
  'payroll.payslip.create': ['payroll.run.payslips'],
  'payroll.manage': NEW_PERMS,
};

async function main() {
  // 1) Ensure every new permission row exists.
  for (const name of NEW_PERMS) {
    const [resource, ...actionParts] = name.split('.');
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, resource, action: actionParts.join('.') },
    });
  }
  const idByName = new Map<string, string>(
    (await prisma.permission.findMany({ where: { name: { in: [...NEW_PERMS, ...Object.keys(OLD_TO_NEW)] } }, select: { id: true, name: true } }))
      .map((p) => [p.name, p.id])
  );

  // 2) For each role, grant the new perms implied by its old payroll perms.
  const roles = await prisma.role.findMany({ select: { id: true, name: true, rolePermissions: { select: { permission: { select: { name: true } } } } } });
  let grantedTotal = 0, rolesTouched = 0;
  for (const role of roles) {
    const held = new Set(role.rolePermissions.map((rp) => rp.permission.name));
    const toGrant = new Set<string>();
    for (const [oldName, news] of Object.entries(OLD_TO_NEW)) {
      if (held.has(oldName)) news.forEach((n) => { if (!held.has(n)) toGrant.add(n); });
    }
    if (toGrant.size === 0) continue;
    const rows = [...toGrant].map((n) => ({ roleId: role.id, permissionId: idByName.get(n)! })).filter((r) => r.permissionId);
    const res = await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
    grantedTotal += res.count; rolesTouched++;
    console.log(`  role "${role.name}": +${res.count} payroll-v2 perms`);
  }
  console.log(`\n[backfill] done — ${grantedTotal} grants across ${rolesTouched} role(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect().finally(() => process.exit(1)); });
