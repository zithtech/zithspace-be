import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  try {
    console.log('--- Verifying Recruitment Client Data ---');
    
    // 1. Check if model exists in Prisma
    const clients = await prisma.recruitmentClientBasicInformation.findMany({
      take: 5,
      include: {
        businessDetails: true,
        hiringPreferences: true,
        contacts: true,
        clientRelationships: true
      }
    });
    
    console.log(`Fetched ${clients.length} clients successfully.`);
    if (clients.length > 0) {
        console.log('Sample client:', JSON.stringify(clients[0], null, 2));
    }
    
    console.log('--- Verification Complete ---');
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
