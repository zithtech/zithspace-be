import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectColumns() {
  const tables = [
    'recruitment_client_basic_information',
    'recruitment_client_business_detailes',
    'recruitment_client_hirring_preference',
    'recruitment_client_relationship'
  ];

  console.log('--- Inspecting Database Columns ---');
  for (const table of tables) {
    try {
      const result: any[] = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
      `);
      console.log(`\nTable: "${table}"`);
      result.forEach(col => console.log(`  - ${col.column_name} (${col.data_type})`));
    } catch (error: any) {
      console.log(`❌ Error inspecting table "${table}":`, error.message);
    }
  }
  await prisma.$disconnect();
}

inspectColumns();
