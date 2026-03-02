
# Mastra Separate Database Configuration

## Overview

The Mastra AI agent is configured to use a **dedicated separate database** for all agent-related data including conversation history, memory, and execution logs.

## Why Separate Database?

✅ **Data Isolation** - Agent data is completely separate from application data  
✅ **Independent Scaling** - Scale agent database independently based on usage  
✅ **Easier Backup/Restore** - Back up conversation history separately  
✅ **Performance** - No impact on main application database  
✅ **Security** - Additional security layer for sensitive conversations  
✅ **Maintenance** - Clear separation of concerns

## Configuration

### Environment Variable

The implementation uses `MASTRA_DATABASE_URL` as a dedicated database connection:

```env
# Dedicated Mastra Database (recommended)
MASTRA_DATABASE_URL=postgresql://mastra_user:password@host:port/mastra_db
```

### Fallback Strategy

The code automatically falls back if `MASTRA_DATABASE_URL` is not set:

```typescript
// Priority 1: Dedicated Mastra database (MASTRA_DATABASE_URL)
// Priority 2: Main application database (DATABASE_URL)
// Priority 3: Constructed from DB_* environment variables
```

You'll see this in logs:
```
✅ Using dedicated Mastra database (MASTRA_DATABASE_URL)
  OR
⚠️  Using main application database for Mastra (DATABASE_URL)
```

## Setup Options

### Option 1: Automated Setup (Recommended)

**Linux/Mac:**
```bash
cd z-backend-v2
chmod +x scripts/setup-mastra-database.sh
./scripts/setup-mastra-database.sh
```

**Windows:**
```cmd
cd z-backend-v2
scripts\setup-mastra-database.bat
```

This will:
1. Prompt for PostgreSQL connection details
2. Create `mastra_user` database user
3. Create `mastra_db` database
4. Grant necessary privileges
5. Provide connection string for `.env`

### Option 2: Manual SQL Setup

Execute this SQL on your PostgreSQL server:

```sql
-- 1. Create dedicated user
CREATE USER mastra_user WITH PASSWORD 'your_secure_password_here';

-- 2. Create dedicated database
CREATE DATABASE mastra_db
    WITH OWNER mastra_user
    ENCODING 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE template0;

-- 3. Grant privileges
GRANT ALL PRIVILEGES ON DATABASE mastra_db TO mastra_user;

-- 4. Connect to new database and grant schema privileges
\c mastra_db
GRANT ALL ON SCHEMA public TO mastra_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mastra_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mastra_user;
```

### Option 3: Use Cloud Provider

**AWS RDS:**
```bash
# Create separate RDS instance for Mastra
MASTRA_DATABASE_URL=postgresql://mastra_user:password@mastra-db.xxx.us-east-1.rds.amazonaws.com:5432/mastra
```

**Supabase:**
```bash
# Create separate Supabase project
MASTRA_DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
```

**Neon:**
```bash
# Create separate Neon database
MASTRA_DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/mastra_db
```

## Database Schema

Mastra automatically creates these tables on first run:

```sql
-- Conversation threads (one per user/session)
CREATE TABLE mastra_threads (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual messages in threads
CREATE TABLE mastra_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES mastra_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent execution runs
CREATE TABLE mastra_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  thread_id TEXT REFERENCES mastra_threads(id),
  status TEXT NOT NULL,
  input JSONB,
  output JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Tool execution logs
CREATE TABLE mastra_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES mastra_runs(id),
  tool_name TEXT NOT NULL,
  input JSONB,
  output JSONB,
  duration_ms INTEGER,
  success BOOLEAN,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_mastra_threads_resource ON mastra_threads(resource_id);
CREATE INDEX idx_mastra_messages_thread ON mastra_messages(thread_id);
CREATE INDEX idx_mastra_runs_agent ON mastra_runs(agent_id);
CREATE INDEX idx_mastra_runs_thread ON mastra_runs(thread_id);
CREATE INDEX idx_mastra_tool_calls_run ON mastra_tool_calls(run_id);
```

## Verification

### Check Database Connection

```bash
# Connect to Mastra database
psql "postgresql://mastra_user:password@localhost:5432/mastra_db"

# List tables
\dt

# Expected output:
#  Schema |       Name        | Type  |    Owner     
# --------+-------------------+-------+--------------
#  public | mastra_messages   | table | mastra_user
#  public | mastra_runs       | table | mastra_user
#  public | mastra_threads    | table | mastra_user
#  public | mastra_tool_calls | table | mastra_user
```

### Check Data

```sql
-- View all conversation threads
SELECT id, resource_id, created_at FROM mastra_threads ORDER BY created_at DESC;

-- View recent messages
SELECT t.resource_id, m.role, LEFT(m.content, 50) as content_preview, m.created_at
FROM mastra_messages m
JOIN mastra_threads t ON m.thread_id = t.id
ORDER BY m.created_at DESC
LIMIT 10;

-- View tool usage
SELECT tool_name, COUNT(*) as usage_count, 
       AVG(duration_ms) as avg_duration_ms,
       SUM(CASE WHEN success THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
FROM mastra_tool_calls
GROUP BY tool_name
ORDER BY usage_count DESC;
```

