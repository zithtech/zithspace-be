# Mastra AI Agent Setup Guide

This guide will help you set up the Mastra AI agent for the Zithmi backend.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database configured
- OpenAI API key (or another LLM provider)

## Installation Steps

### 1. Install Mastra Dependencies

```bash
cd z-backend-v2

# Install required packages
npm install @mastra/core@latest @mastra/memory@latest @mastra/engine@latest

# Or with pnpm
pnpm add @mastra/core@latest @mastra/memory@latest @mastra/engine@latest
```

### 2. Set Up Dedicated Mastra Database (Recommended)

For production, use a separate database for Mastra to isolate agent data:

**Option A: Automated Setup**

Linux/Mac:
```bash
chmod +x scripts/setup-mastra-database.sh
./scripts/setup-mastra-database.sh
```

Windows:
```cmd
scripts\setup-mastra-database.bat
```

**Option B: Manual Setup**

Run the SQL script:
```bash
psql -U postgres -f scripts/setup-mastra-database.sql
```

Or execute manually:
```sql
-- Create user and database
CREATE USER mastra_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE mastra_db WITH OWNER mastra_user ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE mastra_db TO mastra_user;
```

### 3. Configure Environment Variables

Add the following to your `.env` file:

```env
# Mastra AI Configuration
OPENAI_API_KEY=your_openai_api_key_here
API_BASE_URL=http://localhost:3001/api

# Mastra Dedicated Database (recommended)
MASTRA_DATABASE_URL=postgresql://mastra_user:your_secure_password@localhost:5432/mastra_db

# Note: If MASTRA_DATABASE_URL is not set, Mastra will use the main DATABASE_URL
# For production, always use a dedicated database for better isolation
```

**Get your OpenAI API Key:**
1. Visit https://platform.openai.com/api-keys
2. Create a new API key
3. Copy and paste it into your `.env` file

### 4. Initialize Database Tables

Mastra will automatically create the necessary tables for conversation memory when the application starts. The tables will be created in the database specified by `MASTRA_DATABASE_URL`:

- `mastra_threads` - Stores conversation threads
- `mastra_messages` - Stores messages in threads
- `mastra_runs` - Stores agent execution runs
- `mastra_tool_calls` - Stores tool execution logs

No manual migration is needed! Tables are created automatically on first run.

### 5. Start the Backend

```bash
# Development mode
npm run dev

# Or production
npm run build
npm start
```

You should see:
```
Initializing Mastra...
Mastra initialized successfully
Server running on port 3001
```

## Testing the Agent

### Using cURL

**1. Chat with the agent (non-streaming):**

```bash
curl -X POST http://localhost:3001/api/agent/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -d '{
    "message": "Show me all my active projects",
    "stream": false
  }'
```

**2. Chat with streaming response:**

```bash
curl -X POST http://localhost:3001/api/agent/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -d '{
    "message": "What tickets are assigned to me?",
    "stream": true
  }'
```

**3. Get conversation history:**

```bash
curl http://localhost:3001/api/agent/history \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID"
```

**4. Clear conversation history:**

```bash
curl -X DELETE http://localhost:3001/api/agent/history \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "x-tenant-id: YOUR_TENANT_ID"
```

### Using Postman

1. **Create a new request**
2. **Set method to POST**
3. **URL**: `http://localhost:3001/api/agent/chat`
4. **Headers**:
   - `Content-Type: application/json`
   - `Authorization: Bearer <your-jwt-token>`
   - `x-tenant-id: <your-tenant-id>`
5. **Body** (JSON):
   ```json
   {
     "message": "Show me all my active projects",
     "stream": false
   }
   ```
6. **Send the request**

## Available Capabilities

The agent can help with:

### Projects
- "Show me all active projects"
- "Get details for project <ID>"
- "Who are the members of project <name>?"
- "Create a new project called <name>"

### Tickets
- "What tickets are assigned to me?"
- "Show me all high priority tickets"
- "Get details for ticket <ID>"
- "Create a bug ticket in project <name>"
- "Update ticket <ID> status to IN_PROGRESS"

