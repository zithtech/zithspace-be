import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Creating QA Test Case Management tables...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_todo_modules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        module_name VARCHAR(255) NOT NULL,
        description TEXT,
        project_id TEXT,
        project_name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- A module belongs to a project; see migration 018 for existing installs.
      ALTER TABLE qa_todo_modules ADD COLUMN IF NOT EXISTS project_id TEXT;
      ALTER TABLE qa_todo_modules ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);
      CREATE INDEX IF NOT EXISTS idx_qa_todo_modules_project
        ON qa_todo_modules (tenant_id, project_id);
    `);
    console.log("Created qa_todo_modules table.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_parent_test_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        module_id UUID,
        feature VARCHAR(255),
        automation VARCHAR(50) DEFAULT 'Manual',
        owner UUID,
        status VARCHAR(50) DEFAULT 'Draft',
        created_by UUID,
        updated_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE qa_parent_test_cases DROP CONSTRAINT IF EXISTS qa_parent_test_cases_module_id_fkey;
    `);
    console.log("Created qa_parent_test_cases table.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_test_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        parent_test_case_id UUID REFERENCES qa_parent_test_cases(id) ON DELETE CASCADE,
        test_case_id VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        module_id UUID,
        feature VARCHAR(255),
        description TEXT,
        preconditions TEXT,
        steps_to_reproduce TEXT,
        expected_result TEXT,
        priority VARCHAR(50),
        severity VARCHAR(50),
        test_type VARCHAR(50),
        automation VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Draft',
        owner UUID,
        created_by UUID,
        updated_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE qa_test_cases ADD COLUMN IF NOT EXISTS parent_test_case_id UUID REFERENCES qa_parent_test_cases(id) ON DELETE CASCADE;
      ALTER TABLE qa_test_cases DROP CONSTRAINT IF EXISTS qa_test_cases_module_id_fkey;
    `);
    console.log("Created qa_test_cases table.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_test_suites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        suite_name VARCHAR(255) NOT NULL,
        parent_test_case_id UUID REFERENCES qa_parent_test_cases(id) ON DELETE CASCADE,
        module_id UUID,
        description TEXT,
        created_by UUID,
        updated_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE qa_test_suites ADD COLUMN IF NOT EXISTS parent_test_case_id UUID REFERENCES qa_parent_test_cases(id) ON DELETE CASCADE;
      ALTER TABLE qa_test_suites ALTER COLUMN module_id DROP NOT NULL;
      ALTER TABLE qa_test_suites DROP CONSTRAINT IF EXISTS qa_test_suites_module_id_fkey;
    `);
    console.log("Created qa_test_suites table.");

    // Migrate existing orphan child test cases into default Parent Test Cases per module
    await client.query(`
      DO $$
      DECLARE
        mod RECORD;
        new_parent_id UUID;
      BEGIN
        FOR mod IN SELECT DISTINCT tenant_id, module_id, owner FROM qa_test_cases WHERE parent_test_case_id IS NULL
        LOOP
          INSERT INTO qa_parent_test_cases (tenant_id, title, module_id, owner, status)
          SELECT mod.tenant_id, 
                 COALESCE((SELECT module_name FROM qa_todo_modules WHERE id = mod.module_id), 'General Scenarios') || ' - Scenarios', 
                 CASE WHEN EXISTS (SELECT 1 FROM qa_todo_modules WHERE id = mod.module_id) THEN mod.module_id ELSE NULL END, 
                 mod.owner, 'Ready'
          RETURNING id INTO new_parent_id;
          
          UPDATE qa_test_cases SET parent_test_case_id = new_parent_id 
          WHERE parent_test_case_id IS NULL 
            AND COALESCE(module_id::text, '') = COALESCE(mod.module_id::text, '') 
            AND tenant_id = mod.tenant_id;
        END LOOP;
      END $$;
    `);
    console.log("Migrated existing test cases to parent business scenarios.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_test_suite_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        test_suite_id UUID REFERENCES qa_test_suites(id) ON DELETE CASCADE,
        test_case_id UUID REFERENCES qa_test_cases(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(test_suite_id, test_case_id)
      );
    `);
    console.log("Created qa_test_suite_cases table.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_test_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        run_name VARCHAR(255) NOT NULL,
        suite_id UUID REFERENCES qa_test_suites(id) ON DELETE CASCADE,
        execution_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Pending',
        executed_by UUID,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("Created qa_test_runs table.");

    // Execution table for mapping runs to specific case results
    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_test_run_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        test_run_id UUID REFERENCES qa_test_runs(id) ON DELETE CASCADE,
        test_case_id UUID REFERENCES qa_test_cases(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'Not Executed',
        notes TEXT,
        executed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(test_run_id, test_case_id)
      );
    `);
    console.log("Created qa_test_run_results table.");

    console.log("All tables created successfully.");
  } catch (error) {
    console.error("Error creating tables:", error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