## Connection String Format

### Standard PostgreSQL

```env
MASTRA_DATABASE_URL=postgresql://username:password@hostname:port/database_name
```

### With SSL (Production)

```env
MASTRA_DATABASE_URL=postgresql://username:password@hostname:port/database_name?sslmode=require
```

### With Connection Pooling

```env
MASTRA_DATABASE_URL=postgresql://username:password@hostname:port/database_name?pool_size=20
```

## Migration Strategy

### Development Setup

```env
# Start with main database (easy)
# Just set OpenAI key, no MASTRA_DATABASE_URL needed
OPENAI_API_KEY=sk-...
```

### Production Migration

1. **Create dedicated database:**
```bash
./scripts/setup-mastra-database.sh
```

2. **Add to .env:**
```env
MASTRA_DATABASE_URL=postgresql://mastra_user:password@prod-host:5432/mastra_db
```

3. **Deploy and verify:**
```bash
# Check logs for:
✅ Using dedicated Mastra database (MASTRA_DATABASE_URL)
```

4. **(Optional) Migrate existing data:**
```sql
-- If you have existing data in main database, copy it
INSERT INTO mastra_db.mastra_threads 
SELECT * FROM main_db.mastra_threads;

INSERT INTO mastra_db.mastra_messages 
SELECT * FROM main_db.mastra_messages;
```

## Maintenance

### Backup

```bash
# Backup Mastra database
pg_dump -U mastra_user -h localhost mastra_db > mastra_backup.sql

# Restore
psql -U mastra_user -h localhost mastra_db < mastra_backup.sql
```

### Monitoring

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('mastra_db'));

-- Table sizes
SELECT 
  tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Active connections
SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'mastra_db';
```

### Cleanup Old Data

```sql
-- Delete messages older than 90 days
DELETE FROM mastra_messages 
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete inactive threads (no messages in 30 days)
DELETE FROM mastra_threads
WHERE id NOT IN (
  SELECT DISTINCT thread_id FROM mastra_messages 
  WHERE created_at > NOW() - INTERVAL '30 days'
);

-- Vacuum to reclaim space
VACUUM ANALYZE;
```

## Security Best Practices

1. **Use Strong Passwords**
   ```bash
   # Generate secure password
   openssl rand -base64 32
   ```

2. **Limit User Privileges**
   ```sql
   -- Mastra user should NOT have SUPERUSER or CREATEDB privileges
   -- Only access to mastra_db
   ```

3. **Network Security**
   ```bash
   # Restrict database access in pg_hba.conf
   host mastra_db mastra_user 10.0.0.0/8 md5
   ```

4. **SSL/TLS**
   ```env
   MASTRA_DATABASE_URL=postgresql://user:pass@host:5432/mastra_db?sslmode=require
   ```

5. **Environment Variables**
   - Never commit connection strings to git
   - Use secret management in production (AWS Secrets Manager, Vault, etc.)
   - Rotate credentials regularly

## Troubleshooting

### "Connection refused"
- Check database is running
- Verify host and port are correct
- Check firewall rules

### "Authentication failed"
- Verify username and password
- Check user exists: `\du` in psql
- Ensure user has access to database

### "Database does not exist"
- Create database: `CREATE DATABASE mastra_db;`
- Or run setup script

### "Permission denied"
- Grant privileges: `GRANT ALL PRIVILEGES ON DATABASE mastra_db TO mastra_user;`
- Check schema permissions

## Cost Considerations

### Storage Estimates

**Per User:**
- Active thread: ~1 KB
- Per message: ~2 KB
- Per tool call: ~1 KB

**Monthly Storage (100 active users):**
- Threads: 100 KB
- Messages (20/user/day): ~120 MB
- Tool calls: ~60 MB
- **Total**: ~180 MB/month

**Annual Storage**: ~2 GB (very small!)

### Database Sizing

**Small Deployment (< 100 users):**
- Single PostgreSQL instance
- 1 GB storage
- Standard compute

**Medium Deployment (100-1000 users):**
- Dedicated PostgreSQL instance
- 10 GB storage
- Enhanced compute for faster queries

**Large Deployment (1000+ users):**
- High-availability PostgreSQL
- 50 GB+ storage
- Read replicas for analytics

## Summary

✅ **Implementation Complete** - Separate database support fully configured  
✅ **Flexible Configuration** - Works with or without dedicated database  
✅ **Automatic Fallback** - Uses main database if dedicated not configured  
✅ **Setup Scripts** - Automated setup for all platforms  
✅ **Documentation** - Complete guides for setup and maintenance

**To use separate database:**
1. Run setup script or create manually
2. Add `MASTRA_DATABASE_URL` to `.env`
3. Start backend - tables created automatically
4. Verify in logs: "✅ Using dedicated Mastra database"

---

**Version**: 1.0  
**Last Updated**: March 1, 2026  
**Status**: ✅ Production Ready
