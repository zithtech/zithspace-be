-- Check existing indexes on critical tables
SELECT 
    indexname, 
    tablename,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('Ticket', 'User', 'Tenant', 'Project')
ORDER BY tablename, indexname;
