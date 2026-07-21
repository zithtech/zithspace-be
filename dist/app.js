"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load backend-local .env first (highest priority), then fall back to parent
// monorepo .env so a single root file works for both apps. dotenv.config()
// won't override variables that are already set, so order = priority.
dotenv_1.default.config();
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
if (process.env.NODE_ENV !== "development") {
    require("module-alias/register");
}
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_session_1 = __importDefault(require("express-session"));
// Import configurations
const database_1 = require("@/config/database");
const gradeRoutes_1 = __importDefault(require("@/routes/gradeRoutes"));
const companyRoutes_1 = __importDefault(require("./routes/companyRoutes"));
const auth_1 = __importDefault(require("@/routes/auth"));
const tenants_1 = __importDefault(require("@/routes/tenants"));
const projects_1 = __importDefault(require("@/routes/projects"));
const squad_1 = __importDefault(require("@/routes/squad"));
const tickets_1 = __importDefault(require("@/routes/tickets"));
const jobRequisition_routes_1 = __importDefault(require("./routes/jobRequisition.routes"));
const attendance_1 = __importDefault(require("@/routes/attendance"));
const clients_1 = __importDefault(require("@/routes/clients"));
const clientsV2_1 = __importDefault(require("@/routes/clientsV2"));
const members_1 = __importDefault(require("@/routes/members"));
const shifts_1 = __importDefault(require("@/routes/shifts"));
const transactions_1 = __importDefault(require("@/routes/transactions"));
const transactionHistory_1 = __importDefault(require("@/routes/transactionHistory"));
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
const invoiceTemplate_1 = __importDefault(require("@/routes/invoiceTemplate"));
const categoryRoutes_1 = __importDefault(require("@/routes/categoryRoutes"));
const buckets_1 = __importDefault(require("@/routes/buckets"));
const trash_1 = __importDefault(require("@/routes/trash"));
const bugList_1 = __importDefault(require("@/routes/bugList"));
const sprintCompletion_1 = __importDefault(require("@/routes/sprintCompletion"));
const sprintReport_1 = __importDefault(require("@/routes/sprintReport"));
const sprintReports_1 = __importDefault(require("@/routes/sprintReports"));
const fixedHolidays_1 = __importDefault(require("@/routes/fixedHolidays"));
const documenthub_1 = __importDefault(require("@/routes/documenthub"));
const aiSettings_1 = __importDefault(require("@/routes/aiSettings"));
const channels_1 = __importDefault(require("@/routes/channels"));
const messages_1 = __importDefault(require("@/routes/messages"));
const shortcut_routes_1 = __importDefault(require("@/routes/shortcut.routes"));
const employeeWorkDetailes_1 = __importDefault(require("@/routes/employeeWorkDetailes"));
const employeeTimeline_1 = __importDefault(require("@/routes/employeeTimeline"));
const skillExperience_routes_1 = __importDefault(require("@/routes/skillExperience.routes"));
const escalationCategoryV2_routes_1 = __importDefault(require("@/routes/escalationCategoryV2.routes"));
const escalationStatus_RoutesV2_1 = __importDefault(require("@/routes/escalationStatus.RoutesV2"));
const escalationPriorities_Routes_1 = __importDefault(require("@/routes/escalationPriorities.Routes"));
// main
const onboardingRoutes_1 = __importDefault(require("@/routes/onboardingRoutes"));
const publicOnboarding_routes_1 = __importDefault(require("@/routes/publicOnboarding.routes"));
const auth_2 = __importDefault(require("@/routes/auth"));
const publicTickets_1 = __importDefault(require("@/routes/publicTickets"));
const publicDocuments_1 = __importDefault(require("@/routes/publicDocuments"));
const clientPortal_1 = __importDefault(require("@/routes/clientPortal"));
const portalTickets_1 = __importDefault(require("@/routes/portalTickets"));
const moms_1 = __importDefault(require("@/routes/moms"));
const changeRequests_1 = __importDefault(require("@/routes/changeRequests"));
const approvals_1 = __importDefault(require("@/routes/approvals"));
const environments_1 = __importDefault(require("@/routes/environments"));
const deployments_1 = __importDefault(require("@/routes/deployments"));
const team_1 = __importDefault(require("@/routes/team"));
const milestones_1 = __importDefault(require("@/routes/milestones"));
const milestoneItems_1 = __importDefault(require("@/routes/milestoneItems"));
const clientReleases_1 = __importDefault(require("@/routes/clientReleases"));
const employeeSettingsRoutes_1 = __importDefault(require("@/routes/employeeSettingsRoutes"));
const implementationPartner_1 = __importDefault(require("@/routes/implementationPartner"));
const recruitmentClient_1 = __importDefault(require("@/routes/recruitmentClient"));
const vendor_1 = __importDefault(require("@/routes/vendor"));
const timesheet_1 = __importDefault(require("@/routes/timesheet"));
const timeTracking_1 = __importDefault(require("./routes/timeTracking"));
const proxyRoutes_1 = __importDefault(require("@/routes/proxyRoutes"));
const companyGovernmentHoliday_routes_1 = __importDefault(require("@/routes/companyGovernmentHoliday.routes"));
const leaveAdjustmentRoutes_1 = __importDefault(require("./routes/leaveAdjustmentRoutes"));
const leaveAllocationRoutes_1 = __importDefault(require("@/routes/leaveAllocationRoutes"));
const reimbursementCategory_1 = __importDefault(require("@/routes/reimbursementCategory"));
const employmentTypeRoutes_1 = __importDefault(require("@/routes/employmentTypeRoutes"));
const repositoryRoutes_1 = __importDefault(require("@/routes/repositoryRoutes"));
const departmentRoutes_1 = __importDefault(require("@/routes/departmentRoutes"));
const subDepartmentRoutes_1 = __importDefault(require("@/routes/subDepartmentRoutes"));
const positionRoutes_1 = __importDefault(require("@/routes/positionRoutes"));
const calendar_1 = __importDefault(require("@/routes/calendar"));
const mail_1 = __importDefault(require("@/routes/mail"));
const notifications_1 = __importDefault(require("@/routes/notifications")); // Web push notification routes
const employeeExit_routes_1 = __importDefault(require("@/routes/employeeExit.routes"));
const leaveOriginRoutes_1 = __importDefault(require("@/routes/leaveOriginRoutes"));
const emailHistoryRoutes_1 = __importDefault(require("@/routes/emailHistoryRoutes"));
const leaveRequestRoutes_1 = __importDefault(require("@/routes/leaveRequestRoutes"));
const leaveBalanceRoutes_1 = __importDefault(require("@/routes/leaveBalanceRoutes"));
const routes_1 = __importDefault(require("@/modules/leave-v2/routes"));
const routes_2 = __importDefault(require("@/modules/performance-report/routes"));
const routes_3 = __importDefault(require("@/modules/payroll/routes"));
const routes_4 = __importDefault(require("@/modules/reimbursement-v2/routes"));
const reimbursementConfig_1 = __importDefault(require("@/routes/reimbursementConfig"));
const reimbursementsettingsRoutes_1 = __importDefault(require("@/routes/reimbursementsettingsRoutes"));
const reimbursementcreateRoutes_1 = __importDefault(require("@/routes/reimbursementcreateRoutes"));
const rbac_1 = __importDefault(require("@/routes/rbac"));
const candidateForm_routes_1 = __importDefault(require("@/routes/candidateForm.routes"));
const employeeAssets_routes_1 = __importDefault(require("@/routes/employeeAssets.routes"));
const noticePolicy_routes_1 = __importDefault(require("@/routes/noticePolicy.routes"));
const exitType_routes_1 = __importDefault(require("@/routes/exitType.routes"));
const reasonForExit_routes_1 = __importDefault(require("@/routes/reasonForExit.routes"));
const exitApprovalWorkflow_routes_1 = __importDefault(require("@/routes/exitApprovalWorkflow.routes"));
const recruitmentStatus_routes_1 = __importDefault(require("@/routes/recruitmentStatus.routes"));
const recruitmentAction_routes_1 = __importDefault(require("@/routes/recruitmentAction.routes"));
const candidateRoutes_1 = __importDefault(require("@/routes/candidateRoutes"));
const companyLocationRoutes_1 = __importDefault(require("@/routes/companyLocationRoutes"));
const openingManagementRoutes_1 = __importDefault(require("@/routes/openingManagementRoutes"));
const RabbitMQService_1 = require("@/utils/RabbitMQService");
const CalendarSyncWorker_1 = require("@/workers/CalendarSyncWorker");
const MailSyncWorker_1 = require("@/workers/MailSyncWorker");
//import { CentralMailWorker } from "@/workers/CentralMailWorker";
const MailController_1 = require("@/controllers/MailController");
const lead_routes_1 = __importDefault(require("@/routes/lead.routes"));
const leadSettings_routes_1 = __importDefault(require("@/routes/leadSettings.routes"));
const webInquiry_routes_1 = __importDefault(require("@/routes/webInquiry.routes"));
const generate_routes_1 = __importDefault(require("@/routes/generate.routes"));
const landing_1 = __importDefault(require("@/routes/landing"));
// import escalationSettingsRoutes from "./routes/escalationSettingsRoutes";
// import escalationRoutes from "./routes/escalationRoutes";
const escalationRoutesV2_1 = __importDefault(require("./routes/escalationRoutesV2"));
const proposals_1 = __importDefault(require("@/routes/proposals"));
const proposalSections_1 = __importDefault(require("@/routes/proposalSections"));
const proposalTemplates_1 = __importDefault(require("@/routes/proposalTemplates"));
const projectOverviewRoutes_1 = __importDefault(require("./routes/projectOverviewRoutes"));
const socketService_1 = require("@/services/socketService");
const attendancePool_1 = require("@/db/attendancePool");
// Load environment
dotenv_1.default.config();
console.log("🚀 API Starting up...");
console.log("📅 Mounting calendar routes at /api/calendar");
console.log("🤖 DevBot deployment test — 2026-03-22");
// Create Express application
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const allowedOrigins = [
    "http://localhost:3000", // Local development
    "http://localhost:3005", // Local development for internal app
    /^http:\/\/localhost:\d+$/, // Allow any localhost port (e.g. Vite 5173)
    /^http:\/\/[^.]+\.localhost(:\d+)?$/, // *.localhost subdomains (dev)
    "https://zithmi.vercel.app", // Vercel production URL
    "https://www.zithtech.com",
    "https://zithspace.com",
    "https://zithmi.zithspace.com",
    /\.zithspace\.com$/,
    /\.zithtech\.com$/, // allow any subdomain like dinesh.zithtech.com
    "https://zukvo.com",
    /\.zukvo\.com$/, // allow any tenant subdomain like zithmi.zukvo.com
    /^chrome-extension:\/\/[a-z]{32}$/, // Allow Chrome extensions
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true); // allow server-to-server
        if (allowedOrigins.some((o) => (typeof o === "string" && o === origin) ||
            (o instanceof RegExp && o.test(origin)))) {
            return callback(null, true);
        }
        console.warn(`[CORS] Denied origin: ${origin}`);
        return callback(null, false);
    },
    credentials: true,
}));
// Body parsing middleware
app.use(express_1.default.json({ limit: "30mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "30mb" }));
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || "your-fallback-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === "production", // true in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));
// Connect to PostgreSQL
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
// connectDatabase().catch(console.error);
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
// Middleware to strip tenant prefix from project codes in JSON responses
function stripTenantPrefix(obj, tenantId) {
    if (typeof obj === "string") {
        const globalPrefix = new RegExp(`${tenantId}_`, "g");
        return obj.replace(globalPrefix, "");
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => stripTenantPrefix(item, tenantId));
    }
    if (obj !== null && typeof obj === "object") {
        if (obj instanceof Date || obj instanceof RegExp) {
            return obj;
        }
        if (Buffer.isBuffer(obj)) {
            return obj;
        }
        const newObj = {};
        for (const key of Object.keys(obj)) {
            newObj[key] = stripTenantPrefix(obj[key], tenantId);
        }
        return newObj;
    }
    return obj;
}
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (body) {
        if (req.tenantId && body) {
            try {
                body = stripTenantPrefix(body, req.tenantId);
            }
            catch (err) {
                console.error("Error cleaning tenant prefix from response:", err);
            }
        }
        return originalJson.call(this, body);
    };
    next();
});
// API routes
app.use("/api/leave-adjustments", leaveAdjustmentRoutes_1.default);
app.use("/api/company-government-holidays", companyGovernmentHoliday_routes_1.default);
app.use("/api/leave-origins", leaveOriginRoutes_1.default);
app.use("/api/fixed-holidays", fixedHolidays_1.default);
app.get("/api/direct-test", (req, res) => {
    res.json({ success: true, message: "Direct app.get works" });
});
app.get("/api/debug-ping-unique", (req, res) => res.json({ success: true, message: "Debug route is active" }));
app.use("/api", proxyRoutes_1.default);
app.use("/api/auth", auth_1.default);
app.use("/api/generate", generate_routes_1.default);
app.use("/api/projects", projects_1.default);
app.use("/api/tenants", tenants_1.default);
app.use("/api/landing", landing_1.default);
app.use("/api/calendar", calendar_1.default);
app.use("/api/squads", squad_1.default);
app.use("/api/public/tickets", publicTickets_1.default);
app.use("/api/public/document", publicDocuments_1.default);
app.use("/api/public/onboarding", publicOnboarding_routes_1.default);
app.use("/api/client-portal", clientPortal_1.default);
app.use("/api/portal-tickets", portalTickets_1.default);
app.use("/api/moms", moms_1.default);
app.use("/api/change-requests", changeRequests_1.default);
app.use("/api/approvals", approvals_1.default);
app.use("/api/environments", environments_1.default);
app.use("/api/deployments", deployments_1.default);
app.use("/api/team", team_1.default);
app.use("/api/milestones", milestones_1.default);
app.use("/api/milestone-items", milestoneItems_1.default);
app.use("/api/client-releases", clientReleases_1.default);
app.use("/api/tickets", tickets_1.default);
app.use("/api/recruitment", jobRequisition_routes_1.default);
app.use("/api/attendance", attendance_1.default);
app.use("/api/clients", clients_1.default);
app.use("/api/clients-v2", clientsV2_1.default);
app.use("/api/members", members_1.default);
app.use("/api/shifts", shifts_1.default);
app.use("/api/transactions", transactions_1.default);
app.use("/api/transaction-history", transactionHistory_1.default);
app.use("/api/release-plans", releasePlans_1.default);
app.use("/api/settings", settings_1.default);
//app.use("/api/escalation-settings", escalationSettingsRoutes);
// app.use("/api/escalations", escalationRoutes);
app.use("/api/user", user_1.default);
app.use("/api/daily-updates", dailyUpdates_1.default);
app.use("/api/dashboard", dashboard_1.default);
app.use("/api/leaves", leaves_1.default);
// app.use("/api/reimbursement-category", reimbursement);
app.use("/api/reimbursement-categories", reimbursementCategory_1.default); // plural form
app.use("/api/repositories", repositoryRoutes_1.default);
app.use("/api/leave-types", leaveTypeRoutes_1.default);
app.use("/api/customers", customerRoutes_1.default);
app.use("/api/invoicesetting", invoiceSettingsRoutes_1.default);
app.use("/api/invoices", invoice_1.default);
app.use("/api/proposals", proposals_1.default);
app.use("/api/proposal-sections", proposalSections_1.default);
app.use("/api/proposal-templates", proposalTemplates_1.default);
app.use("/api/invoice-templates", invoiceTemplate_1.default);
app.use("/api/categories", categoryRoutes_1.default);
//app.use("/api/invoice",invoicedownload)
app.use("/api/buckets", buckets_1.default);
app.use("/api/trash", trash_1.default);
app.use("/api/bug-list", bugList_1.default);
app.use("/api/sprint-completion", sprintCompletion_1.default);
app.use("/api/sprint-report", sprintReport_1.default);
app.use("/api/sprint-reports", sprintReports_1.default);
app.use("/api/companies", companyRoutes_1.default);
app.use("/api/grades", gradeRoutes_1.default);
app.use("/api/company-locations", companyLocationRoutes_1.default);
app.use("/api/opening-management", openingManagementRoutes_1.default);
app.use("/api/leads", lead_routes_1.default);
app.use("/api/lead-settings", leadSettings_routes_1.default);
// ── Public web-inquiry endpoint (no auth, any cross-origin website) ──────────
app.use("/api/public/web-inquiry", webInquiry_routes_1.default);
app.use("/api", skillExperience_routes_1.default);
app.use("/api/departments", departmentRoutes_1.default);
app.use("/api/sub-departments", subDepartmentRoutes_1.default);
app.use("/api/positions", positionRoutes_1.default);
app.use("/api/employment-types", employmentTypeRoutes_1.default);
app.use("/api/documenthub", documenthub_1.default);
app.use("/api/ai", aiSettings_1.default);
app.use("/api/channels", channels_1.default);
app.use("/api/channels/:channelId/messages", messages_1.default);
app.use("/api/email-history", emailHistoryRoutes_1.default);
app.use("/api/timesheets", timesheet_1.default);
app.use("/api/zoho", calendar_1.default);
app.get("/api/mail/attachments/download", MailController_1.MailController.downloadAttachment);
app.use("/api/mail", mail_1.default);
app.use("/api/notifications", notifications_1.default);
// app.use("/api/mail-configuration", mailConfigurationRoutes);
app.use("/api/leave-allocation", leaveAllocationRoutes_1.default);
app.use("/api/leave-request", leaveRequestRoutes_1.default);
app.use("/api/leave-balances", leaveBalanceRoutes_1.default);
app.use("/api/v2/leave", routes_1.default);
app.use("/api/v2/payroll", routes_3.default);
app.use("/api/v2/reimbursement", routes_4.default);
app.use("/api/performance-report", routes_2.default);
//Escalation
app.use("/api/escalation-categories", escalationCategoryV2_routes_1.default);
app.use("/api/escalation-statuses", escalationStatus_RoutesV2_1.default);
app.use("/api/escalation-priorities", escalationPriorities_Routes_1.default);
app.use("/api/escalations-v2", escalationRoutesV2_1.default);
app.use("/api/time-tracking", timeTracking_1.default);
app.use("/api/projects", projectOverviewRoutes_1.default);
app.use("/api/candidates", candidateRoutes_1.default);
app.use("/api/recruitment-statuses", recruitmentStatus_routes_1.default);
app.use("/api/recruitment-actions", recruitmentAction_routes_1.default);
app.use("/api/employee-work-details", employeeWorkDetailes_1.default);
app.use("/api/employee-timelines", employeeTimeline_1.default);
app.use("/api/onboarding", onboardingRoutes_1.default);
app.use("/api/reimbursement-configurations", reimbursementConfig_1.default);
app.use("/api/reimbursement-settings", reimbursementsettingsRoutes_1.default);
// Reimbursements (with file upload)
app.use("/api/reimbursements", reimbursementcreateRoutes_1.default);
// app.use("/api/manager/reimbursements", managerReimbursementRoutes);
app.use("/api/profile/new", auth_2.default);
app.use("/api/employeesettings", employeeSettingsRoutes_1.default);
app.use("/api/exit/notice-policy", noticePolicy_routes_1.default);
app.use("/api/exit/exit-type", exitType_routes_1.default);
app.use("/api/exit/reason-for-exit", reasonForExit_routes_1.default);
app.use("/api/exit/approval-workflow", exitApprovalWorkflow_routes_1.default);
app.use("/api/exit/request", employeeExit_routes_1.default);
// RBAC management API
app.use("/api/rbac", rbac_1.default);
// Candidate Form API
app.use("/api/candidate-form", candidateForm_routes_1.default);
app.use("/api/employee-assets", employeeAssets_routes_1.default);
app.use("/api/shortcuts", shortcut_routes_1.default);
// Implementation Partner API
app.use("/api/implementation-partner", implementationPartner_1.default);
// Recruitment Client API
app.use("/api/recruitment-client", recruitmentClient_1.default);
app.use("/api/vendor", vendor_1.default);
// app.use("/api/addresses", addressRoutes);
//app.use("/api/employee_address", addressRoutes);
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
// app.all("/socket.io/*", (req, res) => {
//   res.status(200).json({
//     success: false,
//     message: "Socket.io not configured on this server",
//     note: "WebSocket connections are not required for this application",
//   });
// });
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
let server;
const startServer = async () => {
    try {
        // Connect PostgreSQL
        await (0, database_1.connectDatabase)();
        // Initialize Tables
        const { BidIQModel } = require("./models/BidIQ.model");
        await BidIQModel.initTable();
        const { WebPushSubscriptionModel } = require("./models/WebPushSubscription.model");
        await WebPushSubscriptionModel.initTable();
        // Employee onboarding invite table (raw-SQL module, idempotent)
        const { ensureOnboardingSchema } = require("@/db/onboardingSchema");
        await ensureOnboardingSchema();
        // Performance Report tables (raw-SQL module, idempotent)
        const { ensurePerformanceReportSchema } = require("@/modules/performance-report/db/schema");
        await ensurePerformanceReportSchema();
        // Payroll 2.0 tables (raw-SQL module, forward-only migrations)
        const { runPayrollMigrations } = require("@/modules/payroll/db/migrate");
        await runPayrollMigrations();
        // Connect RabbitMQ & Start Workers
        try {
            await RabbitMQService_1.rabbitMQService.connect();
            await CalendarSyncWorker_1.CalendarSyncWorker.start();
            await MailSyncWorker_1.MailSyncWorker.start();
            // await CentralMailWorker.start();
            console.log("🚀 RabbitMQ connected, Calendar & Mail Sync Workers started");
        }
        catch (mqError) {
            console.error("❌ RabbitMQ initialization failed:", mqError.message);
            // In a SaaS environment, we log and continue,
            // as the app might still handle HTTP requests while MQ recovers.
        }
        // Leave 2.0 accrual scheduler + worker (no-op unless LEAVE_ACCRUAL_ENABLED=true)
        const { initLeaveAccrual } = require("@/modules/leave-v2/jobs");
        await initLeaveAccrual();
        // Payroll 2.0 async payslip worker (no-op unless PAYROLL_ASYNC_PAYSLIPS=true)
        if (process.env.PAYROLL_ASYNC_PAYSLIPS === "true") {
            try {
                const { startPayslipWorker } = require("@/modules/payroll/jobs/payslipWorker");
                startPayslipWorker();
                console.log("🧾 Payroll async payslip worker started");
            }
            catch (e) {
                console.error("❌ Payslip worker failed to start:", e?.message);
            }
        }
        const PORT = parseInt(process.env.PORT || "5000");
        server = app.listen(PORT, () => {
            // console.log(`Zithmi Backend running on port ${PORT}`);
            // console.log(`Environment: ${process.env.NODE_ENV}`);
            // console.log(`Health check: http://localhost:${PORT}/health`);
        });
        // Initialize Socket.io
        socketService_1.socketService.initialize(server);
        // Start trash auto-purge cron job
        const { startTrashAutoPurgeJob } = require("@/jobs/trashAutoPurge");
        startTrashAutoPurgeJob();
        // Start timer auto-pause cron job
        const { startTimerAutoPauseJob } = require("@/jobs/timerAutoPause");
        startTimerAutoPauseJob();
        // Start scheduled email sender cron job
        const { startMailScheduledSendJob } = require("@/jobs/mailScheduledSend");
        startMailScheduledSendJob();
    }
    catch (error) {
        console.error("Server startup failed:", error);
        process.exit(1);
    }
};
startServer();
// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
        console.log("HTTP server closed");
        try {
            await (0, database_1.disconnectDatabase)();
            await RabbitMQService_1.rabbitMQService.close();
            await (0, attendancePool_1.closeAttendancePool)();
            console.log("Database and RabbitMQ connections closed");
        }
        catch (error) {
            console.error("Error closing connections:", error);
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