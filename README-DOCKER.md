# Docker Deployment Guide for Z-Backend-v2

## Quick Start

### 1. Setup Environment File

```bash
# Copy the example environment file
cp .env.production.example .env.production

# Edit with your actual values
nano .env.production

# Generate secure secrets
openssl rand -hex 32  # Use for JWT_ACCESS_SECRET
openssl rand -hex 32  # Use for JWT_REFRESH_SECRET
openssl rand -hex 32  # Use for SESSION_SECRET
```

### 2. For Local Development (No Nginx/SSL)

```bash
# Build images
docker-compose build

# Start services (backend + redis only)
docker-compose up -d

# View logs
docker-compose logs -f

# Run database migrations
docker-compose exec backend npx prisma migrate deploy

# Stop services
docker-compose down
```

### 3. For Production (With Nginx/SSL)

```bash
# Create nginx directories
mkdir -p nginx/conf.d certbot/conf certbot/www

# Start all services including nginx and certbot
docker-compose --profile production up -d

# Get SSL certificate (replace yourdomain.com)
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  -d yourdomain.com \
  -d www.yourdomain.com

# Update nginx/conf.d/default.conf (uncomment HTTPS section)
# Then reload nginx
docker-compose exec nginx nginx -s reload
```

## Common Commands

```bash
# Build and start
docker-compose build
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove volumes (CAREFUL - removes data!)
docker-compose down -v

# View logs
docker-compose logs -f backend
docker-compose logs -f redis

# Restart a service
docker-compose restart backend

# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Access backend shell
docker-compose exec backend sh

# Check service status
docker-compose ps

# View resource usage
docker stats
```

## Environment Variables

Key variables needed in `.env.production`:

```env
DATABASE_URL=postgresql://...           # Your Neon database
JWT_ACCESS_SECRET=...                   # Generate with openssl
JWT_REFRESH_SECRET=...                  # Generate with openssl
SESSION_SECRET=...                      # Generate with openssl
ALLOWED_ORIGINS=https://yourdomain.com  # Your frontend URL
APP_URL=https://yourdomain.com          # Your backend URL
FRONTEND_URL=https://your-frontend.com  # Your frontend URL
```

## Ports

- **5001**: Backend API
- **6379**: Redis (only accessible from backend container)
- **80**: HTTP (Nginx - production only)
- **443**: HTTPS (Nginx - production only)

## Volumes

- `redis-data`: Redis persistence
- `backend-logs`: Application logs
- `./uploads`: File uploads (mounted from host)

## Troubleshooting

### Backend won't start
```bash
docker-compose logs backend
docker-compose restart backend
```

### Database connection fails
```bash
# Check environment variables
docker-compose exec backend env | grep DATABASE_URL

# Test connection
docker-compose exec backend node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.\$connect().then(() => console.log('OK')).catch(e => console.error(e));"
```

### Clean everything and start fresh
```bash
docker-compose down -v
docker system prune -a
docker-compose build --no-cache
docker-compose up -d
```

## Production Deployment

See the detailed guides in the `plans/` directory:
- `Z-BACKEND-V2-DEPLOYMENT-GUIDE.md` - Complete deployment guide
- `Z-BACKEND-QUICK-REFERENCE.md` - Quick command reference

## Health Check

Test if the application is running:

```bash
# From server
curl http://localhost:5001/health

# From anywhere (replace with your domain)
curl http://yourdomain.com/health
```

## Notes

- The `.env` file is for development
- Use `.env.production` for production
- Never commit `.env.production` to Git
- Nginx and Certbot only start with `--profile production` flag
- For local testing, just use `docker-compose up -d` (no profile needed)
