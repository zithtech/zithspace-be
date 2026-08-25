import pool from "../../config/dbpool";
import { linearBullMQService } from "./linear.bullmq.service";

export class LinearMigrationService {
  /**
   * Enqueues a new migration job via BullMQ.
   */
  public async startMigration(
    tenantId: string,
    integrationId: string,
    projectIds: string[],
    teamIds: string[],
    cycleIds: string[],
    stateIds: string[],
    userIds: string[],
    statusMapping: Record<string, string>,
    userMapping: Record<string, string>,
    migratedBy: string
  ) {
    // 1. Create a migration record in DB
    const insertQuery = `
      INSERT INTO "linear_migration_jobs" (
        "tenant_id",
        "linear_integration_id",
        "status",
        "total_projects",
        "created_at",
        "updated_at"
      ) VALUES (
        $1,
        $2,
        'RUNNING',
        $3,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING id
    `;
    
    // We will assume 'linear_migration_jobs' exists or we can use a generic 'migration_jobs' if needed.
    // For now, let's create it if not exists.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "linear_migration_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "linear_integration_id" UUID NOT NULL,
        "status" VARCHAR(50) DEFAULT 'RUNNING',
        "total_projects" INTEGER DEFAULT 0,
        "processed_projects" INTEGER DEFAULT 0,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const result = await pool.query(insertQuery, [tenantId, integrationId, projectIds.length]);
    const migrationId = result.rows[0].id;

    // 2. Add INIT job to BullMQ
    await linearBullMQService.enqueueInitMigration(
      migrationId,
      tenantId,
      integrationId,
      projectIds,
      teamIds,
      cycleIds,
      stateIds,
      userIds,
      statusMapping,
      userMapping,
      migratedBy
    );

    return { success: true, migrationId };
  }

  /**
   * Retrieves migration progress
   */
  public async getMigrationProgress(migrationId: string, tenantId: string) {
    const result = await pool.query(
      `SELECT * FROM "linear_migration_jobs" WHERE id = $1 AND tenant_id = $2`,
      [migrationId, tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error("Migration not found");
    }

    const migration = result.rows[0];

    // Query BullMQ counts for more granular progress
    const fetchCounts = await linearBullMQService.fetchIssuesQueue.getJobCounts('wait', 'active', 'completed', 'failed');
    const processCounts = await linearBullMQService.processIssueQueue.getJobCounts('wait', 'active', 'completed', 'failed');

    const totalJobs = fetchCounts.wait + fetchCounts.active + fetchCounts.completed + fetchCounts.failed +
                      processCounts.wait + processCounts.active + processCounts.completed + processCounts.failed;
    
    const completedJobs = fetchCounts.completed + processCounts.completed;
    
    const percentage = totalJobs > 0 ? Math.floor((completedJobs / totalJobs) * 100) : (migration.status === 'COMPLETED' ? 100 : 0);

    return {
      success: true,
      data: {
        ...migration,
        progress: percentage,
        details: {
          fetch: fetchCounts,
          process: processCounts
        }
      }
    };
  }
}
