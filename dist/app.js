"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("module-alias/register");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_session_1 = __importDefault(require("express-session"));
// Import configurations
const database_1 = require("@/config/database");
const salaryComponentRoutes_1 = __importDefault(require("@/routes/salaryComponentRoutes"));
const gradeRoutes_1 = __importDefault(require("@/routes/gradeRoutes"));
const companyRoutes_1 = __importDefault(require("./routes/companyRoutes"));
const auth_1 = __importDefault(require("@/routes/auth"));
const tenants_1 = __importDefault(require("@/routes/tenants"));
const projects_1 = __importDefault(require("@/routes/projects"));
const tickets_1 = __importDefault(require("@/routes/tickets"));
const attendance_1 = __importDefault(require("@/routes/attendance"));
const clients_1 = __importDefault(require("@/routes/clients"));
const members_1 = __importDefault(require("@/routes/members"));
const shifts_1 = __importDefault(require("@/routes/shifts"));
const transactions_1 = __importDefault(require("@/routes/transactions"));
const releasePlans_1 = __importDefault(require("@/routes/releasePlans"));
const settings_1 = __importDefault(require("@/routes/settings"));
const user_1 = __importDefault(require("@/routes/user"));
const dailyUpdates_1 = __importDefault(require("@/routes/dailyUpdates"));
const dashboard_1 = __importDefault(require("@/routes/dashboard"));
const leaves_1 = __importDefault(require("@/routes/leaves"));
const leaveTypeRoutes_1 = __importDefault(require("@/routes/leaveTypeRoutes"));
const customerRoutes_1 = __importDefault(require("@/routes/customerRoutes"));
const invoiceSettingsRoutes_1 = __importDefault(require("@/routes/invoiceSettingsRoutes"));
const invoice_1 = __importDefault(require("@/routes/invoice"));
//import invoicedownload from "@/routes/invoiceDownload"
const buckets_1 = __importDefault(require("@/routes/buckets"));
const trash_1 = __importDefault(require("@/routes/trash"));
const sprintCompletion_1 = __importDefault(require("@/routes/sprintCompletion"));
const fixedHolidays_1 = __importDefault(require("@/routes/fixedHolidays"));
const documenthub_1 = __importDefault(require("@/routes/documenthub"));
const channels_1 = __importDefault(require("@/routes/channels"));
const messages_1 = __importDefault(require("@/routes/messages"));
const timesheet_1 = __importDefault(require("@/routes/timesheet"));
const companyGovernmentHoliday_routes_1 = __importDefault(require("./routes/companyGovernmentHoliday.routes"));
const leaveAdjustmentRoutes_1 = __importDefault(require("./routes/leaveAdjustmentRoutes"));
const reimbursementCategory_1 = __importDefault(require("@/routes/reimbursementCategory"));
const employmentTypeRoutes_1 = __importDefault(require("@/routes/employmentTypeRoutes"));
const repositoryRoutes_1 = __importDefault(require("@/routes/repositoryRoutes"));
const departmentRoutes_1 = __importDefault(require("@/routes/departmentRoutes"));
const subDepartmentRoutes_1 = __importDefault(require("@/routes/subDepartmentRoutes"));
const positionRoutes_1 = __importDefault(require("@/routes/positionRoutes"));
const calendar_1 = __importDefault(require("@/routes/calendar"));
const leaveOriginRoutes_1 = __importDefault(require("@/routes/leaveOriginRoutes"));
const emailHistoryRoutes_1 = __importDefault(require("@/routes/emailHistoryRoutes"));
// Load environment
dotenv_1.default.config();
// Create Express application
const app = (0, express_1.default)();
// Body parsing middleware
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || "your-fallback-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === "production", // true in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
// Connect to PostgreSQL
const allowedOrigins = [
    "http://localhost:3000", // Local development
    "http://localhost:3005", // Local development for internal app
    "https://zithmi.vercel.app", // Vercel production URL
    "https://www.zithtech.com",
    "https://zithspace.com",
    "https://zithmi.zithspace.com",
    /\.zithspace\.com$/,
    /\.zithtech\.com$/, // allow any subdomain like dinesh.zithtech.com
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true); // allow server-to-server
        if (allowedOrigins.some((o) => (typeof o === "string" && o === origin) ||
            (o instanceof RegExp && o.test(origin)))) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
