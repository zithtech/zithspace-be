const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const columnName = 'implementation_partner_id';
  console.log(`Searching for column: ${columnName}`);

  const results = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE column_name ILIKE '%${columnName}%'
  `);

  let output = `Results for ${columnName}:\n`;
  for (const r of results) {
    output += `${r.table_name}.${r.column_name}\n`;
  }

  const results2 = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_name ILIKE '%recruitment_client%'
    ORDER BY table_name, column_name
  `);

  output += `\nAll columns for recruitment_client tables:\n`;
  for (const r of results2) {
    output += `${r.table_name}.${r.column_name}\n`;
  }

  fs.writeFileSync('db_search_results.txt', output, 'utf8');
  console.log('Results written to db_search_results.txt');

  await prisma.$disconnect();
}

main().catch(console.error);
