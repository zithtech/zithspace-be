import { Request } from "express";

// All enums removed for maximum flexibility
// Values are now stored as strings and can be configured per tenant

// Define Prisma model types manually
//comment added
export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  planType: string;
  maxUsers: number;
  isActive: boolean;
  settings?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  name: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  passwordHash: string;
  role: string;
  position: string;
  reportsToId?: string;
  dateOfBirth?: Date;
  workDays: number[];
  assignedShiftId?: string;
  shiftAssignedById?: string;
  shiftAssignedDate?: Date;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  tenant?: Tenant;
  reportsTo?: User;
  assignedShift?: Shift;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  code?: string;
  description: string;
  status: string;
  startDate: Date;
  endDate?: Date;
  projectManagerId: string;
  repositories?: any;
  workflowTemplate: string[];
  defaultPriority: string;
  totalTickets: number;
  completedTickets: number;
  inProgressTickets: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  projectManager?: User;
  teamMembers?: User[];
  createdBy?: User;
  tickets?: Ticket[];
  releasePlans?: ReleasePlan[];
  _count?: {
    tickets?: number;
    releasePlans?: number;
  };
}

export interface Ticket {
  id: string;
  tenantId: string;
  projectId: string;
  releasePlanId?: string;
  sprintPlanId?: string;
  demoPlanId?: string;
  title: string;
  description?: string;
  ticketNumber: string;
  status: string;
  priority: string;
  type: string;
  platform?: string;
  stack?: string;
  taskLevel?: string;
  storyPoint?: number;
  estimateHours?: number;
  assigneeId?: string;
  reportToId?: string;
  createdById: string;
  parentTickets?: string[];
  parentTicketNotes?: string;
  currentWorkflowStep?: string;
  startDate?: Date;
  endDate?: Date;
  dueDate?: Date;
  completedAt?: Date;
  tags: string[];
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  // Archive fields
  isArchived: boolean;
  archivedAt?: Date;
  archivedById?: string;
  // Hierarchy fields
  epicId?: string;
  parentId?: string;
  rank?: string;
  // Relations
  project?: Project;
  assignee?: User;
  createdBy?: User;
  reportTo?: User;
  releasePlan?: ReleasePlan;
  sprintPlan?: ReleasePlan;
  demoPlan?: ReleasePlan;
  archivedBy?: User;
  epic?: Ticket;
  stories?: Ticket[];
  parent?: Ticket;
  subTasks?: Ticket[];
}

