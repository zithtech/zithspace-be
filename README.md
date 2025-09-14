# Zithmi Backend V2 - Multi-Tenant Architecture

A complete rewrite of the Zithmi project management backend with full multi-tenant support, PostgreSQL, and enhanced security features.

## 🏗️ Architecture Overview

### Core Features
- **Multi-Tenancy**: Full tenant isolation with Row Level Security (RLS)
- **PostgreSQL + Prisma**: Modern database stack with type safety
- **Enhanced Authentication**: JWT with session management and token rotation
- **Tenant Resolution**: Multiple strategies for tenant identification
- **Security**: Comprehensive rate limiting, CORS, and security headers

### Technology Stack
- **Database**: PostgreSQL with Row Level Security
- **ORM**: Prisma with TypeScript support
- **Framework**: Express.js with TypeScript
- **Authentication**: JWT with access/refresh token pattern
- **Security**: Helmet, CORS, Rate limiting, bcrypt
- **Validation**: Zod for type-safe validation

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 12+
- npm or yarn

### Installation

1. **Clone and setup**
   ```bash
   cd z-backend-v2
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL credentials
   ```

3. **Database Setup**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run migrations
   npx prisma migrate dev
   
   # Optional: Open Prisma Studio
   npx prisma studio
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
z-backend-v2/
├── prisma/
│   ├── schema.prisma          # Database schema with multi-tenancy
│   └── migrations/            # Database migrations
├── src/
│   ├── app.ts                # Main application entry point
│   ├── config/
│   │   └── database.ts       # Prisma configuration & tenant-aware client
│   ├── controllers/
│   │   └── authController.ts # Authentication logic
│   ├── middleware/
│   │   ├── auth.ts           # JWT authentication middleware
│   │   └── tenantContext.ts  # Tenant resolution middleware
│   ├── routes/
│   │   └── auth.ts           # Authentication routes
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   └── utils/
│       └── jwt.ts            # JWT utilities
├── package.json
├── tsconfig.json
└── .env
```

## 🏢 Multi-Tenant Architecture

### Tenant Resolution Strategies

The system supports multiple tenant identification methods:

1. **Subdomain Resolution** (Primary)
   ```
   tenant1.yourdomain.com → tenant: tenant1
   ```

2. **Header-Based** (API Clients)
   ```
   X-Tenant-ID: tenant-uuid
   X-Tenant-Subdomain: tenant1
   ```

3. **JWT Token** (Authenticated Users)
   ```
   Token contains tenantId for automatic resolution
   ```

4. **Query Parameter** (Development Only)
   ```
   /api/endpoint?tenant=tenant1
   ```

### Database Schema

All major entities include `tenant_id` for isolation:

```sql
-- Example: Users table with tenant isolation
CREATE TABLE users (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR NOT NULL,
    work_email VARCHAR NOT NULL,
    -- ... other fields
    UNIQUE(tenant_id, work_email)
);

-- Row Level Security Policy
CREATE POLICY tenant_isolation_policy ON users
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Row Level Security (RLS)

PostgreSQL RLS automatically filters data by tenant:

```typescript
// Set tenant context (done automatically by middleware)
await prisma.$executeRaw`
  SELECT set_config('app.current_tenant_id', ${tenantId}, true)
`;

// All queries are automatically filtered by tenant
const users = await prisma.user.findMany(); // Only returns current tenant's users
```

## 🔐 Authentication System

### Enhanced JWT Strategy

- **Access Tokens**: Short-lived (15 minutes) with full user info
- **Refresh Tokens**: Long-lived (30 days) stored in database
- **Token Rotation**: New refresh token issued on each refresh
- **Session Tracking**: Each login creates a tracked session

### Authentication Flow

```typescript
// 1. Login with tenant context
POST /api/auth/login
Headers: X-Tenant-Subdomain: company1
Body: { email, password }

// 2. Token refresh
POST /api/auth/refresh
Cookies: refreshToken=...

// 3. Protected route access
GET /api/auth/me
Headers: Authorization: Bearer <access_token>
```

### Security Features

- **Rate Limiting**: 5 login attempts per 15 minutes
- **Password Hashing**: bcrypt with 12 rounds
- **Session Management**: Database-stored refresh tokens
- **Tenant Validation**: Automatic tenant context validation
- **CORS Protection**: Configured for specific origins

## 🛠️ API Endpoints

### Authentication Routes