// Cookie parsing middleware
app.use((0, cookie_parser_1.default)());
// Compression middleware
app.use((0, compression_1.default)());
// Logging middleware
if (process.env.NODE_ENV === "development") {
    app.use((0, morgan_1.default)("dev"));
}
else {
    app.use((0, morgan_1.default)("combined"));
}
// Global rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"), // 100 requests per window
    message: {
        success: false,
        error: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// app.use(limiter);
(0, database_1.connectDatabase)().catch(console.error);
// Health check endpoint (no tenant context required)
app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Zithmi Backend V2 (Multi-Tenant) is running",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: "2.0.0",
    });
});
// app.use("/api", optionalTenantContext);
// API routes
app.use("/api/leave-adjustments", leaveAdjustmentRoutes_1.default);
app.use('/api/company-government-holidays', companyGovernmentHoliday_routes_1.default);
app.use("/api/leave-origins", leaveOriginRoutes_1.default);
app.use("/api/fixed-holidays", fixedHolidays_1.default);
app.use("/api/auth", auth_1.default);
app.use("/api/tenants", tenants_1.default);
app.use("/api/projects", projects_1.default);
const publicTickets_1 = __importDefault(require("@/routes/publicTickets"));
app.use("/api/public/tickets", publicTickets_1.default);
app.use("/api/tickets", tickets_1.default);
app.use("/api/attendance", attendance_1.default);
app.use("/api/clients", clients_1.default);
app.use("/api/members", members_1.default);
app.use("/api/shifts", shifts_1.default);
app.use("/api/transactions", transactions_1.default);
app.use("/api/release-plans", releasePlans_1.default);
app.use("/api/settings", settings_1.default);
app.use("/api/user", user_1.default);
app.use("/api/daily-updates", dailyUpdates_1.default);
app.use("/api/dashboard", dashboard_1.default);
app.use("/api/leaves", leaves_1.default);
app.use("/api/reimbursement-category", reimbursementCategory_1.default);
app.use("/api/repositories", repositoryRoutes_1.default);
app.use("/api/leave-types", leaveTypeRoutes_1.default);
app.use("/api/customers", customerRoutes_1.default);
app.use("/api/invoicesetting", invoiceSettingsRoutes_1.default);
app.use("/api/invoices", invoice_1.default);
//app.use("/api/invoice",invoicedownload)
app.use("/api/buckets", buckets_1.default);
app.use("/api/trash", trash_1.default);
app.use("/api/sprint-completion", sprintCompletion_1.default);
app.use("/api/salary-components", salaryComponentRoutes_1.default);
app.use("/api/companies", companyRoutes_1.default);
app.use("/api/grades", gradeRoutes_1.default);
app.use("/api/departments", departmentRoutes_1.default);
app.use("/api/sub-departments", subDepartmentRoutes_1.default);
app.use("/api/positions", positionRoutes_1.default);
app.use("/api/employment-types", employmentTypeRoutes_1.default);
app.use("/api/documenthub", documenthub_1.default);
app.use("/api/channels", channels_1.default);
app.use("/api/channels/:channelId/messages", messages_1.default);
app.use('/api/email-history', emailHistoryRoutes_1.default);
app.use("/api/timesheets", timesheet_1.default);
app.use("/api/zoho", calendar_1.default);
// Public document access (no auth required)
const documentHubController_1 = require("@/controllers/documentHubController");
app.get("/api/public/document/:shareToken", documentHubController_1.DocumentHubController.getPublicDocument);
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "API is running with tenant context",
        tenantId: req.tenantId || "No tenant context",
        tenantName: req.tenant?.name || "No tenant context",
        timestamp: new Date().toISOString(),
    });
});
// Handle Socket.io requests (to prevent)
app.all("/socket.io/*", (req, res) => {
    res.status(200).json({
        success: false,
        message: "Socket.io not configured on this server",
        note: "WebSocket connections are not required for this application",
    });
});
// Handle preflight requests
app.options("*", (req, res) => {
    res.status(200).end();
});
// 404 handler
app.use("*", (req, res) => {
    res.status(404).json({
        success: false,
        error: "Route not found",
        path: req.originalUrl,
        method: req.method,
        message: "The requested endpoint does not exist",
    });
});
// Global error handler
app.use((err, req, res, next) => {
    console.error("Global error handler:", err);
    // Mongoose validation error (keeping for compatibility during migration)
    if (err.name === "ValidationError") {
        const errors = Object.values(err.errors).map((e) => e.message);
        res.status(400).json({
            success: false,
            error: "Validation Error",
            details: errors,
        });
        return;
    }
    // Prisma errors
    if (err.code === "P2002") {
        const field = err.meta?.target?.[0] || "field";
        res.status(409).json({
            success: false,
            error: `${field} already exists`,
            code: "DUPLICATE_ENTRY",
        });
        return;
    }
    if (err.code === "P2025") {
        res.status(404).json({
            success: false,
            error: "Record not found",
            code: "NOT_FOUND",
        });
        return;
    }
    // JWT errors
    if (err.name === "JsonWebTokenError") {
        res.status(401).json({
            success: false,
            error: "Invalid token",
            code: "INVALID_TOKEN",
        });
        return;
    }
    if (err.name === "TokenExpiredError") {
        res.status(401).json({
            success: false,
            error: "Token expired",
            code: "TOKEN_EXPIRED",
        });
        return;
    }
    // CORS errors
    if (err.message === "Not allowed by CORS") {
        res.status(403).json({
            success: false,
            error: "CORS policy violation",
            code: "CORS_ERROR",
        });
        return;
    }
    //comment added
    // Rate limit errors
    if (err.statusCode === 429) {
        res.status(429).json({
            success: false,
            error: "Too many requests",
            code: "RATE_LIMIT_EXCEEDED",
        });
        return;
    }
    // Default error
    const statusCode = err.statusCode || err.status || 500;
    const message = process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error";
    res.status(statusCode).json({
        success: false,
        error: message,
        code: err.code || "INTERNAL_ERROR",
        ...(process.env.NODE_ENV === "development" && {
            stack: err.stack,
            details: err,
        }),
    });
});
// Start server
const PORT = parseInt(process.env.PORT || "5000");
const server = app.listen(PORT, () => {
    console.log(`Zithmi Backend V2 (Multi-Tenant) running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Multi-tenant API: http://localhost:${PORT}/api/health`);
    console.log(`Database: PostgreSQL with Prisma`);
    console.log(`Features: Multi-tenant, RLS, Enhanced Auth, JWT`);
    // Initialize Socket.io
    const { socketService } = require("@/services/socketService");
    socketService.initialize(server);
    // Start trash auto-purge cron job
    const { startTrashAutoPurgeJob } = require("@/jobs/trashAutoPurge");
    startTrashAutoPurgeJob();
});
// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
        console.log("HTTP server closed");
        try {
            await (0, database_1.disconnectDatabase)();
            console.log("Database connections closed");
        }
        catch (error) {
            console.error("Error closing database connections:", error);
        }
        console.log("Process terminated");
        process.exit(0);
    });
    // Force close after 30 seconds
    setTimeout(() => {
        console.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
    }, 30000);
};
// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
    console.error("Unhandled Promise Rejection:", err);
    gracefulShutdown("Unhandled Promise Rejection");
});
// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=app.js.map