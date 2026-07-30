"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const authController_1 = require("@/controllers/authController");
const tenantContext_1 = require("@/middleware/tenantContext");
const auth_1 = require("@/middleware/auth");
const router = (0, express_1.Router)();
// Rate limiting for auth endpoints
const authRateLimit = (0, express_rate_limit_1.default)({
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
const generalAuthRateLimit = (0, express_rate_limit_1.default)({
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
// Extension workspace resolution - public, used by the activation/binding screen
router.get("/resolve-tenant", generalAuthRateLimit, authController_1.AuthController.resolveWorkspace);
// Extension install-key redemption - public, high-entropy key (not an existence oracle)
router.post("/redeem-install-key", authRateLimit, authController_1.AuthController.redeemInstallKey);
// Extension global login - doesn't require tenant context
router.post("/extension-login", authRateLimit, authController_1.AuthController.extensionLogin);
// Login route - requires tenant context
router.post("/login", authRateLimit, tenantContext_1.resolveTenant, authController_1.AuthController.login);
// Google login route - requires tenant context
router.post("/google-login", authRateLimit, tenantContext_1.resolveTenant, authController_1.AuthController.googleLogin);
// Microsoft login route - requires tenant context
router.post("/microsoft-login", authRateLimit, tenantContext_1.resolveTenant, authController_1.AuthController.microsoftLogin);
// Refresh token route - uses optional tenant context from token
router.post("/refresh", authRateLimit, auth_1.optionalAuth, authController_1.AuthController.refresh);
// Logout route - requires authentication
router.post("/logout", generalAuthRateLimit, tenantContext_1.resolveTenant, auth_1.authenticateToken, authController_1.AuthController.logout);
// Get current user profile - requires authentication
router.get("/me", generalAuthRateLimit, tenantContext_1.resolveTenant, auth_1.authenticateToken, authController_1.AuthController.me);
//get new profile for user - requires authentication
router.get("/new", authController_1.AuthController.getNewProfile);
// Authentication check - requires authentication
router.get("/check", generalAuthRateLimit, auth_1.authenticateToken, authController_1.AuthController.check);
// Create user route - requires tenant context (for testing/setup)
router.post("/users", generalAuthRateLimit, tenantContext_1.resolveTenant, authController_1.AuthController.createUser);
exports.default = router;
//# sourceMappingURL=auth.js.map