| Method | Endpoint | Description | Auth Required | Tenant Required |
|--------|----------|-------------|---------------|----------------|
| POST   | `/api/auth/login` | User login | No | Yes |
| POST   | `/api/auth/refresh` | Refresh access token | No | Auto |
| POST   | `/api/auth/logout` | User logout | Yes | Auto |
| GET    | `/api/auth/me` | Get user profile | Yes | Auto |
| GET    | `/api/auth/check` | Check auth status | Yes | Auto |
| POST   | `/api/auth/users` | Create user (testing) | No | Yes |

### System Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/health` | System health check |
| GET    | `/api/health` | API health with tenant info |

## 🔄 Migration from MongoDB

### Data Migration Strategy

1. **Export MongoDB Data**
   ```bash
   # Export collections to JSON
   mongoexport --collection=users --out=users.json
   mongoexport --collection=projects --out=projects.json
   # ... repeat for all collections
   ```

2. **Transform Data Structure**
   ```typescript
   // Convert MongoDB documents to relational structure
   // Add tenant_id to all records
   // Transform references to UUIDs
   ```

3. **Import to PostgreSQL**
   ```bash
   # Use migration scripts (to be created)
   npm run migrate:from-mongo
   ```

### Schema Differences

| MongoDB | PostgreSQL | Change |
|---------|------------|--------|
| ObjectId | UUID | New ID format |
| Embedded docs | Related tables | Normalized structure |
| No tenant isolation | tenant_id + RLS | Multi-tenancy added |
| Flexible schema | Strict schema | Type safety |

## 🚦 Development Workflow

### Environment Setup

```bash
# Development
npm run dev          # Start with nodemon
npm run db:studio    # Open Prisma Studio

# Database
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema changes
npm run db:migrate   # Create migration

# Production
npm run build        # Compile TypeScript
npm start           # Start production server
```

### Testing Strategy

1. **Unit Tests**: Individual functions and utilities
2. **Integration Tests**: API endpoints with test database
3. **Multi-Tenant Tests**: Tenant isolation validation
4. **Security Tests**: Authentication and authorization

## 📊 Monitoring & Logging

### Request Logging
- **Development**: Morgan 'dev' format
- **Production**: Morgan 'combined' format
- **Tenant Context**: Automatically included in logs

### Error Handling
- **Prisma Errors**: Specific error codes and messages
- **JWT Errors**: Token validation and expiry
- **Rate Limit**: Request throttling
- **CORS**: Cross-origin request validation

## 🔧 Configuration

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/zithmi_v2"

# JWT Secrets (CHANGE IN PRODUCTION)
JWT_ACCESS_SECRET="your-access-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"

# Server
PORT=5001
NODE_ENV="development"

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
ALLOWED_ORIGINS="http://localhost:3000,https://yourdomain.com"
```

### Security Configuration

```typescript
// Example tenant-aware middleware
app.use('/api', optionalTenantContext);
app.use('/api/auth', authRoutes);
app.use('/api/users', resolveTenant, authenticateToken, userRoutes);
```

## 🎯 Next Steps

### Immediate Tasks
1. **Set up PostgreSQL RLS policies**
2. **Create seed data for testing**
3. **Build remaining API controllers (users, projects, tickets)**
4. **Update frontend to work with new authentication**

### Future Enhancements
1. **Redis for session management**
2. **Multi-Factor Authentication (MFA)**
3. **Audit logging system**
4. **API versioning**
5. **GraphQL API option**

## 🤝 Migration Guide

### For Developers

1. **Database Connection**: Update from MongoDB to PostgreSQL
2. **ORM Changes**: Replace Mongoose with Prisma queries
3. **Authentication**: New JWT flow with tenant context
4. **API Changes**: All endpoints now tenant-aware
5. **Error Handling**: New error codes and structure

### For Frontend

1. **Authentication**: Update login/logout flow
2. **Tenant Headers**: Include tenant context in API calls
3. **Error Handling**: Handle new error response format
4. **Token Refresh**: Implement automatic token refresh

## 📝 Notes

- **Development**: Use `?tenant=company1` for easy testing
- **Production**: Ensure proper PostgreSQL RLS setup
- **Security**: Change all default secrets in production
- **Monitoring**: Set up proper logging and error tracking
- **Backup**: Regular PostgreSQL backups recommended

---

**Built with ❤️ for scalable multi-tenant applications**
#   z - t i c k e t s - b e - v 2  
 