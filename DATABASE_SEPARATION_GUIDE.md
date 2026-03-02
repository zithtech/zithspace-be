# 🚀 Quick Start Guide - Mastra AI Agent

Get the AI agent running in 5 minutes!

## Step 1: Install Dependencies (2 minutes)

```bash
cd z-backend-v2

# Run installation script
./scripts/install-mastra.sh    # Linux/Mac
# OR
scripts\install-mastra.bat     # Windows

# OR manually
npm install @mastra/core@latest @mastra/memory@latest @mastra/engine@latest
```

## Step 2: Configure Database (2 minutes)

### Option A: Use Same Database (Quick - for development)

Add to `.env`:
```env
OPENAI_API_KEY=sk-your-key-here
API_BASE_URL=http://localhost:3001/api

# Mastra will use your existing DATABASE_URL
# No additional database setup needed!
```

### Option B: Dedicated Database (Recommended - for production)

1. **Create the database:**
```bash
# Run database setup script
./scripts/setup-mastra-database.sh    # Linux/Mac
# OR
scripts\setup-mastra-database.bat     # Windows
```

2. **Add to `.env`:**
```env
OPENAI_API_KEY=sk-your-key-here
API_BASE_URL=http://localhost:3001/api
MASTRA_DATABASE_URL=postgresql://mastra_user:password@localhost:5432/mastra_db
```

## Step 3: Get OpenAI API Key (1 minute)

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)
4. Add to `.env`:
```env
OPENAI_API_KEY=sk-proj-abc123...
```

## Step 4: Start Backend (30 seconds)

```bash
npm run dev
```

Look for:
```
✅ Using dedicated Mastra database (MASTRA_DATABASE_URL)
Initializing Mastra...
Mastra initialized successfully
Server running on port 3001
```

## Step 5: Test It! (30 seconds)

### Quick Test with cURL

```bash
# Replace YOUR_TOKEN and YOUR_TENANT_ID with actual values
curl -X POST http://localhost:3001/api/agent/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -d '{"message": "Show me all projects", "stream": false}'
```

### Or Test with Frontend

1. **Start frontend:**
```bash
cd z-internal-app
npm run dev
```

2. **Open browser:**
- Go to http://localhost:3000
- Login to your account
- Click "AI Assistant" in navigation
- Type: "Show me all active projects"

## 🎉 You're Done!

The agent is now running! Try these queries:

```
Show me all active projects
```

```
What tickets are assigned to me?
```

```
Show dashboard statistics
```

```
Create a bug ticket in project X
```

## ⚙️ Configuration Summary

### Environment Variables

```env
# Required
OPENAI_API_KEY=sk-...              # Your OpenAI API key
API_BASE_URL=http://localhost:3001/api

# Optional (recommended for production)
MASTRA_DATABASE_URL=postgresql://user:pass@host:port/mastra_db

# If MASTRA_DATABASE_URL is not set, uses:
DATABASE_URL=postgresql://...      # Main application database
```

### Database Strategy

**Development:**
```env
# Option 1: Use main database (simpler)
OPENAI_API_KEY=sk-...
# No MASTRA_DATABASE_URL needed
```

**Production:**
```env
# Option 2: Use dedicated database (recommended)
OPENAI_API_KEY=sk-...
MASTRA_DATABASE_URL=postgresql://mastra_user:pass@db-host:5432/mastra_db
```

## 🔍 Verify Setup

### Check 1: Backend Logs

Look for these messages:
```
✅ Using dedicated Mastra database (MASTRA_DATABASE_URL)
   OR
⚠️  Using main application database for Mastra (DATABASE_URL)

Initializing Mastra...
Mastra initialized successfully
```

### Check 2: Database Tables

Connect to your Mastra database:
```bash
psql -U mastra_user -d mastra_db
```

Check tables:
```sql
\dt
-- Should show:
-- mastra_threads
-- mastra_messages
-- mastra_runs
-- mastra_tool_calls
```

### Check 3: API Health

```bash
curl http://localhost:3001/health
```

Should return:
```json
{
  "success": true,
  "message": "Zithmi Backend V2 (Multi-Tenant) is running"
}
```

## 🐛 Troubleshooting

### "Cannot find module '@mastra/core'"
```bash
npm install @mastra/core@latest @mastra/memory@latest @mastra/engine@latest
```

### "Invalid OpenAI API key"
- Check OPENAI_API_KEY in .env
- Ensure no extra spaces
- Verify key is active at https://platform.openai.com

### "Database connection failed"
- Verify database is running
- Check MASTRA_DATABASE_URL is correct
- Test connection: `psql <connection-string>`

### "Agent not responding"
- Check backend logs for errors
- Verify OpenAI API has credits
- Check network connectivity

## 📚 More Information

- **Detailed Setup**: `MASTRA_SETUP.md`
- **Database Guide**: `DATABASE_SEPARATION_GUIDE.md`
- **Agent README**: `AGENT_README.md`
- **Full Implementation Plan**: `../plans/MASTRA_AI_AGENT_IMPLEMENTATION_PLAN.md`

## 💰 Cost Estimates

**Using GPT-4o:**
- Simple query: ~$0.0025
- Complex query: ~$0.01
- Daily (10 users, 20 queries): ~$10

**Using GPT-4o-mini (cheaper):**
- Simple query: ~$0.0003
- Complex query: ~$0.0012
- Daily (10 users, 20 queries): ~$1

To use mini model, edit `z-backend-v2/src/mastra/agent/project-assistant.ts`:
```typescript
model: {
  provider: 'OPEN_AI',
  name: 'gpt-4o-mini',  // Changed from gpt-4o
  toolChoice: 'auto',
},
```

## ✅ Next Steps

1. ✅ Dependencies installed
2. ✅ Database configured
3. ✅ API key added
4. ✅ Backend running
5. 🔲 Test with cURL or frontend
6. 🔲 Customize agent instructions
7. 🔲 Train your team
8. 🔲 Monitor usage and costs

---

**Time to complete**: ~5 minutes  
**Difficulty**: Easy  
**Status**: ✅ Ready to use!
