const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = [
    'recruitment_client_business_details',
    'recruitment_client_hiring_preference',
    'recruitment_client_contact'
  ];

  for (const table of tables) {
    console.log(`Table: ${table}`);
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${table}'
    `);
    
    for (const c of columns) {
      console.log(`Column: ${table}.${c.column_name}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