export interface Client {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  contactPerson?: string;
  isActive: boolean;
  notes?: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  amount: number;
  description: string;
  category?: string;
  date: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface Attendance {
  id: string;
  tenantId: string;
  userId: string;
  date: Date;
  clockIn?: Date;
  clockOut?: Date;
  status: string;
  shiftId?: string;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  effectiveWorkMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  isManualEntry: boolean;
  enteredById?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shift {
  id: string;
  tenantId: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReleasePlan {
  id: string;
  tenantId: string;
  projectId: string;
  version: string;
  description?: string;
  status: string;
  releaseDate?: Date;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  project?: Project;
  createdBy?: User;
  tickets?: Ticket[];
}

export interface RefreshToken {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// AUTHENTICATION TYPES
// ==========================================

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  position: string;
  name: string;
  sessionId?: string;
}

export interface JWTPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  position: string;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  tenantSubdomain?: string;
}

export interface LoginResponse {
  success: boolean;
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    workEmail: string;
    personalEmail: string;
    role: string;
    position: string;
    tenantId: string;
    tenantName: string;
    isActive: boolean;
  };
  message: string;
}

// ==========================================
// REQUEST TYPES
// ==========================================

export interface AuthRequest extends Request {
  user?: AuthUser;
  tenantId?: string;
  tenant?: Tenant;
}

export interface TenantRequest extends Request {
  tenantId: string;
  tenant: Tenant;
  user?: AuthUser;
}

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    pagination?: PaginationMeta;
    total?: number;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

// ==========================================
// TENANT TYPES
// ==========================================

export interface CreateTenantData {
  name: string;
  subdomain: string;
  planType?: string;
  maxUsers?: number;
  settings?: any;
  adminUser: {
    name: string;
    workEmail: string;
    personalEmail: string;
    phone: string;
    password: string;
    position: string;
  };
}

export interface TenantSettings {
  allowUserRegistration: boolean;
  defaultUserRole: string;
  timezone: string;
  dateFormat: string;
  workingHours: {
    start: string;
    end: string;
  };
  workingDays: number[];
  features: {
    attendance: boolean;
    transactions: boolean;
    clients: boolean;
    releasePlanning: boolean;
  };
}

// ==========================================
// user TYPES
// ==========================================

export interface CreateUserData {
  name: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  password: string;
  role?: string;
  position: string;
  reportsToId?: string;
  dateOfBirth?: Date;
  workDays?: number[];
  assignedShiftId?: string; // ADDED: Missing shift assignment field
  isActive?: boolean; // ADDED: Missing isActive field
}

export interface UpdateUserData {
  name?: string;
  workEmail?: string;
  personalEmail?: string;
  phone?: string;
  role?: string;
  position?: string;
  reportsToId?: string;
  dateOfBirth?: Date;
  workDays?: number[];
  assignedShiftId?: string; // ADDED: Missing shift assignment field
  isActive?: boolean;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ==========================================
// PROJECT TYPES
// ==========================================

export interface CreateProjectData {
  name: string;
  code?: string;
  description: string;
  status?: string;
  startDate: Date;
  endDate?: Date;
  projectManagerId: string;
  teamMemberIds?: string[];
  repositories?: ProjectRepository[];
  workflowTemplate?: string[];
  defaultPriority?: string;
}

export interface UpdateProjectData {
  name?: string;
  code?: string;
  description?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  projectManagerId?: string;
  teamMemberIds?: string[];
  repositories?: ProjectRepository[];
  workflowTemplate?: string[];
  defaultPriority?: string;
  // Fields that shouldn't be updated directly but may be present in request body
  createdById?: string;
  createdAt?: Date;
  tenantId?: string;
}

export interface ProjectRepository {
  name: string;
  url: string;
  branch: string;
  isActive: boolean;
}

export interface ProjectStats {
  totalTickets: number;
  completedTickets: number;
  inProgressTickets: number;
  openTickets: number;
  completionRate: number;
}

// ==========================================
// TICKET TYPES
// ==========================================

export interface CreateTicketData {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  type?: string;
  projectId?: string;
  project?: string;
  assigneeId?: string;
  assignee?: string;
  reportToId?: string;
  reportTo?: string;
  dueDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
  // Additional fields from frontend
  platform?: string;
  stack?: string;
  taskLevel?: string;
  taskType?: string;
  storyPoint?: number;
  estimateHours?: number;
  parentTickets?: string[];
  parentId?: string;
  releasePlan?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateTicketData {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  type?: string;
  assigneeId?: string;
  dueDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
  // Fields that shouldn't be updated directly but may be present in request body
  createdById?: string;
  tenantId?: string;
}

export interface TicketFilters {
  status?: string[];
  priority?: string[];
  type?: string[];
  assigneeId?: string;
  projectId?: string;
  createdById?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  tags?: string[];
}

// ==========================================
// CLIENT TYPES
// ==========================================

export interface CreateClientData {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  contactPerson?: string;
  notes?: string;
}

export interface UpdateClientData {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  contactPerson?: string;
  isActive?: boolean;
  notes?: string;
  // Fields that shouldn't be updated directly but may be present in request body
  createdById?: string;
  createdAt?: Date;
  tenantId?: string;
}

// ==========================================
// TRANSACTION TYPES
// ==========================================

export interface CreateTransactionData {
  userId: string;
  type: "income" | "expense" | "bonus" | "deduction";
  amount: number;
  description: string;
  category?: string;
  date: Date;
  metadata?: Record<string, any>;
}

export interface TransactionFilters {
  userId?: string;
  type?: string[];
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
}

// ==========================================
// ATTENDANCE TYPES
// ==========================================

export interface CreateAttendanceData {
  userId: string;
  date: Date;
  clockIn?: Date;
  clockOut?: Date;
  status?: "present" | "absent" | "late" | "half_day";
  notes?: string;
}

export interface AttendanceFilters {
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string[];
}

// Data required to create a new customer
export interface CreateCustomerData {
  companyName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
}

// Data allowed to update a customer
export interface UpdateCustomerData {
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
}



// ==========================================
// VALIDATION SCHEMAS
// ==========================================

export class ValidationError extends Error {
  public readonly statusCode: number = 400;
  public readonly code: string = "VALIDATION_ERROR";

  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors?: ValidationError[];
}

// ==========================================
// DATABASE QUERY OPTIONS
// ==========================================

export interface QueryOptions {
  include?: Record<string, boolean | QueryOptions>;
  select?: Record<string, boolean>;
  where?: Record<string, any>;
  orderBy?: Record<string, "asc" | "desc">;
  skip?: number;
  take?: number;
}

// ==========================================
// SECURITY TYPES
// ==========================================

export interface SessionData {
  userId: string;
  tenantId: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface SecurityConfig {
  jwt: {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  bcrypt: {
    rounds: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    origins: string[];
    credentials: boolean;
  };
}

// ==========================================
// ERROR TYPES
// ==========================================

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AppValidationError extends AppError {
  public errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super("Validation failed", 400, "VALIDATION_ERROR");
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication failed") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Authorization failed") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

export class TenantError extends AppError {
  constructor(message: string = "Tenant error") {
    super(message, 400, "TENANT_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

// Note: Prisma types will be available after running 'npx prisma generate'
// For now, we use the temporary interfaces and enums defined above
