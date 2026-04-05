if (process.env.NODE_ENV !== "development") {
  require("module-alias/register");
}
import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import session from "express-session";
import bcrypt from "bcryptjs";

// Import configurations
import { connectDatabase, disconnectDatabase } from "@/config/database";
import salaryComponentRoutes from "@/routes/salaryComponentRoutes";
import salaryStructureRoutes from "@/routes/salaryStructureRoutes";
import salaryApprovalRoutes from "@/routes/salaryApprovalRoutes";
import salaryAdjustmentRoutes from "@/routes/salaryAdjustmentRoutes";
import gradeRoutes from "@/routes/gradeRoutes";
import companyRoutes from "./routes/companyRoutes";

import authRoutes from "@/routes/auth";
import tenantRoutes from "@/routes/tenants";
import projectRoutes from "@/routes/projects";
import squadRoutes from "@/routes/squad";
import ticketRoutes from "@/routes/tickets";
import recruitmentRoutes from "./routes/jobRequisition.routes";
import attendanceRoutes from "@/routes/attendance";
import clientRoutes from "@/routes/clients";
import clientV2Routes from "@/routes/clientsV2";
import memberRoutes from "@/routes/members";
import shiftRoutes from "@/routes/shifts";
import transactionRoutes from "@/routes/transactions";
import releasePlanRoutes from "@/routes/releasePlans";
import settingRoutes from "@/routes/settings";
import userRoutes from "@/routes/user";
import dailyUpdateRoutes from "@/routes/dailyUpdates";
import dashboardRoutes from "@/routes/dashboard";
import leaveRoutes from "@/routes/leaves";
import leaveTypeRoutes from "@/routes/leaveTypeRoutes";
import customerRoutes from "@/routes/customerRoutes";
import invoiceSettingRoutes from "@/routes/invoiceSettingsRoutes";
import invoice from "@/routes/invoice";
import invoiceTemplate from "@/routes/invoiceTemplate";
import bucketRoutes from "@/routes/buckets";
import trashRoutes from "@/routes/trash";
import sprintCompletionRoutes from "@/routes/sprintCompletion";
import fixedHolidayRoutes from "@/routes/fixedHolidays";
import documentHubRoutes from "@/routes/documenthub";
import channelRoutes from "@/routes/channels";
import messageRoutes from "@/routes/messages";
import shortcutRoutes from "@/routes/shortcut.routes";
import employeeWorkDetailRoutes from "@/routes/employeeWorkDetailes";
import employeeTimelineRoutes from "@/routes/employeeTimeline";

// main
import employeeOnboardingRoutes from "@/routes/onboardingRoutes";
import newProfileRoutes from "@/routes/auth";
import publicTicketRoutes from "@/routes/publicTickets";
import publicDocumentRoutes from "@/routes/publicDocuments";
import employeeSettingsRoutes from "@/routes/employeeSettingsRoutes";
import implementationPartnerRoutes from "@/routes/implementationPartner";
import recruitmentClientRoutes from "@/routes/recruitmentClient";
import vendorRoutes from "@/routes/vendor";

import timesheetRoutes from "@/routes/timesheet";
import timeTrackingRoutes from "./routes/timeTracking";
import proxyRoutes from "@/routes/proxyRoutes";

import companyGovernmentHolidayRouter from "@/routes/companyGovernmentHoliday.routes";
import leaveAdjustmentRoutes from "./routes/leaveAdjustmentRoutes";
import leaveAllocationRoutes from "@/routes/leaveAllocationRoutes";
import reimbursement from "@/routes/reimbursementCategory";
import employmentTypeRoutes from "@/routes/employmentTypeRoutes";
import repositoryRoutes from "@/routes/repositoryRoutes";
import departmentRoutes from "@/routes/departmentRoutes";
import subDepartmentRoutes from "@/routes/subDepartmentRoutes";
import positionRoutes from "@/routes/positionRoutes";
import calendarRoutes from "@/routes/calendar";
import employeeExitRoutes from "@/routes/employeeExit.routes";
import leaveOriginRoutes from "@/routes/leaveOriginRoutes";
import emailHistoryRoutes from "@/routes/emailHistoryRoutes";
import leaveRequestRoutes from "@/routes/leaveRequestRoutes";
import leaveBalanceRoutes from "@/routes/leaveBalanceRoutes";
import payrollRoutes from "@/routes/payroll";
import reimbursementConfigurationRoutes from "@/routes/reimbursementConfig";
import reimbursementsettingsRoutes from "@/routes/reimbursementsettingsRoutes";
import reimbursementRoutes from "@/routes/reimbursementcreateRoutes";
import rbacRoutes from "@/routes/rbac";
import candidateFormRoutes from "@/routes/candidateForm.routes";
import employeeAssetRoutes from "@/routes/employeeAssets.routes";
import noticePolicyRoutes from "@/routes/noticePolicy.routes";
import exitTypeRoutes from "@/routes/exitType.routes";
import reasonForExitRoutes from "@/routes/reasonForExit.routes";
import exitApprovalWorkflowRoutes from "@/routes/exitApprovalWorkflow.routes";

