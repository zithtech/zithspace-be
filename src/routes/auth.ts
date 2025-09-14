import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '@/controllers/authController';
import { resolveTenant } from '@/middleware/tenantContext';
import { authenticateToken, optionalAuth } from '@/middleware/auth';

const router = Router();

// Rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 5 attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for general auth operations
const generalAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 20 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login route - requires tenant context
router.post('/login', authRateLimit, resolveTenant, AuthController.login);

// Refresh token route - uses optional tenant context from token
router.post('/refresh', authRateLimit, optionalAuth, AuthController.refresh);

// Logout route - requires authentication
router.post('/logout', generalAuthRateLimit, authenticateToken, AuthController.logout);

// Get current user profile - requires authentication
router.get('/me', generalAuthRateLimit, authenticateToken, AuthController.me);

// Authentication check - requires authentication
router.get('/check', generalAuthRateLimit, authenticateToken, AuthController.check);

// Create user route - requires tenant context (for testing/setup)
router.post('/users', generalAuthRateLimit, resolveTenant, AuthController.createUser);

export default router;
