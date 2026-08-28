// src/scripts/provisionProduct.ts
//
// Grant or revoke a product for a tenant. This is the sales-led provisioning
// path — until self-serve signup exists, this script IS the checkout flow.
//
//   npm run provision -- acme testiez
//   npm run provision -- acme zukvo --expires 2027-01-31       (trial)
//   npm run provision -- acme testiez --revoke
//   npm run provision -- acme --list
//
// UPGRADING a Testiez customer to the full suite is just:
//   npm run provision -- acme zukvo
// No migration, no data move. Both products already read the same tables, so
// their entire QA history is there the moment the row lands.

import { prisma } from '@/config/database';
import {
  ALL_PRODUCTS,
  Product,
  getProducts,
  grantProduct,
  revokeProduct,
} from '@/modules/entitlements/entitlements.service';
import { closeEntitlementsPool } from '@/modules/entitlements/db/pool';

interface Args {
  subdomain: string;
  product?: Product;
  revoke: boolean;
  list: boolean;
  expiresAt: Date | null;
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = argv.filter((a) => a.startsWith('--'));

  const subdomain = positional[0];
  if (!subdomain) {
    throw new Error('Usage: provisionProduct <subdomain> [product] [--revoke|--list] [--expires YYYY-MM-DD]');
  }

  const product = positional[1] as Product | undefined;
  if (product && !ALL_PRODUCTS.includes(product)) {
    throw new Error(`Unknown product "${product}". Valid: ${ALL_PRODUCTS.join(', ')}`);
  }

  const expiresFlag = argv[argv.indexOf('--expires') + 1];
  const expiresAt = flags.includes('--expires') ? new Date(expiresFlag) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new Error(`--expires needs a parseable date, got "${expiresFlag}"`);
  }

  return {
    subdomain,
    product,
    revoke: flags.includes('--revoke'),
    list: flags.includes('--list'),
    expiresAt,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: args.subdomain.toLowerCase() },
    select: { id: true, name: true, subdomain: true, isActive: true },
  });

  if (!tenant) {
    throw new Error(`No tenant with subdomain "${args.subdomain}"`);
  }
  if (!tenant.isActive) {
    console.warn(`[provision] WARNING: tenant "${tenant.subdomain}" is inactive — the grant will apply but nobody can log in.`);
  }

  const before = await getProducts(tenant.id);
  console.log(`[provision] ${tenant.name} (${tenant.subdomain}) currently holds: ${before.join(', ') || '(none)'}`);

  if (args.list) return;

  if (!args.product) {
    throw new Error('A product is required unless --list is passed');
  }

  if (args.revoke) {
    await revokeProduct(tenant.id, args.product);
    console.log(`[provision] revoked "${args.product}"`);
  } else {
    await grantProduct(tenant.id, args.product, {
      source: 'sales',
      expiresAt: args.expiresAt,
    });
    const expiry = args.expiresAt ? ` until ${args.expiresAt.toISOString().slice(0, 10)}` : ' (perpetual)';
    console.log(`[provision] granted "${args.product}"${expiry}`);
  }

  const after = await getProducts(tenant.id);
  console.log(`[provision] now holds: ${after.join(', ') || '(none)'}`);
}

if (require.main === module) {
  main()
    .then(async () => {
      await closeEntitlementsPool();
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(`[provision] ${err instanceof Error ? err.message : err}`);
      await closeEntitlementsPool().catch(() => {});
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    });
}
