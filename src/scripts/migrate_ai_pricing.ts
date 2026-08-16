import pool from '../config/dbpool';
import fs from 'fs';
import path from 'path';

async function migrate() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, '../database/migrations/017_create_ai_pricing_schema.sql'), 'utf8');
        await pool.query(sql);
        console.log('Migration 017_create_ai_pricing_schema ran successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
