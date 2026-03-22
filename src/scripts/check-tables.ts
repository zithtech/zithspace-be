import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTables() {
  const tables = [
    'recruitment_client_basic_information',
    'recruitment_client_business_detailes',
    'recruitment_client_hirring_preference',
    'recruitment_client_relationship',
    'recruitment_client_contacts',
    'recruitment_client_documents'
  ];

  console.log('--- Checking Database Tables ---');
  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
      console.log(`✅ Table "${table}" exists.`);
    } catch (error: any) {
      if (error.code === 'P2021') {
        console.log(`❌ Table "${table}" DOES NOT EXIST.`);
      } else {
        console.log(`❓ Error checking table "${table}":`, error.message);
      }
    }
  }
  await prisma.$disconnect();
}

checkTables();
