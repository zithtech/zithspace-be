import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    console.log('Testing RecruitmentClient fetch...');
    const tenantId = '7929497e-d4c4-42f6-9f05-4927513b10b0'; // Assuming this is a valid tenant ID from common data or I can try to find one.
    
    // First, just try to find one tenant to get its ID if we don't have one
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.error('No tenants found');
      return;
    }
    const tid = tenant.id;
    console.log('Using tenant ID:', tid);

    try {
    const tables = [
        'recruitment_client_basic_information',
        'recruitment_client_business_details',
        'recruitment_client_hiring_preference',
        'recruitment_client_contact',
        'recruitment_client_relationship'
    ];

    for (const table of tables) {
        try {
            console.log(`Checking columns for ${table}...`);
            const columns: any[] = await prisma.$queryRawUnsafe(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '${table}'
            `);
            console.log(`Columns in ${table}:`, columns.map(c => c.column_name).join(', '));
        } catch (err) {
            console.error(`Failed to query columns for ${table}:`, err);
        }
    }

    try {
        const clientsBasic = await prisma.recruitmentClientBasicInformation.findMany({
            where: { tenantId: tid },
            take: 1
        });
        console.log('Successfully fetched clients (basic only):', clientsBasic.length);
    } catch (err) {
        console.error('Failed to fetch clients (basic only):', err);
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
