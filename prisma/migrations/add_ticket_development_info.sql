-- Migration: Add Ticket Development Info and Pull Requests
-- Created: 2026-01-27
-- Description: Adds tables for storing repository, branch, and PR information for tickets

-- Create ticket_development_info table (1-to-1 with tickets)
CREATE TABLE IF NOT EXISTS ticket_development_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    ticket_id UUID NOT NULL UNIQUE,
    repository_name VARCHAR(255),
    repository_url TEXT,
    branch_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_ticket_development_info_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_development_info_ticket
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Create indexes for ticket_development_info
CREATE INDEX IF NOT EXISTS idx_ticket_development_info_tenant_id 
    ON ticket_development_info(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ticket_development_info_ticket_id 
    ON ticket_development_info(ticket_id);

-- Create ticket_pull_requests table (1-to-many with tickets)
CREATE TABLE IF NOT EXISTS ticket_pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    ticket_id UUID NOT NULL,
    title VARCHAR(500) NOT NULL,
    url TEXT NOT NULL,
    pr_number INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_ticket_pull_requests_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_pull_requests_ticket
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Create indexes for ticket_pull_requests
CREATE INDEX IF NOT EXISTS idx_ticket_pull_requests_tenant_id 
    ON ticket_pull_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ticket_pull_requests_ticket_id 
    ON ticket_pull_requests(ticket_id);

-- Add comments for documentation
COMMENT ON TABLE ticket_development_info IS 'Stores repository and branch information for tickets';
COMMENT ON TABLE ticket_pull_requests IS 'Stores pull request information linked to tickets';
COMMENT ON COLUMN ticket_pull_requests.status IS 'PR status: open, merged, closed';
