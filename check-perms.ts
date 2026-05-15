import { prisma } from './src/config/database';

async function check() {
  const perms = await prisma.permission.findMany({
    where: { resource: 'pipeline' }
  });
  console.log('Pipeline permissions in DB:', perms.length);
  console.log(JSON.stringify(perms, null, 2));
  process.exit(0);
}

check();
