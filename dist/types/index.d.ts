import { Request } from "express";
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
export interface Position {
    id: string;
    tenantId: string;
    code: string;
    title: string;
    departmentId: string;
    subDepartmentId?: string;
    gradeId: string;
    description?: string;
    isActive: boolean;
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
    positionId?: string;
    position?: Position;
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
    isArchived: boolean;
    archivedAt?: Date;
    archivedById?: string;
    epicId?: string;
    parentId?: string;
    rank?: string;
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
export interface AuthUser {
    id: string;
    tenantId: string;
    email: string;
    role: string;
    position: string | null;
    name: string;
    sessionId?: string;
}
export interface JWTPayload {
    userId: string;
    tenantId: string;
    email: string;
    role: string;
    position: string | null;
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
        position: string | null;
        tenantId: string;
        tenantName: string;
        isActive: boolean;
    };
    message: string;
}
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
export interface CreateUserData {
    name: string;
    workEmail: string;
    personalEmail: string;
    phone: string;
    password: string;
    role?: string;
    positionId?: string;
    reportsToId?: string;
    dateOfBirth?: Date;
    workDays?: number[];
    assignedShiftId?: string;
    isActive?: boolean;
}
export interface UpdateUserData {
    name?: string;
    workEmail?: string;
    personalEmail?: string;
    phone?: string;
    role?: string;
    positionId?: string;
    reportsToId?: string;
    dateOfBirth?: Date;
    workDays?: number[];
    assignedShiftId?: string;
    isActive?: boolean;
}
export interface ChangePasswordData {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}
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
    createdById?: string;
    createdAt?: Date;
    tenantId?: string;
}
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
export interface CreateCustomerData {
    companyName: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    taxId?: string;
}
export interface UpdateCustomerData {
    companyName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    taxId?: string;
}
export declare class ValidationError extends Error {
    readonly field?: string;
    readonly statusCode: number;
    readonly code: string;
    constructor(message: string, field?: string);
}
export interface ValidationResult<T> {
    isValid: boolean;
    data?: T;
    errors?: ValidationError[];
}
export interface QueryOptions {
    include?: Record<string, boolean | QueryOptions>;
    select?: Record<string, boolean>;
    where?: Record<string, any>;
    orderBy?: Record<string, "asc" | "desc">;
    skip?: number;
    take?: number;
}
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
export declare class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    code?: string;
    constructor(message: string, statusCode?: number, code?: string);
}
export declare class AppValidationError extends AppError {
    errors: ValidationError[];
    constructor(errors: ValidationError[]);
}
export declare class AuthenticationError extends AppError {
    constructor(message?: string);
}
export declare class AuthorizationError extends AppError {
    constructor(message?: string);
}
export declare class TenantError extends AppError {
    constructor(message?: string);
}
export declare class NotFoundError extends AppError {
    constructor(resource?: string);
}
export type CreateTimesheetRowData = {
    day: string;
    projectName: string;
    taskName: string;
    description?: string;
    hours: number;
    billable?: boolean;
};
export type CreateTimesheetData = {
    weekStart: string;
    weekEnd: string;
    rows: CreateTimesheetRowData[];
    leaveCount?: number;
};
export type UpdateTimesheetRowData = {
    id?: string;
    day?: string;
    projectName?: string;
    taskName?: string;
    description?: string;
    hours?: number;
    billable?: boolean;
    taskId?: string;
    projectId?: string;
};
export type UpdateTimesheetData = {
    weekStart?: string;
    weekEnd?: string;
    status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
    rejectReason?: string;
    rows?: UpdateTimesheetRowData[];
    leaveCount?: number;
};
export interface CreateClientV2Data {
    companyName: string;
    clientType: string;
    legalName?: string;
    parentId?: string;
    companySize?: string;
    industry?: string;
    contractValue?: number;
    yearOfIncorporation?: string;
    duration?: string;
    gstVatTaxId?: string;
    registrationNumber?: string;
    country?: string;
    website?: string;
    defaultCurrency?: string;
    billingAddress?: string;
    riskLevel?: string;
    status?: string;
    pan?: string;
    vatNumber?: string;
    dunsNumber?: string;
    msmeRegistration?: string;
    paymentTerms?: string;
    creditLimit?: number;
    billingContactEmail?: string;
    accountsPayableName?: string;
    tdsApplicable?: boolean;
    reverseCharge?: boolean;
    accountManagerId?: string;
    salesOwnerId?: string;
    deliveryOwnerId?: string;
    clientSegment?: string;
    contractStartDate?: Date;
    contractEndDate?: Date;
    renewalType?: string;
    slaLevel?: string;
    bankName?: string;
    bankAccountNumber?: string;
    ifscSwift?: string;
    currencyOfPayment?: string;
    preferredPaymentMode?: string;
    isActive?: boolean;
}
export interface UpdateClientV2Data extends Partial<CreateClientV2Data> {
}
export interface CreateClientContactV2Data {
    firstName: string;
    lastName: string;
    officialEmail: string;
    displayName?: string;
    designation?: string;
    department?: string;
    contactType?: string;
    isPrimary?: boolean;
    secondaryEmail?: string;
    mobileNumber?: string;
    alternatePhone?: string;
    officeLandline?: string;
    extensionNumber?: string;
    preferredComm?: string;
    status?: string;
}
export interface UpdateClientContactV2Data extends Partial<CreateClientContactV2Data> {
}
export interface CreateEmployeeClientAllocationV2Data {
    employeeId: string;
    projectId?: string;
    billingType: string;
    billAmount?: number;
    startDate: Date;
    endDate?: Date;
    status?: string;
}
export interface UpdateEmployeeClientAllocationV2Data extends Partial<CreateEmployeeClientAllocationV2Data> {
}
export interface CreateImplementationPartnerData {
    companyName: string;
    industry?: string;
    website?: string;
    companyEmail?: string;
    companyPhone?: string;
    status?: boolean;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
    notes?: string;
    contactPersons?: CreateImplementationContactPersonData[];
    businessDetails?: CreateImplementationBusinessDetailsData[];
    relations?: CreateImplementationRelationsData[];
    documents?: CreateImplementationDocumentData[];
}
export interface UpdateImplementationPartnerData extends Partial<CreateImplementationPartnerData> {
    id: string;
}
export interface CreateImplementationContactPersonData {
    personName: string;
    designation?: string;
    email?: string;
    phone?: string;
    linkedInUrl?: string;
}
export interface CreateImplementationBusinessDetailsData {
    registrationNumber?: string;
    taxId?: string;
    businessType?: string;
    yearEstabliliesh?: number;
    totalEmployees?: number;
}
export interface CreateImplementationRelationsData {
    linkedVendor?: string;
    linkedClient?: string;
    supportsVisaSponsorship: boolean;
    visaTypesSupported?: string;
}
export interface CreateImplementationDocumentData {
    documentType?: string;
    documentUrl?: string;
    base64?: string;
    fileName?: string;
}
export interface CreateVendorData {
    companyName: string;
    industry?: string;
    website?: string;
    companyEmail?: string;
    companyPhone?: string;
    status?: boolean;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
    notes?: string;
    contactPersons?: CreateVendorContactPersonData[];
    businessDetails?: CreateVendorBusinessDetailsData[];
    relations?: CreateVendorRelationsData[];
    documents?: CreateVendorDocumentData[];
}
export interface UpdateVendorData extends Partial<CreateVendorData> {
    id: string;
}
export interface CreateVendorContactPersonData {
    personName: string;
    designation?: string;
    email?: string;
    phone?: string;
    linkedInUrl?: string;
}
export interface CreateVendorBusinessDetailsData {
    registrationNumber?: string;
    taxId?: string;
    businessType?: string;
    yearEstabliliesh?: number;
    totalEmployees?: number;
}
export interface CreateVendorRelationsData {
    linkedVendor?: string;
    linkedClient?: string;
    supportsVisaSponsorship: boolean;
    visaTypesSupported?: string;
}
export interface CreateVendorDocumentData {
    documentType?: string;
    documentUrl?: string;
    base64?: string;
    fileName?: string;
}
export interface CreateRecruitmentClientData {
    clientName: string;
    accountType?: string;
    industry?: string;
    website?: string;
    companyEmail?: string;
    companyPhone?: string;
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    status?: boolean;
    notes?: string;
    implementationPartnerId?: string;
    primeVendorId?: string;
    businessDetails?: CreateRecruitmentClientBusinessDetailsData[];
    hiringPreferences?: CreateRecruitmentClientHiringPreferenceData[];
    contacts?: RecruitmentClientContactData[];
}
export interface UpdateRecruitmentClientData extends Partial<CreateRecruitmentClientData> {
}
export interface CreateRecruitmentClientBusinessDetailsData {
    companyName?: string;
    yearEstablished?: number;
    revenueRange?: string;
}
export interface CreateRecruitmentClientHiringPreferenceData {
    employmentType?: string;
    workType?: string;
    hiringLocation?: string;
}
export interface RecruitmentClientContactData {
    id?: string;
    personName: string;
    designation?: string;
    email?: string;
    phone?: string;
    linkedInUrl?: string;
}
export interface RecruitmentClientDocumentData {
    id?: string;
    documentType?: string;
    documentUrl?: string;
}
