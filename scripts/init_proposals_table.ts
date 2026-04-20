import pool from '../src/config/dbpool';

async function createProposalsTable() {
    const client = await pool.connect();
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS proposals (
                id SERIAL PRIMARY KEY,
                tenant_id VARCHAR(255) NOT NULL,
                title VARCHAR(255) NOT NULL,
                client_name VARCHAR(255),
                status VARCHAR(50) DEFAULT 'draft',
                blocks_data JSONB NOT NULL,
                created_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Add an index for tenant_id for performance
            CREATE INDEX IF NOT EXISTS idx_proposals_tenant_id ON proposals(tenant_id);
        `;
        
        console.log('Creating proposals table...');
        await client.query(query);
        console.log('✅ Proposals table created successfully!');
    } catch (err) {
        console.error('❌ Error creating proposals table:', err);
    } finally {
        client.release();
        process.exit();
    }
}

createProposalsTable();