### Statistics
- "Show me dashboard statistics"
- "What's the progress on project <name>?"

## Troubleshooting

### "Cannot find module '@mastra/core'"

**Solution**: Install the dependencies
```bash
npm install @mastra/core@latest @mastra/memory@latest @mastra/engine@latest
```

### "Mastra initialization failed"

**Check**:
1. Database connection is working
2. DATABASE_URL environment variable is set correctly
3. PostgreSQL is running

**Solution**: Review the error logs and ensure your database is accessible

### "OpenAI API error: Invalid API key"

**Check**:
1. OPENAI_API_KEY is set in .env
2. API key is valid and has credits
3. No extra spaces in the .env value

### "Tools not working - 401 Unauthorized"

**Cause**: The internal API calls from tools are failing authentication

**Solution**: Ensure API_BASE_URL is correct and the authentication token is being passed properly

### Agent responses are slow

**Optimization**:
1. Use streaming for better UX (`stream: true`)
2. Consider using a faster model like `gpt-4o-mini`
3. Reduce the number of tools loaded if not all are needed

## Switching LLM Providers

### Using Anthropic Claude

```bash
npm install @anthropic-ai/sdk
```

Add to `.env`:
```env
ANTHROPIC_API_KEY=your_anthropic_key
```

Update `z-backend-v2/src/mastra/agent/project-assistant.ts`:
```typescript
model: {
  provider: 'ANTHROPIC',
  name: 'claude-sonnet-4-20250514',
  toolChoice: 'auto',
},
```

### Using Google Gemini

```bash
npm install @google/generative-ai
```

Add to `.env`:
```env
GOOGLE_API_KEY=your_google_key
```

Update the agent model configuration:
```typescript
model: {
  provider: 'GOOGLE',
  name: 'gemini-2.0-flash-exp',
  toolChoice: 'auto',
},
```

## Monitoring

### Check Agent Usage

Monitor these in your logs:
- Number of requests to `/api/agent/chat`
- Token usage (visible in responses)
- Error rates
- Average response time

### Cost Management

**OpenAI Costs:**
- GPT-4o: ~$2.50 per 1M input tokens, ~$10 per 1M output tokens
- GPT-4o-mini: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens

**Estimate**: A typical conversation with 5-10 messages costs $0.01-0.05

**Tips to reduce costs:**
1. Use `gpt-4o-mini` for most queries
2. Set token limits in agent configuration
3. Implement caching for common queries
4. Use streaming to provide better UX with same cost

## Production Deployment

### Environment Variables

Ensure these are set in production:
```env
NODE_ENV=production
OPENAI_API_KEY=<production-key>
API_BASE_URL=https://your-domain.com/api
DATABASE_URL=<production-database-url>
```

### Security Checklist

- [ ] API keys are in environment variables (not hardcoded)
- [ ] Rate limiting is enabled on agent endpoints
- [ ] CORS is configured properly
- [ ] Database has proper indexes on Mastra tables
- [ ] Logging is configured for monitoring
- [ ] Error messages don't leak sensitive information

### Scaling Considerations

1. **Database Connection Pooling**: Mastra uses your existing DB connection
2. **Horizontal Scaling**: Stateless design allows multiple backend instances
3. **Caching**: Consider Redis for caching frequent queries
4. **Load Balancing**: Standard HTTP load balancing works

## Next Steps

1. ✅ Install dependencies
2. ✅ Configure environment variables
3. ✅ Start the backend
4. ✅ Test with cURL or Postman
5. 🔲 Implement frontend chat UI (see frontend guide)
6. 🔲 Customize agent instructions for your team
7. 🔲 Add more tools as needed

## Support

For issues or questions:
- Review the full implementation plan: `plans/MASTRA_AI_AGENT_IMPLEMENTATION_PLAN.md`
- Check Mastra docs: https://mastra.ai/docs
- Review tool implementations in `z-backend-v2/src/mastra/tools/`

---

**Status**: ✅ Backend implementation complete
**Version**: 1.0
**Last Updated**: March 1, 2026
