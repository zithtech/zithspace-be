/**
 * Provision (or rotate) the Chrome Extension install key for a tenant.
 *
 * The key is stored in tenant.settings.extensionInstallKey (JSONB) — no schema
 * migration required. Distribute the printed key to that tenant's users; they
 * enter it on the extension's activation screen to bind the install.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/set-install-key.ts <subdomain> [key]
 *
 *   <subdomain>  required — the tenant's subdomain (e.g. "zithmi")
 *   [key]        optional — a specific key; if omitted a random one is generated
 *
 * SAFE: only reads the target tenant and writes its settings JSON. Idempotent
 * per key. To revoke, run again with a new key (old key stops working).
 */

import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import { prisma } from '@/config/database';

async function main() {
  const subdomain = process.argv[2];
  const providedKey = process.argv[3];

  if (!subdomain) {
    console.error('Usage: set-install-key.ts <subdomain> [key]');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase() },
    select: { id: true, name: true, subdomain: true, settings: true },
  });

  if (!tenant) {
    console.error(`No tenant found with subdomain "${subdomain}".`);
    process.exit(1);
  }

  // Format: zk_<slug>_<random> — readable prefix, high-entropy tail.
  const key = providedKey || `zk_${tenant.subdomain}_${crypto.randomBytes(18).toString('hex')}`;

  const currentSettings =
    tenant.settings && typeof tenant.settings === 'object' ? (tenant.settings as Record<string, unknown>) : {};

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      settings: { ...currentSettings, extensionInstallKey: key },
    },
  });

  console.log('Install key set for tenant:');
  console.log(`  workspace : ${tenant.name} (${tenant.subdomain})`);
  console.log(`  tenantId  : ${tenant.id}`);
  console.log(`  key       : ${key}`);
  console.log('\nGive this key to the tenant\'s users for extension activation.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
