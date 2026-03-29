import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixTables() {
  console.log('--- Creating Missing Recruitment Client Tables ---');

  try {
    // 1. Create recruitment_client_contacts
    console.log('Creating "recruitment_client_contacts" table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "recruitment_client_contacts" (
        "id" TEXT NOT NULL,
        "recruitment_client_id" TEXT NOT NULL,
        "contact_name" TEXT NOT NULL,
        "designation" TEXT,
        "email" TEXT,
        "phone" TEXT,
        "linkedin_url" TEXT,
        "created_by_id" TEXT NOT NULL,
        "updated_by_id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "recruitment_client_contacts_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "recruitment_client_contacts_recruitment_client_id_fkey" FOREIGN KEY ("recruitment_client_id") REFERENCES "recruitment_client_basic_information"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "recruitment_client_contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "recruitment_client_contacts_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    console.log('✅ Table "recruitment_client_contacts" created.');

    // 2. Create recruitment_client_documents
    console.log('Creating "recruitment_client_documents" table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "recruitment_client_documents" (
        "id" TEXT NOT NULL,
        "recruitment_client_id" TEXT NOT NULL,
        "document_type" TEXT,
        "document_url" TEXT,
        "created_by_id" TEXT NOT NULL,
        "updated_by_id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "recruitment_client_documents_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "recruitment_client_documents_recruitment_client_id_fkey" FOREIGN KEY ("recruitment_client_id") REFERENCES "recruitment_client_basic_information"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "recruitment_client_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "recruitment_client_documents_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);
    console.log('✅ Table "recruitment_client_documents" created.');

  } catch (error: any) {
    console.error('❌ Error creating tables:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixTables();
