import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      tenantId: true
    },
    take: 20
  });
  console.log('Projects found:', JSON.stringify(projects, null, 2));
  
  const distinctStatuses = await prisma.project.findMany({
    select: { status: true },
    distinct: ['status']
  });
  console.log('Distinct statuses:', JSON.stringify(distinctStatuses, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
