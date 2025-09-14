import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Import configurations
import { connectDatabase, disconnectDatabase } from '@/config/database';

// Import middleware
import { optionalTenantContext } from '@/middleware/tenantContext';

// Import routes
import authRoutes from '@/routes/auth';
import tenantRoutes from '@/routes/tenants';
import projectRoutes from '@/routes/projects';
import ticketRoutes from '@/routes/tickets';
import attendanceRoutes from '@/routes/attendance';
import clientRoutes from '@/routes/clients';
import memberRoutes from '@/routes/members';
import shiftRoutes from '@/routes/shifts';
import transactionRoutes from '@/routes/transactions';
import releasePlanRoutes from '@/routes/releasePlans';
import settingRoutes from '@/routes/settings';
import userRoutes from '@/routes/user';

// Load environment variables
dotenv.config();

// Create Express application
const app = express();

// Connect to PostgreSQL
connectDatabase().catch(console.error);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'https://z-internal-app.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // For development, allow localhost with any port
    if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'X-Tenant-ID',
    'X-Tenant-Subdomain'
  ],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Global rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// app.use(limiter);

// Health check endpoint (no tenant context required)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Zithmi Backend V2 (Multi-Tenant) is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '2.0.0',
  });
});

// Tenant resolution for all API routes
app.use('/api', optionalTenantContext);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/release-plans', releasePlanRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/user', userRoutes);

// Tenant-specific health check
app.get('/api/health', (req: any, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running with tenant context',
    tenantId: req.tenantId || 'No tenant context',
    tenantName: req.tenant?.name || 'No tenant context',
    timestamp: new Date().toISOString(),
  });
});

// Handle Socket.io requests (to prevent 404 errors)
app.all('/socket.io/*', (req, res) => {
  res.status(200).json({
    success: false,
    message: 'Socket.io not configured on this server',
    note: 'WebSocket connections are not required for this application',
  });
});

// Handle preflight requests
app.options('*', (req, res) => {
  res.status(200).end();
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    message: 'The requested endpoint does not exist',
  });
});

// Global error handler
app.use((err: any, req: any, res: any, next: any): void => {
  console.error('Global error handler:', err);

  // Mongoose validation error (keeping for compatibility during migration)
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e: any) => e.message);
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: errors,
    });
    return;
  }

  // Prisma errors
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'field';
    res.status(409).json({
      success: false,
      error: `${field} already exists`,
      code: 'DUPLICATE_ENTRY',
    });
    return;
  }

  if (err.code === 'P2025') {
    res.status(404).json({
      success: false,
      error: 'Record not found',
      code: 'NOT_FOUND',
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
    return;
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({
      success: false,
      error: 'CORS policy violation',
      code: 'CORS_ERROR',
    });
    return;
  }

  // Rate limit errors
  if (err.statusCode === 429) {
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
    });
    return;
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
  
  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    }),
  });
});

// Start server
const PORT = parseInt(process.env.PORT || '5001');

const server = app.listen(PORT, () => {
  console.log(`Zithmi Backend V2 (Multi-Tenant) running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Multi-tenant API: http://localhost:${PORT}/api/health`);
  console.log(`Database: PostgreSQL with Prisma`);
  console.log(`Features: Multi-tenant, RLS, Enhanced Auth, JWT`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await disconnectDatabase();
      console.log('Database connections closed');
    } catch (error) {
      console.error('Error closing database connections:', error);
    }
    
    console.log('Process terminated');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: any) => {
  console.error('Unhandled Promise Rejection:', err);
  gracefulShutdown('Unhandled Promise Rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: any) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

export default app;
