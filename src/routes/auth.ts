import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AuthController } from "@/controllers/authController";
import { resolveTenant } from "@/middleware/tenantContext";
import { authenticateToken, optionalAuth } from "@/middleware/auth";

const router = Router();

// Rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 5 attempts per window
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for general auth operations
const generalAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 20 requests per window
  message: {
    success: false,
    error: "Too many requests, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Extension global login - doesn't require tenant context
router.post("/extension-login", authRateLimit, AuthController.extensionLogin);

// Login route - requires tenant context
router.post("/login", authRateLimit, resolveTenant, AuthController.login);

// Google login route - requires tenant context
router.post("/google-login", authRateLimit, resolveTenant, AuthController.googleLogin);

// Microsoft login route - requires tenant context
router.post("/microsoft-login", authRateLimit, resolveTenant, AuthController.microsoftLogin);

// Refresh token route - uses optional tenant context from token
router.post("/refresh", authRateLimit, optionalAuth, AuthController.refresh);

// Logout route - requires authentication
router.post(
  "/logout",
  generalAuthRateLimit,
  resolveTenant,
  authenticateToken,
  AuthController.logout,
);

// Get current user profile - requires authentication
router.get(
  "/me",
  generalAuthRateLimit,
  resolveTenant,
  authenticateToken,
  AuthController.me,
);

//get new profile for user - requires authentication
router.get("/new", AuthController.getNewProfile);

// Authentication check - requires authentication
router.get(
  "/check",
  generalAuthRateLimit,
  authenticateToken,
  AuthController.check,
);

// Create user route - requires tenant context (for testing/setup)
router.post(
  "/users",
  generalAuthRateLimit,
  resolveTenant,
  AuthController.createUser,
);

export default router;
