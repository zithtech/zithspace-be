import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Adding tenant_id to bucket_members...');
    await prisma.$executeRawUnsafe('ALTER TABLE bucket_members ADD COLUMN IF NOT EXISTS tenant_id TEXT;');
    console.log('Successfully added tenant_id to bucket_members.');
    
    console.log('Adding tenant_id to escalation_priorities...');
    await prisma.$executeRawUnsafe('ALTER TABLE escalation_priorities ADD COLUMN IF NOT EXISTS tenant_id TEXT;');
    await prisma.$executeRawUnsafe('ALTER TABLE escalation_priorities ADD COLUMN IF NOT EXISTS name TEXT;');
    await prisma.$executeRawUnsafe('ALTER TABLE escalation_priorities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();');
    await prisma.$executeRawUnsafe('ALTER TABLE escalation_priorities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();');
    console.log('Successfully updated escalation_priorities.');
  } catch (error) {
    console.error('Error executing raw SQL:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
