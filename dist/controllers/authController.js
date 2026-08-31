"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const axios_1 = __importDefault(require("axios"));
const database_1 = require("@/config/database");
const dbpool_1 = __importDefault(require("@/config/dbpool"));
const crypto_1 = __importDefault(require("crypto"));
const emailService_1 = require("@/utils/emailService");
const jwt_1 = require("@/utils/jwt");
const rbac_service_1 = require("@/modules/rbac/rbac.service");
const subscriptions_1 = require("@/modules/subscriptions");
const companyDetailsService = __importStar(require("@/modules/company-details/services/companyDetails.service"));
const entitlementsService = __importStar(require("@/modules/entitlements/entitlements.service"));
const brand_1 = require("@/config/brand");
const transactionHistory_1 = require("../utils/transactionHistory");
class AuthController {
    /**
     * Global login for Chrome Extension
     */
    static async extensionLogin(req, res) {
        console.log("extensionLogin hit:", req.body);
        try {
            const { email, password, tenantSlug } = req.body;
            if (!email || !password) {
                res.status(400).json({
                    success: false,
                    error: "Email and password are required",
                });
                return;
            }
            // When the extension install is bound to a workspace, scope the lookup to
            // that tenant. This enforces the pre-bound model and prevents a user whose
            // email exists in multiple tenants from being resolved to the wrong one.
            let boundTenantId;
            if (tenantSlug) {
                const boundTenant = await database_1.prisma.tenant.findFirst({
                    where: {
                        OR: [
                            { subdomain: String(tenantSlug).toLowerCase() },
                            { id: String(tenantSlug) },
                        ],
                        isActive: true,
                    },
                    select: { id: true },
                });
                if (!boundTenant) {
                    res.status(404).json({
                        success: false,
                        error: "Workspace not found or inactive",
                    });
                    return;
                }
                boundTenantId = boundTenant.id;
            }
            // Search for the user, scoped to the bound tenant when provided.
            const user = await database_1.prisma.user.findFirst({
                where: {
                    OR: [
                        { workEmail: email.toLowerCase() },
                        { personalEmail: email.toLowerCase() },
                    ],
                    isActive: true,
                    ...(boundTenantId ? { tenantId: boundTenantId } : {}),
                },
                include: {
                    tenant: true,
                    employee: true,
                    position: {
                        select: {
                            id: true,
                            title: true,
                            code: true,
                        },
                    },
                },
            });
            if (!user || !user.tenant.isActive) {
                res.status(401).json({
                    success: false,
                    error: "Invalid credentials",
                });
                return;
            }
            // Verify password
            const isPasswordValid = await bcryptjs_1.default.compare(password, user.passwordHash);
            if (!isPasswordValid) {
                res.status(401).json({
                    success: false,
                    error: "Invalid credentials",
                });
                return;
            }
            // Create auth user object for token generation
            const authUser = {
                id: user.id,
                tenantId: user.tenantId,
                email: user.workEmail,
                role: user.role,
                position: user.position?.title || null,
                name: user.name,
            };
            // Generate tokens
            const { accessToken, refreshToken } = jwt_1.JWTUtils.generateTokenPair(authUser);
            // Prepare user data for response
            const { passwordHash: _, ...userWithoutPassword } = user;
            const userData = {
                ...userWithoutPassword,
                tenantSlug: user.tenant.subdomain || 'zithmi' // In Zukvov2 it's subdomain
            };
            res.status(200).json({
                success: true,
                accessToken,
                refreshToken,
                user: userData,
            });
        }
        catch (error) {
            console.error("Extension login error:", error);
            res.status(500).json({
                success: false,
                error: "An unexpected error occurred during login",
            });
        }
    }
    /**
     * Resolve a workspace by slug for the Chrome Extension activation screen.
     * Public (no auth): only exposes whether the workspace exists + its display
     * name, so the extension can bind an install to a tenant before login.
     */
    static async resolveWorkspace(req, res) {
        try {
            const slug = req.query.slug || "";
            if (!slug) {
                res.status(400).json({
                    success: false,
                    error: "Workspace slug is required",
                });
                return;
            }
            const tenant = await database_1.prisma.tenant.findFirst({
                where: {
                    OR: [{ subdomain: slug.toLowerCase() }, { id: slug }],
                    isActive: true,
                },
                select: { id: true, name: true, subdomain: true },
            });
            // Same reasoning as GET /api/tenants/resolve: unauthenticated, and it
            // hands back a real company name. It must not confirm that a workspace
            // exists on the brand the caller is NOT asking through, so the 404 below
            // is identical for "no such workspace" and "exists on the other product".
            let entitled = true;
            const product = (0, brand_1.productFromRequest)(req);
            if (tenant && product) {
                try {
                    entitled = await entitlementsService.hasProduct(tenant.id, product);
                }
                catch (err) {
                    // Entitlements table may not exist yet — honour the same kill switch
                    // the middleware uses rather than making every workspace unresolvable.
                    console.error("[auth/resolve-tenant] entitlement check failed:", err);
                    entitled = !entitlementsService.ENFORCING;
                }
            }
            if (!tenant || !entitled) {
                res.status(404).json({
                    success: false,
                    error: "Workspace not found or inactive",
                });
                return;
            }
            res.status(200).json({
                success: true,
                tenant: {
                    name: tenant.name,
                    slug: tenant.subdomain,
                },
            });
        }
        catch (error) {
            console.error("Resolve workspace error:", error);
            res.status(500).json({
                success: false,
                error: "An unexpected error occurred",
            });
        }
    }
    /**
     * Redeem a one-time install key for the Chrome Extension activation screen.
     * Unlike /resolve-tenant (which takes a public slug), the install key is a
     * high-entropy secret provisioned per tenant — so this endpoint is not an
     * existence oracle for workspace names. Returns the bound workspace on match.
     */
    static async redeemInstallKey(req, res) {
        try {
            const key = req.body?.key || "";
            if (!key || key.trim().length < 8) {
                res.status(400).json({
                    success: false,
                    error: "A valid install key is required",
                });
                return;
            }
            const tenant = await database_1.prisma.tenant.findFirst({
                where: {
                    isActive: true,
                    settings: { path: ["extensionInstallKey"], equals: key.trim() },
                },
                select: { id: true, name: true, subdomain: true },
            });
            if (!tenant) {
                // Generic message — never reveal whether a key "almost" matched.
                res.status(404).json({
                    success: false,
                    error: "Invalid or expired install key",
                });
                return;
            }
            res.status(200).json({
                success: true,
                tenant: {
                    name: tenant.name,
                    slug: tenant.subdomain,
                },
            });
        }
        catch (error) {
            console.error("Redeem install key error:", error);
            res.status(500).json({
                success: false,
                error: "An unexpected error occurred",
            });
        }
    }
    /**
     * User login with tenant context
     */
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            // Validate input
            if (!email || !password) {
                res.status(400).json({
                    success: false,
                    error: "Email and password are required",
                });
                return;
            }
            // Ensure we have tenant context for login
            if (!req.tenantId || !req.tenant) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context is required for login",
                });
                return;
            }
            // Find user by email within the tenant
            const user = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.user.findFirst({
                    where: {
                        OR: [
                            { workEmail: email.toLowerCase() },
                            { personalEmail: email.toLowerCase() },
                        ],
                        tenantId: req.tenantId,
                    },
                    include: {
                        tenant: true,
                        employee: true,
                        position: {
                            select: {
                                id: true,
                                title: true,
                                code: true,
                            },
                        },
                    },
                });
            });
            if (!user) {
                res.status(401).json({
                    success: false,
                    error: "Invalid credentials",
                });
                return;
            }
            // Check if user is active
            if (!user.isActive) {
                res.status(403).json({
                    success: false,
                    error: "Your account is deactivated. Please contact your administrator.",
                });
                return;
            }
            // Verify password
            const isPasswordValid = await bcryptjs_1.default.compare(password, user.passwordHash);
            // const isPasswordValid = true
            if (!isPasswordValid) {
                res.status(401).json({
                    success: false,
                    error: "Invalid credentials",
                });
                return;
            }
            // Check if tenant is active
            if (!user.tenant.isActive) {
                res.status(403).json({
                    success: false,
                    error: "Account suspended",
                });
                return;
            }
            // Create auth user object for token generation
            const authUser = {
                id: user.id,
                tenantId: user.tenantId,
                email: user.workEmail,
                role: user.role,
                position: user.position?.title || null,
                name: user.name,
            };
            // Generate token pair
            const { accessToken, refreshToken } = jwt_1.JWTUtils.generateTokenPair(authUser);
            // Store refresh token in database
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                await client.refreshToken.create({
                    data: {
                        token: refreshToken,
                        userId: user.id,
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                    },
                });
            });
            // Set refresh token cookie
            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: "/", // Ensure cookie is available for all paths
            });
            // Load permissions
            const permSet = await rbac_service_1.RBACService.getUserPermissions(user.id, user.tenantId, user.role);
            // Fetch subscription features and build dynamic navigation
            await subscriptions_1.subscriptionService.invalidateTenantSubscription(user.tenantId);
            // Scope to the brand door this request came through, so a tenant holding
            // both subscriptions gets the shell they actually asked for.
            const requestProduct = (0, brand_1.productFromRequest)(req);
            const subscriptionFeatures = await subscriptions_1.featureResolverService.getTenantFeatures(user.tenantId, requestProduct ? requestProduct.toUpperCase() : undefined);
            const navigation = await subscriptions_1.navigationService.buildNavigation(permSet, subscriptionFeatures);
            // Fetch onboarding status (raw query — Prisma schema not updated)
            const onboardingRaw = await dbpool_1.default.query("SELECT onboarding_completed FROM tenants WHERE id = $1", [user.tenantId]);
            const onboardingCompleted = onboardingRaw.rows[0]?.onboarding_completed ?? true;
            // Return user data and access token
            const loginResponse = {
                success: true,
                accessToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.workEmail,
                    workEmail: user.workEmail,
                    personalEmail: user.personalEmail,
                    role: user.role,
                    position: user.position ? { id: user.position.id, title: user.position.title } : null,
                    tenantId: user.tenantId,
                    tenantName: user.tenant.name,
                    tenantLogo: user.tenant.settings?.logoUrl || null,
                    avatarUrl: user.avatarUrl,
                    isActive: user.isActive,
                    permissions: Array.from(permSet),
                    subscriptionFeatures,
                    navigation,
                    onboardingCompleted,
                },
                message: "Login successful",
            };
            // Populate req.user temporarily for transaction history logging
            req.user = {
                id: user.id,
                email: user.workEmail,
                name: user.name,
                tenantId: user.tenantId,
                role: user.role,
                position: user.position?.title || null,
            };
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.AUTH,
                page: transactionHistory_1.Page.LOGIN,
                action: transactionHistory_1.Action.LOGIN,
                actionLabel: `User ${user.name || user.workEmail} logged in`,
                entityType: transactionHistory_1.EntityType.SESSION,
                entityId: user.id,
                entityLabel: user.workEmail,
                metadata: {
                    ip: req.ip ?? req.socket?.remoteAddress ?? null,
                    userAgent: req.headers["user-agent"] ?? null,
                },
            });
            res.status(200).json(loginResponse);
        }
        catch (error) {
            console.error("Login error:", error);
            res.status(500).json({
                success: false,
                error: "Login failed",
            });
        }
    }
    /**
     * Refresh access token
     */
    static async refresh(req, res) {
        try {
            const { refreshToken } = req.cookies;
            if (!refreshToken) {
                res.status(401).json({
                    success: false,
                    error: "Refresh token required",
                });
                return;
            }
            // Verify refresh token
            const decoded = jwt_1.JWTUtils.verifyRefreshToken(refreshToken);
            // Check if token exists in database and is not expired
            const storedToken = await database_1.tenantAwarePrisma.withTenant(decoded.tenantId, async (client) => {
                return await client.refreshToken.findFirst({
                    where: {
                        token: refreshToken,
                        userId: decoded.userId,
                        expiresAt: { gt: new Date() },
                    },
                    include: {
                        user: {
                            include: {
                                tenant: true,
                                position: {
                                    select: {
                                        id: true,
                                        title: true,
                                        code: true,
                                    },
                                },
                            },
                        },
                    },
                });
            });
            if (!storedToken ||
                !storedToken.user.isActive ||
                !storedToken.user.tenant.isActive) {
                res.status(401).json({
                    success: false,
                    error: "Invalid or expired refresh token",
                });
                return;
            }
            // Create auth user object for new token generation //
            const authUser = {
                id: storedToken.user.id,
                tenantId: storedToken.user.tenantId,
                email: storedToken.user.workEmail,
                role: storedToken.user.role,
                position: storedToken.user.position?.title || null,
                name: storedToken.user.name,
            };
            // Generate new token pair
            const { accessToken, refreshToken: newRefreshToken } = jwt_1.JWTUtils.generateTokenPair(authUser);
            // Replace old refresh token with new one
            await database_1.tenantAwarePrisma.withTenant(decoded.tenantId, async (client) => {
                await client.refreshToken.deleteMany({
                    where: { id: storedToken.id },
                });
                await client.refreshToken.create({
                    data: {
                        token: newRefreshToken,
                        userId: storedToken.user.id,
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                    },
                });
            });
            // Set new refresh token cookie
            res.cookie("refreshToken", newRefreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 30 days
                path: "/", // Ensure cookie is available for all paths
            });
            res.status(200).json({
                success: true,
                accessToken,
                message: "Token refreshed successfully",
            });
        }
        catch (error) {
            console.error("Token refresh error:", error);
            res.status(401).json({
                success: false,
                error: "Token refresh failed",
            });
        }
    }
    /**
     * User logout
     */
    static async logout(req, res) {
        try {
            const { refreshToken } = req.cookies;
            // Revoke refresh token from database if present
            if (refreshToken && req.user) {
                try {
                    await database_1.tenantAwarePrisma.withTenant(req.user.tenantId, async (client) => {
                        await client.refreshToken.deleteMany({
                            where: {
                                token: refreshToken,
                                userId: req.user.id,
                            },
                        });
                    });
                }
                catch (error) {
                    console.error("Error revoking refresh token:", error);
                    // Continue with logout even if token deletion fails
                }
            }
            // Log logout transaction
            if (req.user) {
                (0, transactionHistory_1.recordTransaction)({
                    req,
                    section: transactionHistory_1.Section.ADMIN,
                    module: transactionHistory_1.Module.AUTH,
                    page: transactionHistory_1.Page.LOGIN,
                    action: transactionHistory_1.Action.LOGOUT,
                    actionLabel: `User ${req.user.name || req.user.email} logged out`,
                    entityType: transactionHistory_1.EntityType.SESSION,
                    entityId: req.user.id,
                    entityLabel: req.user.email,
                });
            }
            // Clear refresh token cookie
            res.clearCookie("refreshToken");
            res.status(200).json({
                success: true,
                message: "Logged out successfully",
            });
        }
        catch (error) {
            console.error("Logout error:", error);
            res.status(500).json({
                success: false,
                error: "Logout failed",
            });
        }
    }
    /**
     * Get current user profile
     */
    static async me(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            // Get fresh user data
            const user = await database_1.tenantAwarePrisma.withTenant(req.user.tenantId, async (client) => {
                return await client.user.findFirst({
                    where: {
                        id: req.user.id,
                        tenantId: req.user.tenantId,
                    },
                    include: {
                        employee: true,
                        reportsTo: {
                            select: {
                                id: true,
                                name: true,
                                position: {
                                    select: {
                                        id: true,
                                        title: true,
                                        code: true,
                                    },
                                },
                            },
                        },
                        position: {
                            select: {
                                id: true,
                                title: true,
                                code: true,
                            },
                        },
                        tenant: {
                            select: {
                                id: true,
                                name: true,
                                subdomain: true,
                                settings: true,
                                generalSettings: { take: 1 },
                            },
                        },
                    },
                });
            });
            if (!user) {
                res.status(404).json({
                    success: false,
                    error: "User not found",
                });
                return;
            }
            // Get raw onboarding_completed status (bypassing Prisma)
            const tenantRawResult = await dbpool_1.default.query("SELECT onboarding_completed FROM tenants WHERE id = $1", [user.tenantId]);
            const onboardingCompleted = tenantRawResult.rows[0]?.onboarding_completed ?? true;
            // Load permissions
            const permSet = await rbac_service_1.RBACService.getUserPermissions(user.id, user.tenantId, user.role);
            // Fetch subscription features and build dynamic navigation
            await subscriptions_1.subscriptionService.invalidateTenantSubscription(user.tenantId);
            // Scope to the brand door this request came through, so a tenant holding
            // both subscriptions gets the shell they actually asked for.
            const requestProduct = (0, brand_1.productFromRequest)(req);
            const subscriptionFeatures = await subscriptions_1.featureResolverService.getTenantFeatures(user.tenantId, requestProduct ? requestProduct.toUpperCase() : undefined);
            const navigation = await subscriptions_1.navigationService.buildNavigation(permSet, subscriptionFeatures);
            // Company details live in the raw-SQL company-details module, not Prisma.
            // A tenant that has not filled the form in yet simply gets null.
            const companyDetails = await companyDetailsService
                .getCompany({ tenantId: user.tenantId, userId: user.id })
                .catch((err) => {
                console.error("Failed to load company details for profile:", err);
                return null;
            });
            // Which products this tenant holds. NOT what they can use — that is
            // `subscriptionFeatures` above, resolved from the admin control plane and
            // scoped to the brand door this request came through. `products` is here
            // so the client can tell which door it is on, nothing more.
            const products = await entitlementsService
                .getProducts(user.tenantId)
                .catch((err) => {
                console.error("Failed to load entitlements for profile:", err);
                return [];
            });
            res.status(200).json({
                success: true,
                data: {
                    id: user.id,
                    name: user.name,
                    workEmail: user.workEmail,
                    personalEmail: user.personalEmail,
                    phone: user.phone,
                    role: user.role,
                    position: user.position,
                    positionTitle: user.position?.title,
                    dateOfBirth: user.dateOfBirth,
                    avatarUrl: user.avatarUrl,
                    workDays: user.workDays,
                    isActive: user.isActive,
                    reportsTo: user.reportsTo,
                    employeeId: user.employeeId,
                    employee: user.employee || {},
                    tenant: {
                        id: user.tenant.id,
                        name: user.tenant.name,
                        subdomain: user.tenant.subdomain,
                        logoUrl: user.tenant.settings?.logoUrl || null,
                        generalSettings: user.tenant.generalSettings?.[0] || null,
                        companyDetails,
                    },
                    onboardingCompleted,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                    permissions: Array.from(permSet),
                    products,
                    subscriptionFeatures,
                    navigation,
                },
            });
        }
        catch (error) {
            console.error("Get user profile error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get user profile",
            });
        }
    }
    /**
     * Check authentication status
     */
    static async check(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    authenticated: false,
                    error: "Not authenticated",
                });
                return;
            }
            res.status(200).json({
                success: true,
                authenticated: true,
                user: {
                    id: req.user.id,
                    email: req.user.email,
                    role: req.user.role,
                    position: req.user.position,
                    tenantId: req.user.tenantId,
                },
            });
        }
        catch (error) {
            console.error("Auth check error:", error);
            res.status(500).json({
                success: false,
                error: "Authentication check failed",
            });
        }
    }
    /**
     * Create a new user (for testing and tenant setup)
     */
    static async createUser(req, res) {
        try {
            if (!req.tenantId || !req.tenant) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context is required",
                });
                return;
            }
            const userData = req.body;
            // Validate required fields
            if (!userData.name ||
                !userData.workEmail ||
                !userData.personalEmail ||
                !userData.phone ||
                !userData.password ||
                !userData.positionId) {
                res.status(400).json({
                    success: false,
                    error: "All required fields must be provided",
                });
                return;
            }
            // Hash password
            const passwordHash = await bcryptjs_1.default.hash(userData.password, 12);
            // Create user
            const user = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.user.create({
                    data: {
                        tenantId: req.tenantId,
                        name: userData.name,
                        workEmail: userData.workEmail.toLowerCase(),
                        personalEmail: userData.personalEmail.toLowerCase(),
                        phone: userData.phone,
                        passwordHash,
                        role: userData.role || "user",
                        positionId: userData.positionId,
                        reportsToId: userData.reportsToId || null,
                        dateOfBirth: userData.dateOfBirth || null,
                        workDays: userData.workDays || [1, 2, 3, 4, 5], // Monday to Friday
                    },
                    include: {
                        position: {
                            select: {
                                id: true,
                                title: true,
                                code: true,
                            },
                        },
                    },
                });
            });
            res.status(201).json({
                success: true,
                data: {
                    id: user.id,
                    name: user.name,
                    workEmail: user.workEmail,
                    personalEmail: user.personalEmail,
                    phone: user.phone,
                    role: user.role,
                    position: user.position,
                    positionTitle: user.position?.title,
                    isActive: user.isActive,
                },
                message: "User created successfully",
            });
        }
        catch (error) {
            console.error("Create user error:", error);
            if (error.code === "P2002") {
                res.status(409).json({
                    success: false,
                    error: "User with this email or phone already exists",
                });
                return;
            }
            res.status(500).json({
                success: false,
                error: "Failed to create user",
            });
        }
    }
    /**
     * Get new profile including employee info
     */
    static async getNewProfile(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            // Fetch user and linked employee
            const user = await database_1.tenantAwarePrisma.withTenant(req.user.tenantId, async (client) => {
                return await client.user.findFirst({
                    where: {
                        id: req.user.id,
                        tenantId: req.user.tenantId,
                    },
                    include: {
                        employee: true, // Assuming `employee` is the relation in Prisma
                        reportsTo: {
                            select: {
                                id: true,
                                name: true,
                                position: {
                                    select: {
                                        id: true,
                                        title: true,
                                        code: true,
                                    },
                                },
                            },
                        },
                        position: {
                            select: {
                                id: true,
                                title: true,
                                code: true,
                            },
                        },
                        tenant: {
                            select: {
                                id: true,
                                name: true,
                                subdomain: true,
                                settings: true,
                            },
                        },
                    },
                });
            });
            if (!user) {
                res.status(404).json({
                    success: false,
                    error: "User not found",
                });
                return;
            }
            // Load effective permissions from RBAC service (cached)
            const permSet = await rbac_service_1.RBACService.getUserPermissions(user.id, user.tenantId, user.role);
            // Fetch subscription features and build dynamic navigation
            await subscriptions_1.subscriptionService.invalidateTenantSubscription(user.tenantId);
            // Scope to the brand door this request came through, so a tenant holding
            // both subscriptions gets the shell they actually asked for.
            const requestProduct = (0, brand_1.productFromRequest)(req);
            const subscriptionFeatures = await subscriptions_1.featureResolverService.getTenantFeatures(user.tenantId, requestProduct ? requestProduct.toUpperCase() : undefined);
            const navigation = await subscriptions_1.navigationService.buildNavigation(permSet, subscriptionFeatures);
            res.status(200).json({
                success: true,
                data: {
                    id: user.id,
                    name: user.name,
                    workEmail: user.workEmail,
                    personalEmail: user.personalEmail,
                    phone: user.phone,
                    role: user.role,
                    position: user.position,
                    positionTitle: user.position?.title,
                    dateOfBirth: user.dateOfBirth,
                    workDays: user.workDays,
                    isActive: user.isActive,
                    reportsTo: user.reportsTo,
                    tenant: {
                        ...user.tenant,
                        logoUrl: user.tenant.settings?.logoUrl || null,
                    },
                    employeeId: user.employee?.id || null, // Employee ID from linked table
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                    permissions: Array.from(permSet),
                    subscriptionFeatures,
                    navigation,
                },
            });
        }
        catch (error) {
            console.error("Get new profile error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get profile",
            });
        }
    }
    /**
     * Google User login with tenant context
     */
    static async googleLogin(req, res) {
        try {
            const { token } = req.body;
            if (!token) {
                res.status(400).json({
                    success: false,
                    error: "Google access token is required",
                });
                return;
            }
            // Ensure we have tenant context for login
            if (!req.tenantId || !req.tenant) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context is required for login",
                });
                return;
            }
            // Fetch user info from Google using access token
            let googleUser;
            try {
                const response = await axios_1.default.get("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                googleUser = response.data;
            }
            catch (err) {
                console.error("Failed to verify Google access token:", err);
                res.status(400).json({
                    success: false,
                    error: "Invalid Google token",
                });
                return;
            }
            if (!googleUser || !googleUser.email) {
                res.status(400).json({
                    success: false,
                    error: "Failed to retrieve email from Google",
                });
                return;
            }
            const email = googleUser.email.toLowerCase().trim();
            // Find user by email within the tenant
            const user = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.user.findFirst({
                    where: {
                        OR: [
                            { workEmail: email },
                            { personalEmail: email },
                        ],
                        tenantId: req.tenantId,
                        isActive: true,
                    },
                    include: {
                        tenant: true,
                        employee: true,
                        position: {
                            select: {
                                id: true,
                                title: true,
                                code: true,
                            },
                        },
                    },
                });
            });
            if (!user) {
                res.status(401).json({
                    success: false,
                    error: "No account found matching this email in this tenant",
                });
                return;
            }
            // Check if tenant is active
            if (!user.tenant.isActive) {
                res.status(403).json({
                    success: false,
                    error: "Account suspended",
                });
                return;
            }
            // Create auth user object for token generation
            const authUser = {
                id: user.id,
                tenantId: user.tenantId,
                email: user.workEmail,
                role: user.role,
                position: user.position?.title || null,
                name: user.name,
            };
            // Generate token pair
            const { accessToken, refreshToken } = jwt_1.JWTUtils.generateTokenPair(authUser);
            // Store refresh token in database
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                await client.refreshToken.create({
                    data: {
                        token: refreshToken,
                        userId: user.id,
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                    },
                });
            });
            // Set refresh token cookie
            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: "/", // Ensure cookie is available for all paths
            });
            // Load permissions
            const permSet = await rbac_service_1.RBACService.getUserPermissions(user.id, user.tenantId, user.role);
            // Fetch subscription features and build dynamic navigation
            await subscriptions_1.subscriptionService.invalidateTenantSubscription(user.tenantId);
            // Scope to the brand door this request came through, so a tenant holding
            // both subscriptions gets the shell they actually asked for.
            const requestProduct = (0, brand_1.productFromRequest)(req);
            const subscriptionFeatures = await subscriptions_1.featureResolverService.getTenantFeatures(user.tenantId, requestProduct ? requestProduct.toUpperCase() : undefined);
            const navigation = await subscriptions_1.navigationService.buildNavigation(permSet, subscriptionFeatures);
            // Return user data and access token
            const loginResponse = {
                success: true,
                accessToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.workEmail,
                    workEmail: user.workEmail,
                    personalEmail: user.personalEmail,
                    role: user.role,
                    position: user.position ? { id: user.position.id, title: user.position.title } : null,
                    tenantId: user.tenantId,
                    tenantName: user.tenant.name,
                    tenantLogo: user.tenant.settings?.logoUrl || null,
                    avatarUrl: user.avatarUrl,
                    isActive: user.isActive,
                    permissions: Array.from(permSet),
                    subscriptionFeatures,
                    navigation,
                },
                message: "Login successful",
            };
            // Populate req.user temporarily for transaction history logging
            req.user = {
                id: user.id,
                email: user.workEmail,
                name: user.name,
                tenantId: user.tenantId,
                role: user.role,
                position: user.position?.title || null,
            };
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.AUTH,
                page: transactionHistory_1.Page.LOGIN,
                action: transactionHistory_1.Action.LOGIN,
                actionLabel: `User ${user.name || user.workEmail} logged in with Google SSO`,
                entityType: transactionHistory_1.EntityType.SESSION,
                entityId: user.id,
                entityLabel: user.workEmail,
                metadata: {
                    ip: req.ip ?? req.socket?.remoteAddress ?? null,
                    userAgent: req.headers["user-agent"] ?? null,
                },
            });
            res.status(200).json(loginResponse);
        }
        catch (error) {
            console.error("Google login error:", error);
            res.status(500).json({
                success: false,
                error: "Google login failed",
            });
        }
    }
    /**
     * Microsoft User login with tenant context
     */
    static async microsoftLogin(req, res) {
        try {
            const { token } = req.body;
            if (!token) {
                res.status(400).json({
                    success: false,
                    error: "Microsoft access token is required",
                });
                return;
            }
            // Ensure we have tenant context for login
            if (!req.tenantId || !req.tenant) {
                res.status(400).json({
                    success: false,
                    error: "Tenant context is required for login",
                });
                return;
            }
            // Fetch user info from Microsoft using access token
            let msUser;
            try {
                const response = await axios_1.default.get("https://graph.microsoft.com/v1.0/me", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                msUser = response.data;
            }
            catch (err) {
                console.error("Failed to verify Microsoft access token:", err);
                res.status(400).json({
                    success: false,
                    error: "Invalid Microsoft token",
                });
                return;
            }
            if (!msUser || !(msUser.mail || msUser.userPrincipalName)) {
                res.status(400).json({
                    success: false,
                    error: "Failed to retrieve email from Microsoft",
                });
                return;
            }
            const email = (msUser.mail || msUser.userPrincipalName).toLowerCase().trim();
            // Find user by email within the tenant
            const user = await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                return await client.user.findFirst({
                    where: {
                        OR: [
                            { workEmail: email },
                            { personalEmail: email },
                        ],
                        tenantId: req.tenantId,
                        isActive: true,
                    },
                    include: {
                        tenant: true,
                        employee: true,
                        position: {
                            select: {
                                id: true,
                                title: true,
                                code: true,
                            },
                        },
                    },
                });
            });
            if (!user) {
                res.status(401).json({
                    success: false,
                    error: "No account found matching this email in this tenant",
                });
                return;
            }
            // Check if tenant is active
            if (!user.tenant.isActive) {
                res.status(403).json({
                    success: false,
                    error: "Account suspended",
                });
                return;
            }
            // Create auth user object for token generation
            const authUser = {
                id: user.id,
                tenantId: user.tenantId,
                email: user.workEmail,
                role: user.role,
                position: user.position?.title || null,
                name: user.name,
            };
            // Generate token pair
            const { accessToken, refreshToken } = jwt_1.JWTUtils.generateTokenPair(authUser);
            // Store refresh token in database
            await database_1.tenantAwarePrisma.withTenant(req.tenantId, async (client) => {
                await client.refreshToken.create({
                    data: {
                        token: refreshToken,
                        userId: user.id,
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                    },
                });
            });
            // Set refresh token cookie
            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: "/", // Ensure cookie is available for all paths
            });
            // Load permissions
            const permSet = await rbac_service_1.RBACService.getUserPermissions(user.id, user.tenantId, user.role);
            // Fetch subscription features and build dynamic navigation
            await subscriptions_1.subscriptionService.invalidateTenantSubscription(user.tenantId);
            // Scope to the brand door this request came through, so a tenant holding
            // both subscriptions gets the shell they actually asked for.
            const requestProduct = (0, brand_1.productFromRequest)(req);
            const subscriptionFeatures = await subscriptions_1.featureResolverService.getTenantFeatures(user.tenantId, requestProduct ? requestProduct.toUpperCase() : undefined);
            const navigation = await subscriptions_1.navigationService.buildNavigation(permSet, subscriptionFeatures);
            // Return user data and access token
            const loginResponse = {
                success: true,
                accessToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.workEmail,
                    workEmail: user.workEmail,
                    personalEmail: user.personalEmail,
                    role: user.role,
                    position: user.position ? { id: user.position.id, title: user.position.title } : null,
                    tenantId: user.tenantId,
                    tenantName: user.tenant.name,
                    tenantLogo: user.tenant.settings?.logoUrl || null,
                    avatarUrl: user.avatarUrl,
                    isActive: user.isActive,
                    permissions: Array.from(permSet),
                    subscriptionFeatures,
                    navigation,
                },
                message: "Login successful",
            };
            // Populate req.user temporarily for transaction history logging
            req.user = {
                id: user.id,
                email: user.workEmail,
                name: user.name,
                tenantId: user.tenantId,
                role: user.role,
                position: user.position?.title || null,
            };
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.AUTH,
                page: transactionHistory_1.Page.LOGIN,
                action: transactionHistory_1.Action.LOGIN,
                actionLabel: `User ${user.name || user.workEmail} logged in with Microsoft SSO`,
                entityType: transactionHistory_1.EntityType.SESSION,
                entityId: user.id,
                entityLabel: user.workEmail,
                metadata: {
                    ip: req.ip ?? req.socket?.remoteAddress ?? null,
                    userAgent: req.headers["user-agent"] ?? null,
                },
            });
            res.status(200).json(loginResponse);
        }
        catch (error) {
            console.error("Microsoft login error:", error);
            res.status(500).json({
                success: false,
                error: "Microsoft login failed",
            });
        }
    }
    static async forgotPassword(req, res) {
        try {
            const { email, tenantSubdomain } = req.body;
            if (!email) {
                res.status(400).json({ success: false, error: "Email is required" });
                return;
            }
            let tenantCondition = {};
            // Look up tenant based on subdomain if provided
            if (tenantSubdomain) {
                const tenant = await database_1.prisma.tenant.findFirst({
                    where: { subdomain: String(tenantSubdomain).toLowerCase(), isActive: true }
                });
                if (tenant) {
                    tenantCondition = { tenantId: tenant.id };
                }
            }
            // We still use a generic success message to prevent email enumeration
            const genericResponse = {
                success: true,
                message: "If an account with that email exists, a password reset link has been sent.",
            };
            const user = await database_1.prisma.user.findFirst({
                where: {
                    workEmail: email.toLowerCase(),
                    isActive: true,
                    ...tenantCondition
                },
                include: { tenant: true }
            });
            if (!user) {
                res.status(200).json(genericResponse);
                return;
            }
            // Invalidate existing unused tokens for this user
            await database_1.prisma.password_reset_tokens.updateMany({
                where: { user_id: user.id, used: false },
                data: { used: true }
            });
            // Generate token
            const rawToken = crypto_1.default.randomBytes(32).toString('hex');
            const hashedToken = crypto_1.default.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
            await database_1.prisma.password_reset_tokens.create({
                data: {
                    user_id: user.id,
                    token: hashedToken,
                    expires_at: expiresAt,
                    used: false
                }
            });
            // Send email.
            //
            // The reset link has to land on the brand the user was actually looking
            // at when they asked — someone who hit "forgot password" on
            // acme.testiez.com and receives a zukvo.com link will assume it is
            // phishing and not click it. brandForRequest() reads the Origin; the
            // subdomain still comes from the tenant so the link reaches their own
            // workspace either way.
            const brand = await (0, brand_1.resolveBrand)(req, user.tenantId);
            const frontendUrl = (0, brand_1.tenantOrigin)(user.tenant?.subdomain, brand);
            const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;
            const emailService = new emailService_1.EmailService();
            await emailService.sendPasswordResetEmail({
                to: user.workEmail,
                displayName: user.name,
                username: user.workEmail,
                resetLink
            }, user.tenantId);
            // Audit Log
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.AUTH,
                page: transactionHistory_1.Page.LOGIN,
                action: transactionHistory_1.Action.UPDATE,
                actionLabel: `Password reset requested for ${user.workEmail}`,
                entityType: "user",
                entityId: user.id,
                entityLabel: user.workEmail,
                metadata: { ip: req.ip ?? null }
            });
            res.status(200).json(genericResponse);
        }
        catch (error) {
            console.error("Forgot password error:", error);
            res.status(500).json({ success: false, error: "Internal server error" });
        }
    }
    static async validateResetToken(req, res) {
        try {
            const { token } = req.query;
            if (!token || typeof token !== "string") {
                res.status(400).json({ success: false, error: "Invalid token format" });
                return;
            }
            const hashedToken = crypto_1.default.createHash('sha256').update(token).digest('hex');
            const resetToken = await database_1.prisma.password_reset_tokens.findFirst({
                where: { token: hashedToken, used: false, expires_at: { gt: new Date() } }
            });
            if (!resetToken) {
                res.status(400).json({ success: false, error: "Invalid or expired token" });
                return;
            }
            res.status(200).json({ success: true, message: "Token is valid" });
        }
        catch (error) {
            console.error("Validate token error:", error);
            res.status(500).json({ success: false, error: "Internal server error" });
        }
    }
    static async resetPassword(req, res) {
        try {
            const { token, newPassword } = req.body;
            if (!token || !newPassword) {
                res.status(400).json({ success: false, error: "Token and new password are required" });
                return;
            }
            // Strong password validation on backend
            const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
            if (!passwordRegex.test(newPassword)) {
                res.status(400).json({ success: false, error: "Password must be at least 8 characters long and contain numbers and special characters." });
                return;
            }
            const hashedToken = crypto_1.default.createHash('sha256').update(token).digest('hex');
            const resetToken = await database_1.prisma.password_reset_tokens.findFirst({
                where: { token: hashedToken, used: false, expires_at: { gt: new Date() } }
            });
            if (!resetToken || !resetToken.user_id) {
                res.status(400).json({ success: false, error: "Invalid or expired token" });
                return;
            }
            const user = await database_1.prisma.user.findUnique({
                where: { id: resetToken.user_id }
            });
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            // Update password
            const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 10);
            await database_1.prisma.$transaction(async (tx) => {
                await tx.user.update({
                    where: { id: user.id },
                    data: { passwordHash: newPasswordHash }
                });
                await tx.password_reset_tokens.update({
                    where: { id: resetToken.id },
                    data: { used: true }
                });
                // Revoke active sessions
                await tx.refreshToken.deleteMany({
                    where: { userId: user.id }
                });
            });
            // Audit Log
            (0, transactionHistory_1.recordTransaction)({
                req,
                section: transactionHistory_1.Section.ADMIN,
                module: transactionHistory_1.Module.AUTH,
                page: transactionHistory_1.Page.LOGIN,
                action: transactionHistory_1.Action.UPDATE,
                actionLabel: `Password successfully reset for ${user.workEmail}`,
                entityType: "user",
                entityId: user.id,
                entityLabel: user.workEmail,
                metadata: { ip: req.ip ?? null }
            });
            res.status(200).json({ success: true, message: "Password has been successfully reset" });
        }
        catch (error) {
            console.error("Reset password error:", error);
            res.status(500).json({ success: false, error: "Internal server error" });
        }
    }
}
exports.AuthController = AuthController;
exports.default = AuthController;
//# sourceMappingURL=authController.js.map