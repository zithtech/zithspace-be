-- ==========================================
-- PRISMA SCHEMA TO SQL SCRIPT
-- Database: PostgreSQL
-- Generated from: schema.prisma
-- ==========================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TENANT MANAGEMENT
-- ==========================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(255) UNIQUE NOT NULL,
    plan_type VARCHAR(50) DEFAULT 'basic' NOT NULL,
    max_users INTEGER DEFAULT 10 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- USER MANAGEMENT
-- ==========================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    work_email VARCHAR(255) NOT NULL,
    personal_email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' NOT NULL,
    position VARCHAR(255) NOT NULL,
    reports_to_id UUID,
    date_of_birth TIMESTAMP,
    work_days INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
    assigned_shift_id UUID,
    shift_assigned_by_id UUID,
    shift_assigned_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true NOT NULL,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_users_reports_to FOREIGN KEY (reports_to_id) REFERENCES users(id),
    CONSTRAINT fk_users_shift_assigned_by FOREIGN KEY (shift_assigned_by_id) REFERENCES users(id),
    CONSTRAINT unique_tenant_work_email UNIQUE (tenant_id, work_email),
    CONSTRAINT unique_tenant_personal_email UNIQUE (tenant_id, personal_email),
    CONSTRAINT unique_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token VARCHAR(500) UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- PROJECT MANAGEMENT
-- ==========================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'active' NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    project_manager_id UUID NOT NULL,
    repositories JSONB DEFAULT '[]',
    workflow_template TEXT[] NOT NULL,
    default_priority VARCHAR(50) DEFAULT 'medium' NOT NULL,
    total_tickets INTEGER DEFAULT 0 NOT NULL,
    completed_tickets INTEGER DEFAULT 0 NOT NULL,
    in_progress_tickets INTEGER DEFAULT 0 NOT NULL,
    created_by_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_projects_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_projects_manager FOREIGN KEY (project_manager_id) REFERENCES users(id),
    CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    CONSTRAINT unique_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(50) DEFAULT 'member' NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_project_members_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_project_user UNIQUE (project_id, user_id)
);

-- ==========================================
-- TICKET MANAGEMENT
-- ==========================================

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    project_id UUID NOT NULL,
    release_plan_id UUID,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    ticket_number VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'not_started' NOT NULL,
    priority VARCHAR(50) DEFAULT 'Medium (P2)' NOT NULL,
    type VARCHAR(50) DEFAULT 'Task' NOT NULL,
    platform VARCHAR(50) DEFAULT 'Development' NOT NULL,
    stack VARCHAR(50),
    task_level VARCHAR(50) DEFAULT 'Medium' NOT NULL,
    story_point INTEGER DEFAULT 1 NOT NULL,
    estimate_hours DECIMAL(5, 2) DEFAULT 0 NOT NULL,
    assignee_id UUID,
    report_to_id UUID,
    created_by_id UUID NOT NULL,
    parent_tickets TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    parent_ticket_notes TEXT,
    current_workflow_step VARCHAR(100) DEFAULT 'Scope Document' NOT NULL,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_tickets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_tickets_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_tickets_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
    CONSTRAINT fk_tickets_report_to FOREIGN KEY (report_to_id) REFERENCES users(id),
    CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    CONSTRAINT unique_tenant_ticket_number UNIQUE (tenant_id, ticket_number)
);

CREATE TABLE ticket_workflow_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    ticket_id UUID NOT NULL,
    step_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'not_started' NOT NULL,
    assigned_to TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    approvers TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    approval_status JSONB DEFAULT '[]' NOT NULL,
    documents JSONB DEFAULT '[]' NOT NULL,
    notes TEXT,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    completed_at TIMESTAMP,
    scheduled_meeting JSONB,
    branch_name VARCHAR(255),
    test_results JSONB DEFAULT '[]' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_workflow_steps_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_workflow_steps_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE ticket_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    ticket_id UUID NOT NULL,
    user_id UUID NOT NULL,
    comment TEXT NOT NULL,
    attachments JSONB DEFAULT '[]' NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_comments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE ticket_related_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    ticket_id UUID NOT NULL,
    link_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    added_by_id UUID NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_related_links_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_related_links_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_related_links_added_by FOREIGN KEY (added_by_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE ticket_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    ticket_id UUID NOT NULL,
    action VARCHAR(255) NOT NULL,
    performed_by_id UUID NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    details JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_activity_log_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_log_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_log_performed_by FOREIGN KEY (performed_by_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- CLIENT MANAGEMENT
-- ==========================================

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    address TEXT,
    contact_person VARCHAR(255),
    is_active BOOLEAN DEFAULT true NOT NULL,
    notes TEXT,
    created_by_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_clients_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_clients_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    CONSTRAINT unique_tenant_client_email UNIQUE (tenant_id, email)
);

-- ==========================================
-- RELEASE PLANNING
-- ==========================================

CREATE TABLE release_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    project_id UUID NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'planned' NOT NULL,
    release_date TIMESTAMP,
    created_by_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_release_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_release_plans_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_release_plans_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    CONSTRAINT unique_tenant_project_version UNIQUE (tenant_id, project_id, version)
);

