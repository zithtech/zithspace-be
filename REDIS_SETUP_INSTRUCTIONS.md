# Redis Setup Instructions

## 🚀 Quick Start

### **Option 1: Local Redis (Development)**

#### Windows:
```bash
# Download Redis for Windows from:
# https://github.com/microsoftarchive/redis/releases

# Or use WSL2:
wsl --install
sudo apt-get update
sudo apt-get install redis-server
redis-server
```

#### Mac:
```bash
brew install redis
brew services start redis
```

#### Linux:
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
```

### **Option 2: Docker (Recommended)**

```bash
# Run Redis in Docker
docker run -d --name redis -p 6379:6379 redis:latest

# Verify it's running
docker ps
```

### **Option 3: Cloud Redis (Production)**

Popular options:
- **Redis Cloud** (free tier available): https://redis.com/try-free/
- **AWS ElastiCache**
- **Azure Cache for Redis**
- **Google Cloud Memorystore**

---

## ⚙️ Configuration

### **1. Add Redis URL to Environment Variables**

Create or update `.env` file in `z-backend-v2`:

```env
# Local Redis (default)
REDIS_URL=redis://localhost:6379

# Or Cloud Redis
REDIS_URL=redis://username:password@your-redis-host:6379
```

### **2. Verify Connection**

Start your backend:
```bash
cd z-backend-v2
npm run dev
```

Look for this log message:
```
✅ Redis connected successfully
```

If Redis is not available, you'll see:
```
⚠️ Redis connection failed after 3 retries. Caching disabled.
```

**Note**: The app will still work without Redis, but performance will be slower.

---

## 📊 Performance Impact

### **With Redis:**
- Ticket details: ~300ms (90% faster)
- User auth: ~50ms (cached)
- Tenant lookup: ~20ms (cached)

### **Without Redis:**
- Ticket details: ~1500ms
- User auth: ~300ms
- Tenant lookup: ~200ms

---

## 🧪 Testing Redis

### **Check if Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

### **Monitor cache activity:**
```bash
redis-cli monitor
```

### **View cached keys:**
```bash
redis-cli keys "*"
```

### **Clear all cache:**
```bash
redis-cli FLUSHALL
```

---

## 🔧 Troubleshooting

### **Connection refused:**
- Ensure Redis is running: `redis-cli ping`
- Check port 6379 is not blocked
- Verify REDIS_URL in .env

### **Performance not improving:**
- Check Redis logs: `docker logs redis`
- Monitor cache hits: `redis-cli info stats`
- Verify cache keys exist: `redis-cli keys "*"`

### **Memory issues:**
- Set max memory: `redis-cli CONFIG SET maxmemory 256mb`
- Set eviction policy: `redis-cli CONFIG SET maxmemory-policy allkeys-lru`

---

## 📝 Cache Keys Used

```
user:{tenantId}:{userId}           - User sessions (5 min TTL)
tenant:{tenantId}                  - Tenant data (10 min TTL)
tenant:subdomain:{subdomain}       - Tenant by subdomain (10 min TTL)
ticket:{tenantId}:{ticketId}       - Ticket details (2 min TTL)
comments:{tenantId}:{ticketId}     - Ticket comments (30 sec TTL)
links:{tenantId}:{ticketId}        - Related links (5 min TTL)
```

---

## 🎯 Next Steps

1. ✅ Install Redis (local or Docker)
2. ✅ Add REDIS_URL to .env
3. ✅ Start backend and verify connection
4. ✅ Test API performance
5. ✅ Monitor cache hits in Redis

---

*Last Updated: 2025-12-27*
*Redis Version: 7.x recommended*
