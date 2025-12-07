# How to Apply Database Indexes

## 🎯 Quick Start

You need to run the SQL file to apply all performance indexes to your PostgreSQL database.

---

## 📋 **Method 1: Using psql Command Line** (Recommended)

```bash
# Navigate to your project directory
cd c:/Users/DK/Desktop/Zithmi/z-backend-v2

# Run the SQL file
psql -U your_postgres_user -d your_database_name -f prisma/migrations/apply_all_performance_indexes.sql

# Example:
psql -U postgres -d zithmi_db -f prisma/migrations/apply_all_performance_indexes.sql
```

**Expected Output:**
```
CREATE INDEX
CREATE INDEX
CREATE INDEX
...
(~20 times for each index)
COMMENT
COMMENT
...
```

---

## 📋 **Method 2: Using Prisma CLI**

```bash
# Navigate to your project directory
cd c:/Users/DK/Desktop/Zithmi/z-backend-v2

# Execute the SQL file using Prisma
npx prisma db execute --file ./prisma/migrations/apply_all_performance_indexes.sql --schema ./prisma/schema.prisma
```

---

## 📋 **Method 3: Using pgAdmin or Database Client**

1. Open **pgAdmin** or your PostgreSQL client
2. Connect to your database
3. Open the **Query Tool**
4. Copy the contents of `prisma/migrations/apply_all_performance_indexes.sql`
5. Paste into the query editor
6. Click **Execute** (F5)
7. Wait for completion (~30-60 seconds)

---

## 📋 **Method 4: Using DBeaver**

1. Open **DBeaver**
2. Connect to your PostgreSQL database
3. Right-click database → **SQL Editor** → **New SQL Script**
4. Copy contents from `apply_all_performance_indexes.sql`
5. Paste and click **Execute SQL Script** (Ctrl+Enter)

---

## ✅ **Verify Indexes Were Applied**

After running the SQL, verify with this query:

```sql
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN (
  'tickets', 
  'ticket_comments', 
  'ticket_related_links', 
  'ticket_attachments', 
  'ticket_activity_log'
)
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

**Expected Result**: Should show ~20 indexes

### Count by Table:
```sql
SELECT 
  tablename,
  COUNT(*) as index_count
FROM pg_indexes 
WHERE tablename IN ('tickets', 'ticket_comments', 'ticket_related_links', 'ticket_attachments', 'ticket_activity_log')
  AND indexname LIKE 'idx_%'
GROUP BY tablename
ORDER BY tablename;
```

**Expected Counts:**
- `tickets`: 11 indexes
- `ticket_comments`: 3 indexes
- `ticket_related_links`: 2 indexes  
- `ticket_attachments`: 2 indexes
- `ticket_activity_log`: 2 indexes
- **Total**: ~20 indexes

---

## 🧪 **Test Performance Improvement**

After applying indexes, test your endpoints:

### Test 1: Ticket List
```bash
curl "http://localhost:5001/api/tickets?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -w "\nTime: %{time_total}s\n"
```
**Expected**: ~300-500ms (down from 2000ms)

### Test 2: Ticket Detail
```bash
curl "http://localhost:5001/api/tickets/TICKET_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -w "\nTime: %{time_total}s\n"
```
**Expected**: ~800-1000ms (down from 5000ms)

---

## 🔍 **Verify Indexes Are Being Used**

```sql
-- Test ticket list query
EXPLAIN ANALYZE
SELECT * FROM tickets
WHERE tenant_id = 'your-tenant-id'
  AND status = 'in_progress'
ORDER BY created_at DESC
LIMIT 10;
```

**Look for**: `Index Scan using idx_ticket_tenant_status`

If you see `Seq Scan` instead of `Index Scan`, the index is not being used (may need to run `ANALYZE tickets;`).

---

## ⚠️ **Troubleshooting**

### **Issue**: "ERROR: permission denied"
**Solution**: Make sure your database user has CREATE INDEX privileges
```sql
GRANT CREATE ON DATABASE your_database TO your_user;
```

### **Issue**: Indexes already exist
**Solution**: This is fine! The `IF NOT EXISTS` clause prevents errors. Existing indexes are skipped.

### **Issue**: Slow to apply
**Solution**: Normal if you have lots of data. Wait for completion (30-60 seconds for 10k+ tickets).

### **Issue**: Indexes not being used
**Solution**: Run ANALYZE to update table statistics
```sql
ANALYZE tickets;
ANALYZE ticket_comments;
ANALYZE ticket_related_links;
```

---

## 🎯 **Success Checklist**

After applying indexes, you should see:

- [x] SQL file executed successfully
- [x] ~20 indexes created
- [x] Verification query shows all indexes
- [ ] Ticket list loads in ~300-500ms
- [ ] Ticket detail loads in ~800-1000ms
- [ ] No errors in application logs
- [ ] All ticket features work correctly

---

## 📊 **Expected Performance**

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| GET /api/tickets | 2000ms | 300-500ms | **85% faster** ⚡ |
| GET /api/tickets/:id | 5000ms | 800-1000ms | **80-84% faster** ⚡ |
| Comments queries | 1500ms | 200-300ms | **80-87% faster** ⚡ |
| Related links | 400ms | 50-100ms | **75-88% faster** ⚡ |

---

## 📝 **Notes**

- Indexes use snake_case column names (matching actual database schema)
- All composite indexes start with `tenant_id` for multi-tenant isolation
- Indexes are automatically maintained by PostgreSQL (no manual updates needed)
- Safe to run multiple times (IF NOT EXISTS prevents duplicates)

---

*File Location*: `z-backend-v2/prisma/migrations/apply_all_performance_indexes.sql`
*Total Indexes*: ~20 indexes across 5 tables
*Expected Execution Time*: 30-60 seconds