-- Add foreign key for tickets.release_plan_id (must be added after release_plans table exists)
ALTER TABLE tickets
ADD CONSTRAINT fk_tickets_release_plan FOREIGN KEY (release_plan_id) REFERENCES release_plans(id);

-- ==========================================
-- WORKFORCE MANAGEMENT
-- ==========================================

CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    working_minutes INTEGER DEFAULT 480 NOT NULL,
    grace_minutes INTEGER DEFAULT 15 NOT NULL,
    overtime_threshold INTEGER DEFAULT 60 NOT NULL,
    break_minutes INTEGER DEFAULT 60 NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#007bff' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_shifts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_shift_name UNIQUE (tenant_id, name)
);

-- Add foreign key for users.assigned_shift_id (must be added after shifts table exists)
ALTER TABLE users
ADD CONSTRAINT fk_users_assigned_shift FOREIGN KEY (assigned_shift_id) REFERENCES shifts(id);

CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    date TIMESTAMP NOT NULL,
    clock_in TIMESTAMP,
    clock_out TIMESTAMP,
    status VARCHAR(50) DEFAULT 'present' NOT NULL,
    shift_id UUID,
    total_work_minutes INTEGER DEFAULT 0 NOT NULL,
    total_break_minutes INTEGER DEFAULT 0 NOT NULL,
    effective_work_minutes INTEGER DEFAULT 0 NOT NULL,
    overtime_minutes INTEGER DEFAULT 0 NOT NULL,
    late_minutes INTEGER DEFAULT 0 NOT NULL,
    is_manual_entry BOOLEAN DEFAULT false NOT NULL,
    entered_by_id UUID,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_attendance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
    CONSTRAINT fk_attendance_entered_by FOREIGN KEY (entered_by_id) REFERENCES users(id),
    CONSTRAINT unique_tenant_user_date UNIQUE (tenant_id, user_id, date)
);

CREATE TABLE attendance_breaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    attendance_id UUID NOT NULL,
    break_type VARCHAR(50) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_minutes INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_breaks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_breaks_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE
);

-- ==========================================
-- FINANCIAL TRACKING
-- ==========================================

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100),
    date TIMESTAMP NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_transactions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- SYSTEM CONFIGURATION
-- ==========================================

CREATE TABLE dropdown_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    category VARCHAR(100) NOT NULL,
    value VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    "order" INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_dropdown_options_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_category_value UNIQUE (tenant_id, category, value)
);

-- ==========================================
-- STATUS UPDATES
-- ==========================================

CREATE TABLE status_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    date DATE NOT NULL,
    project_updates JSONB DEFAULT '[]' NOT NULL,
    mood VARCHAR(50),
    total_hours_worked DECIMAL(5, 2),
    general_notes TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_status_updates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_status_updates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_date_tenant UNIQUE (user_id, date, tenant_id)
);

-- Create indexes for status_updates
CREATE INDEX idx_status_updates_tenant_date ON status_updates(tenant_id, date);
CREATE INDEX idx_status_updates_user_date ON status_updates(user_id, date);

-- ==========================================
-- WORK ENTRIES
-- ==========================================

CREATE TABLE work_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status_update_id UUID NOT NULL,
    project_id UUID NOT NULL,
    ticket_id UUID,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    hours_worked DECIMAL(5, 2) NOT NULL,
    work_summary TEXT NOT NULL,
    status VARCHAR(100) NOT NULL,
    blockers TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_work_entries_status_update FOREIGN KEY (status_update_id) REFERENCES status_updates(id) ON DELETE CASCADE,
    CONSTRAINT fk_work_entries_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_work_entries_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

-- ==========================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- ==========================================

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to all tables with updated_at column
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ticket_workflow_steps_updated_at BEFORE UPDATE ON ticket_workflow_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ticket_comments_updated_at BEFORE UPDATE ON ticket_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ticket_related_links_updated_at BEFORE UPDATE ON ticket_related_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_release_plans_updated_at BEFORE UPDATE ON release_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendance_breaks_updated_at BEFORE UPDATE ON attendance_breaks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dropdown_options_updated_at BEFORE UPDATE ON dropdown_options FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_status_updates_updated_at BEFORE UPDATE ON status_updates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_work_entries_updated_at BEFORE UPDATE ON work_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- SCRIPT COMPLETE
-- ==========================================

-- To execute this script:
-- psql -U your_username -d your_database -f create_tables.sql
