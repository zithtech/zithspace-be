const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = [
    'recruitment_client_basic_information',
    'recruitment_client_business_details',
    'recruitment_client_hiring_preference',
    'recruitment_client_contact',
    'recruitment_client_relationship'
  ];

  console.log('--- Database Column Inspection ---');

  for (const table of tables) {
    try {
      const columns = await prisma.$queryRawUnsafe(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
        ORDER BY column_name
      `);
      
      if (columns.length === 0) {
        console.log(`Table [${table}] not found or has no columns.`);
      } else {
        const names = columns.map(c => c.column_name).join(', ');
        console.log(`Table [${table}]: ${names}`);
      }
    } catch (err) {
      console.error(`Error inspecting table [${table}]:`, err.message);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