import recruitmentStatusRoutes from "@/routes/recruitmentStatus.routes";
import recruitmentActionRoutes from "@/routes/recruitmentAction.routes";
import candidateRoutes from "@/routes/candidateRoutes";
import escalationSettingsRoutes from "./routes/escalationSettingsRoutes";
import escalationRoutes from "./routes/escalationRoutes";
// Load environment
dotenv.config();
console.log("🚀 API Starting up...");
console.log("📅 Mounting calendar routes at /api/calendar");
console.log("🤖 DevBot deployment test — 2026-03-22");
// Create Express application
const app = express();


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

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow server-to-server

      if (
        allowedOrigins.some(
          (o) =>
            (typeof o === "string" && o === origin) ||
            (o instanceof RegExp && o.test(origin)),
        )
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// Body parsing middleware
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-fallback-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // true in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Connect to PostgreSQL

// Cookie parsing middleware
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Global rate limiting
const limiter = rateLimit({
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

// app.use("/api", optionalTenantContext);

// API routes
app.use("/api/leave-adjustments", leaveAdjustmentRoutes);
app.use("/api/company-government-holidays", companyGovernmentHolidayRouter);
app.use("/api/leave-origins", leaveOriginRoutes);
app.use("/api/fixed-holidays", fixedHolidayRoutes);
app.get("/api/direct-test", (req, res) => {
  res.json({ success: true, message: "Direct app.get works" });
});
app.get("/api/debug-ping-unique", (req, res) => res.json({ success: true, message: "Debug route is active" }));

app.use("/api", proxyRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/squads", squadRoutes);
app.use("/api/public/tickets", publicTicketRoutes);
app.use("/api/public/document", publicDocumentRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/recruitment", recruitmentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/clients-v2", clientV2Routes);
app.use("/api/members", memberRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/release-plans", releasePlanRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/escalation-settings", escalationSettingsRoutes);
app.use("/api/escalations", escalationRoutes);
app.use("/api/user", userRoutes);
app.use("/api/daily-updates", dailyUpdateRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/leaves", leaveRoutes);
// app.use("/api/reimbursement-category", reimbursement);
app.use("/api/reimbursement-categories", reimbursement); // plural form
app.use("/api/repositories", repositoryRoutes);
app.use("/api/leave-types", leaveTypeRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/invoicesetting", invoiceSettingRoutes);
app.use("/api/invoices", invoice);
app.use("/api/invoice-templates", invoiceTemplate);
//app.use("/api/invoice",invoicedownload)
app.use("/api/buckets", bucketRoutes);
app.use("/api/trash", trashRoutes);
app.use("/api/sprint-completion", sprintCompletionRoutes);
app.use("/api/salary-components", salaryComponentRoutes);
app.use("/api/salary-structures", salaryStructureRoutes);
app.use("/api/salary-approvals", salaryApprovalRoutes);
app.use("/api/salary-adjustments", salaryAdjustmentRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/payroll", payrollRoutes);

app.use("/api/departments", departmentRoutes);
app.use("/api/sub-departments", subDepartmentRoutes);
app.use("/api/positions", positionRoutes);
app.use("/api/employment-types", employmentTypeRoutes);
app.use("/api/documenthub", documentHubRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/channels/:channelId/messages", messageRoutes);
app.use("/api/email-history", emailHistoryRoutes);
app.use("/api/timesheets", timesheetRoutes);
app.use("/api/zoho", calendarRoutes);
app.use("/api/leave-allocation", leaveAllocationRoutes);
app.use("/api/leave-request", leaveRequestRoutes);
app.use("/api/leave-balances", leaveBalanceRoutes);

app.use("/api/time-tracking", timeTrackingRoutes);

app.use("/api/candidates", candidateRoutes);

app.use("/api/recruitment-statuses", recruitmentStatusRoutes);
app.use("/api/recruitment-actions", recruitmentActionRoutes);

app.use("/api/employee-work-details", employeeWorkDetailRoutes);
app.use("/api/employee-timelines", employeeTimelineRoutes);

app.use("/api/onboarding", employeeOnboardingRoutes);
app.use("/api/reimbursement-configurations", reimbursementConfigurationRoutes);
app.use("/api/reimbursement-settings", reimbursementsettingsRoutes);
// Reimbursements (with file upload)
app.use("/api/reimbursements", reimbursementRoutes);
// app.use("/api/manager/reimbursements", managerReimbursementRoutes);
app.use("/api/profile/new", newProfileRoutes);
app.use("/api/employeesettings", employeeSettingsRoutes);

app.use("/api/exit/notice-policy", noticePolicyRoutes);
app.use("/api/exit/exit-type", exitTypeRoutes);
app.use("/api/exit/reason-for-exit", reasonForExitRoutes);
app.use("/api/exit/approval-workflow", exitApprovalWorkflowRoutes);
app.use("/api/exit/request", employeeExitRoutes);

// RBAC management API
app.use("/api/rbac", rbacRoutes);

// Candidate Form API
app.use("/api/candidate-form", candidateFormRoutes);
app.use("/api/employee-assets", employeeAssetRoutes);
app.use("/api/shortcuts", shortcutRoutes);

// Implementation Partner API
app.use("/api/implementation-partner", implementationPartnerRoutes);

// Recruitment Client API
app.use("/api/recruitment-client", recruitmentClientRoutes);
app.use("/api/vendor", vendorRoutes);

// app.use("/api/addresses", addressRoutes);
//app.use("/api/employee_address", addressRoutes);

app.get("/api/health", (req: any, res) => {
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
app.use((err: any, req: any, res: any, next: any): void => {
  console.error("Global error handler:", err);

  // Mongoose validation error (keeping for compatibility during migration)
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e: any) => e.message);
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
  const message =
    process.env.NODE_ENV === "development"
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
let server: any;

const startServer = async () => {
  try {
    // Connect PostgreSQL
    await connectDatabase();
    // console.log("Database connected");

    // Connect RabbitMQ
    // await connectRabbitMQ();
    // console.log("RabbitMQ connected");

    // Start workers
    // const { startWorker } = require("@/workers/leaveAllocationWorker");
    // await startWorker();
    const PORT = parseInt(process.env.PORT || "5000");

    server = app.listen(PORT, () => {
      // console.log(`Zithmi Backend running on port ${PORT}`);
      // console.log(`Environment: ${process.env.NODE_ENV}`);
      // console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();

// const PORT = parseInt(process.env.PORT || "5000");

// const server = app.listen(PORT, () => {
//   console.log(`Zithmi Backend V2 (Multi-Tenant) running on port ${PORT}`);
//   console.log(`Environment: ${process.env.NODE_ENV}`);
//   console.log(`Health check: http://localhost:${PORT}/health`);
//   console.log(`Multi-tenant API: http://localhost:${PORT}/api/health`);
//   console.log(`Database: PostgreSQL with Prisma`);
//   console.log(`Features: Multi-tenant, RLS, Enhanced Auth, JWT`);

//   // Initialize Socket.io
//   const { socketService } = require("@/services/socketService");
//   socketService.initialize(server);

//   // Start trash auto-purge cron job
//   const { startTrashAutoPurgeJob } = require("@/jobs/trashAutoPurge");
//   startTrashAutoPurgeJob();
// });

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    console.log("HTTP server closed");

    try {
      await disconnectDatabase();

      console.log("Database connections closed");
    } catch (error) {
      console.error("Error closing database connections:", error);
    }

    console.log("Process terminated");
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down",
    );
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle unhandled promise rejections
process.on("unhandledRejection", (err: any) => {
  console.error("Unhandled Promise Rejection:", err);
  gracefulShutdown("Unhandled Promise Rejection");
});

// Handle uncaught exceptions
process.on("uncaughtException", (err: any) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

export default app;
