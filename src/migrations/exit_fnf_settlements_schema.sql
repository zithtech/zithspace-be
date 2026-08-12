-- Update employee_exits
ALTER TABLE employee_exits ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Drop and Create exit_fnf_settlements if necessary or just create
CREATE TABLE IF NOT EXISTS exit_fnf_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,
    exit_request_id VARCHAR NOT NULL,
    payroll_run_id VARCHAR,
    pending_salary DECIMAL DEFAULT 0,
    leave_encashment DECIMAL DEFAULT 0,
    bonus DECIMAL DEFAULT 0,
    incentives DECIMAL DEFAULT 0,
    loan_recovery DECIMAL DEFAULT 0,
    salary_advance_recovery DECIMAL DEFAULT 0,
    tax DECIMAL DEFAULT 0,
    pf DECIMAL DEFAULT 0,
    esi DECIMAL DEFAULT 0,
    asset_deduction DECIMAL DEFAULT 0,
    notice_recovery DECIMAL DEFAULT 0,
    manual_adjustment DECIMAL DEFAULT 0,
    total_additions DECIMAL DEFAULT 0,
    total_deductions DECIMAL DEFAULT 0,
    net_payable DECIMAL DEFAULT 0,
    approved_by VARCHAR,
    approved_at TIMESTAMP,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
