import pool from "./src/config/dbpool";

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Creating exit_request_approvals...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS exit_request_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        exit_request_id VARCHAR(255) NOT NULL REFERENCES employee_exits(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        approver_type VARCHAR(50) NOT NULL,
        approver_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'PENDING',
        comments TEXT,
        action_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('Creating exit_clearances...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS exit_clearances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        exit_request_id VARCHAR(255) NOT NULL REFERENCES employee_exits(id) ON DELETE CASCADE,
        department VARCHAR(50) NOT NULL,
        is_cleared BOOLEAN DEFAULT FALSE,
        comments TEXT,
        cleared_by_id VARCHAR(255),
        cleared_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('Creating exit_interviews...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS exit_interviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        exit_request_id VARCHAR(255) NOT NULL REFERENCES employee_exits(id) ON DELETE CASCADE,
        culture_rating INTEGER,
        management_rating INTEGER,
        growth_rating INTEGER,
        compensation_rating INTEGER,
        reason_detail TEXT,
        positive_feedback TEXT,
        constructive_feedback TEXT,
        interviewer_notes TEXT,
        interviewer_id VARCHAR(255),
        interview_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('Creating exit_fnf_settlements...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS exit_fnf_settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        exit_request_id VARCHAR(255) NOT NULL REFERENCES employee_exits(id) ON DELETE CASCADE,
        pending_salary DECIMAL(12,2) DEFAULT 0,
        leave_encashment DECIMAL(12,2) DEFAULT 0,
        bonus DECIMAL(12,2) DEFAULT 0,
        notice_buyout DECIMAL(12,2) DEFAULT 0,
        asset_deductions DECIMAL(12,2) DEFAULT 0,
        loan_recovery DECIMAL(12,2) DEFAULT 0,
        net_payable DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'PENDING',
        processed_by_id VARCHAR(255),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query('COMMIT');
    console.log('Successfully created raw tracking tables!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', error);
  } finally {
    client.release();
    process.exit(0);
  }
};

run();
