# Zithmi AI Project Assistant

A conversational AI agent powered by Mastra that helps you manage projects and tickets through natural language.

## 🚀 Quick Start

### 1. Install Dependencies

**Linux/Mac:**
```bash
chmod +x scripts/install-mastra.sh
./scripts/install-mastra.sh
```

**Windows:**
```cmd
scripts\install-mastra.bat
```

**Or manually:**
```bash
npm install @mastra/core@latest @mastra/memory@latest @mastra/engine@latest
```

### 2. Configure Environment

Add to your `.env` file:

```env
# Required
OPENAI_API_KEY=sk-...your-key-here
API_BASE_URL=http://localhost:3001/api

# Already configured (verify these exist)
DATABASE_URL=postgresql://...
JWT_SECRET=...
```

### 3. Start the Backend

```bash
npm run dev
```

You should see:
```
Initializing Mastra...
Mastra initialized successfully
Server running on port 3001
```

## 💬 Using the Agent

### Example Conversations

**Get Projects:**
```
User: Show me all my active projects
Agent: I found 3 active projects:
1. Mobile App Redesign...
2. API Integration v2...
```

**Get Tickets:**
```
User: What tickets are assigned to me?
Agent: You have 5 tickets assigned:
1. Fix login bug (HIGH priority)...
```

**Create Ticket:**
```
User: Create a high priority bug in the Mobile App project
Agent: I'll help you create that ticket. Should I proceed?
User: Yes
Agent: ✅ Ticket created! ID: MOBILE-2024-156
```

## 📁 File Structure

```
z-backend-v2/src/
├── mastra/
│   ├── index.ts                    # Mastra instance initialization
│   ├── agent/
│   │   └── project-assistant.ts   # Agent definition
│   └── tools/
│       ├── project-tools.ts       # Project management tools
│       ├── ticket-tools.ts        # Ticket management tools
│       ├── stats-tools.ts         # Statistics tools
│       └── index.ts               # Tool exports
├── controllers/
│   └── agentController.ts         # Agent API handlers
└── routes/
    └── agent.ts                   # Agent routes
```

## 🛠️ API Endpoints

### POST `/api/agent/chat`
Chat with the agent

**Request:**
```json
{
  "message": "Show me all projects",
  "stream": false,
  "threadId": "optional-thread-id"
}
```

**Headers:**
- `Authorization: Bearer <jwt-token>`
- `x-tenant-id: <tenant-id>`
- `Content-Type: application/json`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "I found 3 projects...",
    "threadId": "user-123",
    "steps": 2
  }
}
```

### GET `/api/agent/history`
Get conversation history

### DELETE `/api/agent/history`
Clear conversation history

## 🔧 Available Tools

The agent can use these tools automatically:

### Project Tools
- `get-projects` - List projects with filters
- `get-project-details` - Get full project info
- `create-project` - Create new project (with confirmation)
- `get-project-members` - List project team members

### Ticket Tools
- `get-tickets` - List tickets with filters
- `get-ticket-details` - Get full ticket info
- `create-ticket` - Create new ticket (with confirmation)
- `update-ticket` - Update ticket fields
- `get-my-tickets` - Get user's assigned tickets

### Stats Tools
- `get-dashboard-stats` - Overall statistics
- `get-project-stats` - Project-specific metrics

## 🎯 Agent Capabilities

### What the Agent Can Do

✅ **Query Data**
- List projects by status, search term
- Filter tickets by priority, assignee, status
- Get detailed information about items
- View statistics and metrics

✅ **Create Items** (with confirmation)
- Create new projects
- Create new tickets
- Requires user confirmation before execution

✅ **Update Items**
- Change ticket status
- Update ticket priority
- Reassign tickets

✅ **Provide Insights**
- Team workload analysis
- Progress tracking
- Trend identification

### What the Agent Cannot Do

❌ Delete items (security)
❌ Modify user permissions
❌ Access other tenants' data
❌ Perform billing operations

## 🔒 Security

### Built-in Security Features

1. **Authentication Required** - All requests need valid JWT
2. **Tenant Isolation** - Agent only accesses user's tenant data
3. **RBAC Integration** - Respects existing permission system
4. **Confirmation for Mutations** - Creates/updates need user confirmation
5. **Input Validation** - All tool inputs are validated with Zod schemas

### Data Privacy

- Conversation history is stored per user
- No cross-tenant data leakage
- API calls respect existing security middleware
- Tools inherit user's permissions

## 📊 Monitoring

### Metrics to Track

Monitor these in your logs:
```typescript
// Agent request
{
  event: 'agent_chat',
  userId: 'user-123',
  tenantId: 'tenant-456',
  message: 'Show me all projects',
  timestamp: '2026-03-01T08:30:00Z'
}
```

### Cost Estimation

Using GPT-4o:
- Simple query: ~1,000 tokens = $0.0025
- Complex query with tools: ~5,000 tokens = $0.0125
- Average conversation: ~$0.05

**Daily estimates:**
- 10 users, 20 queries/day = ~$10/day
- 100 users, 20 queries/day = ~$100/day

**Cost reduction tips:**
1. Use `gpt-4o-mini` (80% cheaper)
2. Implement query caching
3. Set token limits

## 🐛 Troubleshooting

### Common Issues

**Agent not responding:**
```
Check: OPENAI_API_KEY is set correctly
Check: Database connection is working
Check: Mastra initialization succeeded
```

**Tools returning errors:**
```
Check: API_BASE_URL is correct
Check: Internal API endpoints are accessible
Check: User has permissions for the operation
```

**Streaming not working:**
```
Check: Content-Type header includes text/event-stream
Check: Nginx/proxy buffering is disabled
```

See `MASTRA_SETUP.md` for detailed troubleshooting.

## 📚 Documentation

- **Setup Guide**: `MASTRA_SETUP.md`
- **Implementation Plan**: `../plans/MASTRA_AI_AGENT_IMPLEMENTATION_PLAN.md`
- **Mastra Docs**: https://mastra.ai/docs
- **Tool Examples**: `src/mastra/tools/`

## 🔄 Extending the Agent

### Adding New Tools

1. Create tool file in `src/mastra/tools/`:

```typescript
export const myNewTool = createTool({
  id: 'my-new-tool',
  description: 'What this tool does',
  inputSchema: z.object({
    // Define inputs
  }),
  execute: async (input) => {
    // Implementation
  },
});
```

2. Export from `src/mastra/tools/index.ts`

3. Add to agent in `src/mastra/agent/project-assistant.ts`:

```typescript
tools: {
  ...existingTools,
  myNewTool,
},
```

4. Update agent instructions to mention new capability

### Customizing Instructions

Edit `src/mastra/agent/project-assistant.ts` to:
- Change conversation style
- Add domain-specific knowledge
- Modify response formats
- Add new capabilities

## 📈 Next Steps

1. ✅ Backend is ready
2. 🔲 Install dependencies
3. 🔲 Configure OpenAI API key
4. 🔲 Start backend and test
5. 🔲 Implement frontend chat UI
6. 🔲 Train team on agent capabilities
7. 🔲 Monitor usage and costs
8. 🔲 Gather feedback and iterate

---

**Status**: ✅ Backend Implementation Complete  
**Version**: 1.0  
**Last Updated**: March 1, 2026  
**Maintainer**: Development Team
