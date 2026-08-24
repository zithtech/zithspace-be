import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Jira Integration database migration...');

  try {
    // Create jira_integrations table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "jira_integrations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "cloud_id" TEXT,
        "site_url" TEXT,
        "access_token_encrypted" TEXT,
        "refresh_token_encrypted" TEXT,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "status" TEXT DEFAULT 'PENDING',
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('✅ Created jira_integrations table');

    // Create jira_migration_jobs table (legacy - keeping for reference if needed, but we will use jira_migrations)
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "jira_migration_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "integration_id" UUID NOT NULL,
        "status" TEXT DEFAULT 'PENDING',
        "progress" INTEGER DEFAULT 0,
        "log" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('✅ Created jira_migration_jobs table (legacy)');

    // Create new tracking tables for BullMQ based architecture
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "jira_migrations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "integration_id" UUID NOT NULL,
        "status" TEXT DEFAULT 'PENDING',
        "total_issues" INTEGER DEFAULT 0,
        "processed_issues" INTEGER DEFAULT 0,
        "successful_issues" INTEGER DEFAULT 0,
        "failed_issues" INTEGER DEFAULT 0,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "last_error" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('✅ Created jira_migrations table');

    await prisma.$executeRaw`
      ALTER TABLE "jira_migrations" ADD COLUMN IF NOT EXISTS "configuration" JSONB;
    `;
    console.log('✅ Added configuration column to jira_migrations table');

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "jira_migration_issues" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "migration_id" UUID NOT NULL,
        "jira_issue_id" TEXT NOT NULL,
        "zukvo_ticket_id" UUID,
        "status" TEXT DEFAULT 'PENDING',
        "attempts" INTEGER DEFAULT 0,
        "error" TEXT,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("migration_id", "jira_issue_id")
      );
    `;
    console.log('✅ Created jira_migration_issues table');

    // Create jira_entity_mappings table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "jira_entity_mappings" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "jira_integration_id" UUID NOT NULL REFERENCES "jira_integrations"("id") ON DELETE CASCADE,
        "entity_type" TEXT NOT NULL,
        "jira_id" TEXT NOT NULL,
        "zukvo_id" TEXT NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("jira_integration_id", "entity_type", "jira_id")
      );
    `;
    console.log('✅ Created jira_entity_mappings table');

    // Create jira_migration_jobs table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "jira_migration_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "jira_integration_id" UUID NOT NULL REFERENCES "jira_integrations"("id") ON DELETE CASCADE,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "total_projects" INTEGER DEFAULT 0,
        "total_users" INTEGER DEFAULT 0,
        "total_tickets" INTEGER DEFAULT 0,
        "total_bugs" INTEGER DEFAULT 0,
        "total_sprints" INTEGER DEFAULT 0,
        "total_comments" INTEGER DEFAULT 0,
        "total_attachments" INTEGER DEFAULT 0,
        "processed_projects" INTEGER DEFAULT 0,
        "processed_users" INTEGER DEFAULT 0,
        "processed_tickets" INTEGER DEFAULT 0,
        "processed_bugs" INTEGER DEFAULT 0,
        "processed_sprints" INTEGER DEFAULT 0,
        "processed_comments" INTEGER DEFAULT 0,
        "processed_attachments" INTEGER DEFAULT 0,
        "failed_items" INTEGER DEFAULT 0,
        "error" TEXT,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('✅ Created jira_migration_jobs table');

    console.log('🎉 Jira Integration migration completed successfully!');
  } catch (error) {
    console.error('❌ Error during Jira Integration migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
