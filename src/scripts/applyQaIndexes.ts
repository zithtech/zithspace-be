import pool from '../config/dbpool';

interface IndexDefinition {
  name: string;
  table: string;
  sql: string;
}

const indexesToCreate: IndexDefinition[] = [
  {
    name: 'idx_qa_test_scopes_tenant_product',
    table: 'qa_test_scopes',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_scopes_tenant_product 
          ON qa_test_scopes (tenant_id, LOWER(details->>'product'))`
  },
  {
    name: 'idx_qa_test_scopes_tenant_owner',
    table: 'qa_test_scopes',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_scopes_tenant_owner
          ON qa_test_scopes (tenant_id, LOWER(qa_owner))`
  },
  {
    name: 'idx_qa_test_runs_tenant_created',
    table: 'qa_test_runs',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_runs_tenant_created 
          ON qa_test_runs (tenant_id, created_at DESC)`
  },
  {
    name: 'idx_qa_test_runs_scope_id',
    table: 'qa_test_runs',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_runs_scope_id 
          ON qa_test_runs (scope_id)`
  },
  {
    name: 'idx_qa_test_runs_suite_id',
    table: 'qa_test_runs',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_runs_suite_id 
          ON qa_test_runs (suite_id)`
  },
  {
    name: 'idx_qa_test_run_results_run_status',
    table: 'qa_test_run_results',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_run_results_run_status 
          ON qa_test_run_results (test_run_id, status)`
  },
  {
    name: 'idx_qa_parent_test_cases_tenant_proj',
    table: 'qa_parent_test_cases',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_parent_test_cases_tenant_proj 
          ON qa_parent_test_cases (tenant_id, project_id)`
  },
  {
    name: 'idx_qa_test_suites_parent',
    table: 'qa_test_suites',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qa_test_suites_parent 
          ON qa_test_suites (parent_test_case_id)`
  }
];

export async function applyIndexes() {
  console.log('=== QA Space Index Migration ===');
  const client = await pool.connect();
  try {
    // 1. Query existing indexes
    const existingRes = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename IN ('qa_test_scopes', 'qa_test_runs', 'qa_test_run_results', 'qa_test_suites', 'qa_parent_test_cases')
    `);
    const existingSet = new Set(existingRes.rows.map((r: any) => r.indexname));

    console.log(`Found ${existingSet.size} existing indexes on QA tables.`);

    // 2. Execute each index statement outside transactions
    for (const idx of indexesToCreate) {
      if (existingSet.has(idx.name)) {
        console.log(`[EXISTS] ${idx.name} on ${idx.table}`);
      } else {
        console.log(`[CREATING] ${idx.name} on ${idx.table}...`);
        try {
          await client.query(idx.sql);
          console.log(`[SUCCESS] Created ${idx.name}`);
        } catch (err: any) {
          console.error(`[ERROR] Failed to create ${idx.name}:`, err.message);
        }
      }
    }

    console.log('=== Migration Complete ===');
  } finally {
    client.release();
  }
}

if (require.main === module) {
  applyIndexes()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
