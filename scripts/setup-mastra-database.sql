-- ============================================
-- Mastra AI Agent Database Setup Script
-- ============================================
-- This script creates a dedicated database for Mastra AI agent
-- Run this on your PostgreSQL server to set up the separate database

-- Step 1: Create database user for Mastra
CREATE USER mastra_user WITH PASSWORD 'your_secure_password_here';

-- Step 2: Create dedicated Mastra database
CREATE DATABASE mastra_db
    WITH OWNER mastra_user
    ENCODING 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE template0;

-- Step 3: Grant privileges
GRANT ALL PRIVILEGES ON DATABASE mastra_db TO mastra_user;

-- Step 4: Connect to the new database and grant schema privileges
\c mastra_db

GRANT ALL ON SCHEMA public TO mastra_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mastra_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mastra_user;

-- ============================================
-- Verification
-- ============================================
-- After running this script, verify with:
-- \l                    -- List databases (should see mastra_db)
-- \du                   -- List users (should see mastra_user)

-- ============================================
-- Connection String
-- ============================================
-- Use this connection string in your .env file:
-- MASTRA_DATABASE_URL=postgresql://mastra_user:your_secure_password_here@localhost:5432/mastra_db

-- ============================================
-- Notes
-- ============================================
-- 1. Change 'your_secure_password_here' to a strong password
-- 2. The database will be empty - Mastra creates tables automatically on first run
-- 3. Expected tables: mastra_threads, mastra_messages, mastra_runs, mastra_tool_calls
-- 4. For production, ensure proper backup and monitoring

-- ============================================
-- Cleanup (if needed)
-- ============================================
-- To remove everything:
-- DROP DATABASE IF EXISTS mastra_db;
-- DROP USER IF EXISTS mastra_user;
