-- Enable uuid-ossp extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'INR', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD');

-- CreateEnum
CREATE TYPE "DateFormat" AS ENUM ('DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD');

-- CreateEnum
CREATE TYPE "DeductionType" AS ENUM ('BASIC_PERCENT', 'GROSS_PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "DocumentNodeType" AS ENUM ('section', 'folder', 'file');

-- CreateEnum
CREATE TYPE "HolidayStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VisibilityType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "address_type_enum" AS ENUM ('CURRENT', 'PERMANENT');

-- CreateEnum
CREATE TYPE "approver_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "approver_type" AS ENUM ('MANAGER', 'ROLE', 'SPECIFIC_USER');

-- CreateEnum
CREATE TYPE "calculation_type" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "calendar_provider" AS ENUM ('GOOGLE', 'MICROSOFT', 'ZOHO');

-- CreateEnum
CREATE TYPE "component_type" AS ENUM ('Earning', 'Deduction');

-- CreateEnum
CREATE TYPE "deductiontype" AS ENUM ('BASIC_PERCENT', 'GROSS_PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "environment" AS ENUM ('DEV', 'QA', 'PROD');

-- CreateEnum
CREATE TYPE "environment_status" AS ENUM ('ACTIVE', 'INACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "feature_type" AS ENUM ('INCLUDED', 'ADD_ON');

-- CreateEnum
CREATE TYPE "field_type" AS ENUM ('text', 'number', 'date', 'dropdown');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'PENDING', 'APPROVAL', 'SENT', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "invoice_type" AS ENUM ('STANDARD', 'PROFORMA', 'CREDIT', 'TAX', 'DEBIT', 'RECURRING');

-- CreateEnum
CREATE TYPE "leave_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "mail_provider" AS ENUM ('GOOGLE', 'MICROSOFT', 'ZOHO');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'CHECK', 'PAYPAL', 'STRIPE', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "percentage_basis" AS ENUM ('GROSS', 'BASIC');

-- CreateEnum
CREATE TYPE "recurring_frequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "reimbursement_status" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "reimbursementcreate_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'PARTIALLY_APPROVED', 'PARTIALLY_PAID');

-- CreateEnum
CREATE TYPE "release_status" AS ENUM ('DRAFT', 'RELEASED');

-- CreateEnum
CREATE TYPE "salary_type" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "timesheet_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('monthly_credit', 'yearly_credit', 'carry_forward_credit', 'adjustment_credit', 'leave_debit', 'leave_encashment_debit', 'expiry_debit', 'reversal');

-- CreateEnum
CREATE TYPE "visibility" AS ENUM ('INTERNAL', 'CLIENT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "visibilitytype" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "EmployerContactPersons" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedInUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerContactPersons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerDocuments" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "documentType" TEXT,
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerDocuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerManagement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "type" TEXT,
    "companyWebsite" TEXT,
    "companyEmail" TEXT,
    "companyPhone" TEXT,
    "status" BOOLEAN DEFAULT true,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "businessRegistrationNumber" TEXT,
    "tax" TEXT,
    "businessType" TEXT,
    "yearEstablished" INTEGER,
    "totalEmployees" INTEGER,
    "industry" TEXT,
    "payrollContactPerson" TEXT,
    "payrollEmail" TEXT,
    "payrollPhone" TEXT,
    "payrollFrequency" TEXT,
    "payrollProcessingSystem" TEXT,
    "supportsVisaSponsorship" BOOLEAN NOT NULL DEFAULT false,
    "visaTypesSupported" TEXT,
    "bankName" TEXT,
    "accountHolderName" TEXT,
    "accountNumber" TEXT,
    "routingNumber" TEXT,
    "paymentMethod" TEXT,
    "recruiterNotes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerManagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AssignedRecruiters" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_RequisitionRecruiters" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "assigned_deal_users" (
    "deal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assigned_deal_users_pkey" PRIMARY KEY ("deal_id","user_id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reimbursement_item_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" VARCHAR(100) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "clock_in" TIMESTAMP(3),
    "clock_out" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'present',
    "shift_id" TEXT,
    "total_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "total_break_minutes" INTEGER NOT NULL DEFAULT 0,
    "effective_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_manual_entry" BOOLEAN NOT NULL DEFAULT false,
    "entered_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_breaks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "break_type" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "attendance_id" TEXT NOT NULL,
    "clock_in" TIMESTAMP(6) NOT NULL,
    "clock_out" TIMESTAMP(6),
    "work_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "permission" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "endpoint" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_disbursement_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "employee_count" INTEGER NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "status" TEXT DEFAULT 'GENERATED',
    "sent_at" TIMESTAMP(6),
    "sent_by" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "bank_disbursement_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bucket_members" (
    "id" TEXT NOT NULL,
    "bucket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bucket_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buckets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#6366f1',
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_exceptions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "original_date" TIMESTAMPTZ(6) NOT NULL,
    "new_start_time" TIMESTAMPTZ(6),
    "new_end_time" TIMESTAMPTZ(6),
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "external_instance_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "override_title" TEXT,
    "override_description" TEXT,
    "override_location" TEXT,
    "override_meeting_link" TEXT,
    "override_attendees" JSONB,

    CONSTRAINT "calendar_event_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "provider" "calendar_provider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "calendar_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "is_all_day" BOOLEAN DEFAULT false,
    "is_recurring" BOOLEAN DEFAULT false,
    "rrule" TEXT,
    "exdate" JSONB,
    "calendar_name" VARCHAR(255),
    "source_type" VARCHAR(100),
    "attendees" JSONB,
    "meeting_link" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "organizer_email" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "calendar_provider" NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expiry" TIMESTAMPTZ(6),
    "calendar_id" TEXT,
    "google_sync_token" TEXT,
    "google_channel_id" TEXT,
    "google_resource_id" TEXT,
    "google_channel_expiry" TIMESTAMPTZ(6),
    "microsoft_delta_link" TEXT,
    "microsoft_subscription_id" TEXT,
    "microsoft_subscription_expiry" TIMESTAMPTZ(6),
    "microsoft_client_state" TEXT,
    "zoho_last_sync" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "is_syncing" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_status" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "next_sync_due_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_error_count" INTEGER NOT NULL DEFAULT 0,
    "mail_account_id" TEXT,

    CONSTRAINT "calendar_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_availability" (
    "id" TEXT DEFAULT gen_random_uuid(),
    "candidate_id" TEXT,
    "available_to_join" BOOLEAN,
    "joining_date" TIMESTAMP(6),
    "notice_period" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "candidate_details" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "contact_no" VARCHAR(20) NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "zip_code" VARCHAR(20) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "linkedin_url" TEXT,
    "github_url" TEXT,
    "portfolio_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "internal_recruiter_notes" VARCHAR(1000),

    CONSTRAINT "candidate_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_documents" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_educations" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "degree_name" TEXT NOT NULL,
    "specialization" TEXT,
    "university" TEXT NOT NULL,
    "location" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_interview_availability" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "interview_date" TIMESTAMP(6),
    "start_time" TIMESTAMP(6),
    "end_time" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_interview_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_interview_slots" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "interview_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" TEXT,

    CONSTRAINT "candidate_interview_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_skill_matrices" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "skill_name" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "years_of_experience" DECIMAL(5,2) NOT NULL,
    "last_used_year" DATE NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_skill_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_work_experiences" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_website" TEXT,
    "job_title" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "location" TEXT,
    "employment_type" TEXT,
    "work_mode" TEXT,
    "skills_used" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsibilities" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_work_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "timezone" TEXT,
    "linkedin_url" TEXT,
    "github_url" TEXT,
    "portfolio_url" TEXT,
    "preferred_contact_method" TEXT,
    "current_role" TEXT,
    "years_of_experience" DECIMAL(5,2),
    "primary_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondary_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "professional_summary" TEXT,
    "work_authorization_type" TEXT,
    "visa_validity_date" DATE,
    "willing_to_transfer_visa" BOOLEAN NOT NULL DEFAULT false,
    "preferred_employment_type" TEXT,
    "expected_rate" DECIMAL(15,2),
    "rate_unit" TEXT,
    "willing_to_relocate" TEXT,
    "preferred_work_mode" TEXT,
    "earliest_available" TEXT,
    "joining_date" DATE,
    "notice_period" INTEGER,
    "resume_url" TEXT,
    "passport_url" TEXT,
    "driving_license_url" TEXT,
    "visa_document_url" TEXT,
    "identity_proof_url" TEXT,
    "certifications_urls" JSONB DEFAULT '[]',
    "internal_notes" TEXT,
    "candidate_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status_config" TEXT NOT NULL DEFAULT 'New',
    "action_config" TEXT NOT NULL DEFAULT 'New',
    "skill_rate" TEXT NOT NULL DEFAULT 'New',

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CHANNEL',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "last_message_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "display_name" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "contact_type" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "official_email" TEXT NOT NULL,
    "secondary_email" TEXT,
    "mobile_number" TEXT,
    "alternate_phone" TEXT,
    "office_landline" TEXT,
    "extension_number" TEXT,
    "preferred_communication_mode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_documents_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_documents_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_projects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "billing_type" TEXT,
    "budget" DECIMAL(15,2),
    "budget_type" VARCHAR(50),

    CONSTRAINT "client_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "legal_name" TEXT,
    "client_type" TEXT NOT NULL,
    "parent_id" TEXT,
    "company_size" TEXT,
    "industry" TEXT,
    "contract_value" DECIMAL(15,2),
    "year_of_incorporation" TEXT,
    "duration" TEXT,
    "gst_vat_tax_id" TEXT,
    "registration_number" TEXT,
    "country" TEXT,
    "website" TEXT,
    "default_currency" TEXT DEFAULT 'USD',
    "billing_address" TEXT,
    "risk_level" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Prospect',
    "pan" TEXT,
    "vat_number" TEXT,
    "duns_number" TEXT,
    "msme_registration" TEXT,
    "payment_terms" TEXT,
    "credit_limit" DECIMAL(15,2),
    "billing_contact_email" TEXT,
    "accounts_payable_name" TEXT,
    "tds_applicable" BOOLEAN NOT NULL DEFAULT false,
    "reverse_charge_applicable" BOOLEAN NOT NULL DEFAULT false,
    "account_manager_id" UUID,
    "sales_owner_id" UUID,
    "delivery_owner_id" UUID,
    "client_segment" TEXT,
    "contract_start_date" TIMESTAMP(3),
    "contract_end_date" TIMESTAMP(3),
    "renewal_type" TEXT,
    "sla_level" TEXT,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "ifsc_swift" TEXT,
    "currency_of_payment" TEXT,
    "preferred_payment_mode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "plot_no" TEXT,
    "floor_no" TEXT,
    "building_name" TEXT,
    "street" TEXT,
    "area" TEXT,
    "city" TEXT,
    "pincode" TEXT,
    "country" TEXT,
    "cin" TEXT,
    "gst" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "logo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_government_holidays" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "holiday_name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "from_date" TIMESTAMP(3) NOT NULL,
    "to_date" TIMESTAMP(3) NOT NULL,
    "base_leave" INTEGER NOT NULL,
    "extra_leave" INTEGER NOT NULL,
    "total_leave" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "is_floater" BOOLEAN NOT NULL DEFAULT false,
    "rule" TEXT,
    "status" "HolidayStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_government_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_employer_contact" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "reporting_manager_name" TEXT,
    "reporting_manager_email" TEXT,
    "reporting_manager_phone" TEXT,
    "current_employer_companyname" TEXT,
    "current_employer_company_website" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "current_employer_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "tax_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "gstin" VARCHAR(30),
    "pan" VARCHAR(30),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "deal_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_communications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Email',
    "direction" TEXT NOT NULL,
    "sender" TEXT,
    "receiver" TEXT,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_files" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_payment_schedules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_tasks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "assigned_to_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "company_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "assigned_to_id" UUID,
    "estimated_value" DECIMAL(15,2),
    "currency" TEXT DEFAULT 'USD',
    "expected_closing_date" TIMESTAMP(3),
    "probability" INTEGER DEFAULT 0,
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost" DECIMAL(15,2),
    "source_details" TEXT,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deductions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeductionType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "salaryStructureId" INTEGER NOT NULL,

    CONSTRAINT "deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deekay" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deekay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employment_type" TEXT,
    "description" TEXT,
    "head_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dinesh" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dinesh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_history" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_hub" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "ticketId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" TEXT,

    CONSTRAINT "document_hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "documentHubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    "visibility" VARCHAR(255) DEFAULT 'private',
    "share_token" VARCHAR(255),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documenttree" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentHubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DocumentNodeType" NOT NULL,
    "parentId" TEXT,
    "documentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" TEXT,

    CONSTRAINT "documenttree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dropdown_options" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dropdown_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "salaryStructureId" INTEGER NOT NULL,

    CONSTRAINT "earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "module_number" TEXT,
    "to_email" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_name" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "plain_text" TEXT,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "amount" TEXT,
    "due_date" TEXT,
    "currency" TEXT DEFAULT 'USD',
    "has_attachment" BOOLEAN NOT NULL DEFAULT false,
    "attachment_url" TEXT,
    "attachment_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "sent_by" TEXT NOT NULL,
    "sent_by_user" TEXT,
    "metadata" JSONB,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" TEXT NOT NULL,
    "template_name" VARCHAR(255) NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "trigger_event" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "subject" VARCHAR(255) NOT NULL,
    "email_body" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(6),
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_additional_details" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "promotion_status" VARCHAR(50),
    "employee_grade" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_additional_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_addresses" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "address_type" "address_type_enum" NOT NULL,
    "door_no" VARCHAR(50),
    "area" VARCHAR(150),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "country" VARCHAR(100),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_assets" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "item_name" VARCHAR(30) NOT NULL,
    "brand_name" VARCHAR(30) NOT NULL,
    "model_name" VARCHAR(30) NOT NULL,
    "model_number" VARCHAR(30) NOT NULL,
    "upload_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "return_status" TEXT,
    "condition" TEXT,
    "deduction" INTEGER,
    "remarks" TEXT,

    CONSTRAINT "employee_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "bank_name" VARCHAR(150),
    "account_holder_name" VARCHAR(150),
    "account_number" VARCHAR(255),
    "ifsc_code" VARCHAR(255),
    "branch_name" VARCHAR(150),
    "account_type" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_bank_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_client_allocations_v2" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "client_id" TEXT NOT NULL,
    "project_id" TEXT,
    "billing_type" TEXT NOT NULL,
    "bill_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_client_allocations_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "contact_person_type" VARCHAR(50),
    "name" VARCHAR(150),
    "mobile" VARCHAR(15),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "email" VARCHAR(255),

    CONSTRAINT "employee_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "document_type" VARCHAR(50) NOT NULL,
    "document_url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "relationship" VARCHAR(50),
    "name" VARCHAR(150),
    "mobile" VARCHAR(15),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_exits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "department_id" TEXT,
    "position_id" TEXT,
    "reporting_manager_id" TEXT,
    "exit_type_id" TEXT,
    "exit_reason_id" TEXT,
    "resignation_date" TIMESTAMP(3) NOT NULL,
    "proposed_last_working_day" TIMESTAMP(3) NOT NULL,
    "notice_period_day" TIMESTAMP(3),
    "waive_notice_period" BOOLEAN NOT NULL DEFAULT false,
    "buyout_required" BOOLEAN NOT NULL DEFAULT false,
    "buyout_amount" DECIMAL(10,2),
    "explanation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_exits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_experience" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "company_name" VARCHAR(150),
    "location" VARCHAR(100),
    "industry" VARCHAR(100),
    "company_address" TEXT,
    "joining_date" DATE,
    "last_working_date" DATE,
    "designation" VARCHAR(100),
    "employment_type" VARCHAR(50),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_field_configs" (
    "id" SERIAL NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "system_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "employee_field_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "aadhaar_number" VARCHAR(255),
    "pan_number" VARCHAR(255),
    "passport_number" VARCHAR(255),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payroll_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "uan_number" VARCHAR(255),
    "pf_number" VARCHAR(255),
    "esi_number" VARCHAR(255),
    "tax_regime" VARCHAR(20),
    "payment_type" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_payroll_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_project_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "reporting_manager" TEXT,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "project_name" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_project_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "salary_structure_id" SERIAL NOT NULL,
    "employee_id" UUID NOT NULL,
    "current_annual_ctc" DECIMAL(15,2) NOT NULL,
    "current_monthly_ctc" DECIMAL(15,2) NOT NULL,
    "additional_pf_pct" DECIMAL(5,2) DEFAULT 0.00,
    "is_additional_pf_active" BOOLEAN DEFAULT false,
    "nps_contribution_pct" DECIMAL(5,2) DEFAULT 0.00,
    "insurance_topup" DECIMAL(12,2) DEFAULT 0.00,
    "fbp_choices" JSONB DEFAULT '{}',
    "salary_timeline" JSONB DEFAULT '[]',
    "is_active" BOOLEAN DEFAULT true,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_compensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary_assignment_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" TEXT NOT NULL,
    "component_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "calculation_type" "calculation_type" NOT NULL,
    "percentage_basis" "percentage_basis",
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "employee_salary_assignment_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "structure_id" UUID NOT NULL,
    "base_salary" DECIMAL(12,2) NOT NULL,
    "salary_type" "salary_type" NOT NULL DEFAULT 'MONTHLY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "employee_prefix" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_timelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "joining_date" DATE,
    "training_completion_date" DATE,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_work_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "department" VARCHAR(100),
    "team" VARCHAR(100),
    "employee_type" VARCHAR(50),
    "work_location" VARCHAR(100),
    "work_shift" JSONB,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "work_type" VARCHAR(50),
    "hybrid_mode" VARCHAR(20),
    "fixed_days" TEXT[],
    "total_days" INTEGER,
    "total_hours" INTEGER,
    "work_joining_date" VARCHAR(30),
    "position_id" UUID,
    "notice_period" VARCHAR(10),

    CONSTRAINT "employee_work_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_code" VARCHAR(30) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "gender" VARCHAR(20) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "blood_group" VARCHAR(10),
    "mobile" VARCHAR(15) NOT NULL,
    "work_email" VARCHAR(150) NOT NULL,
    "personal_email" VARCHAR(150),
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profile_pic" VARCHAR(255),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "employment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_approval_workflows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_type" VARCHAR(50) NOT NULL,
    "approver_id" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exit_approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_notice_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "policy_name" VARCHAR NOT NULL,
    "code" VARCHAR,
    "description" TEXT,
    "level_type" VARCHAR NOT NULL,
    "level_id" TEXT NOT NULL,
    "notice_period_days" INTEGER NOT NULL,
    "probation_period_days" INTEGER DEFAULT 0,
    "probation_notice_days" INTEGER DEFAULT 0,
    "notice_buyout_allowed" BOOLEAN DEFAULT false,
    "buyout_calculating_type" VARCHAR,
    "status" BOOLEAN DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exit_notice_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feature_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "tier_name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sub_module_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN DEFAULT false,
    "is_billable" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_holidays" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "holiday_name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT[],
    "from_date" TIMESTAMP(3) NOT NULL,
    "to_date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "fixed_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "primary_color" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "date_format" "DateFormat" NOT NULL,
    "company_logo" TEXT,
    "signature" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "gstin" VARCHAR(30),
    "pan" VARCHAR(30),

    CONSTRAINT "general_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level_order" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "codes" TEXT,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation-basic-information" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "company_name" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "company_email" TEXT,
    "company_phone" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zip_code" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "vendor_ids" TEXT[],
    "client_ids" TEXT[],

    CONSTRAINT "implementation-basic-information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_business_detailes" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "implementation_id" TEXT NOT NULL,
    "registration_number" TEXT,
    "tax_id" TEXT,
    "business_type" TEXT,
    "year_establiliesh" INTEGER,
    "total_employees" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_business_detailes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_contact_person" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "implementation_id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_contact_person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_document" (
    "id" TEXT NOT NULL,
    "implementation_id" TEXT NOT NULL,
    "document_type" TEXT,
    "document_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_relations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "implementation_id" TEXT NOT NULL,
    "linked_vendor" TEXT,
    "linked_client" TEXT,
    "supports_visa_sponsorship" BOOLEAN NOT NULL,
    "visa_types_supported" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_activity_logs" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "invoice_id" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "performed_by" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_attachments" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "invoice_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),
    "deleted_by" TEXT,
    "row_number" INTEGER,
    "project_id" TEXT,
    "hours" DECIMAL(12,2),
    "subtotal" DECIMAL(14,2),
    "tax_amount" DECIMAL(14,2),
    "total" DECIMAL(14,2),
    "extra_fields" JSONB,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT,
    "payment_date" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" "payment_method",
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference_id" VARCHAR(255),
    "balance_before" DECIMAL(15,2),
    "balance_after" DECIMAL(15,2),

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'INV-{YYYY}-{###}',
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "reset_yearly" BOOLEAN NOT NULL DEFAULT true,
    "last_reset_year" INTEGER NOT NULL DEFAULT 2026,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "padding" INTEGER NOT NULL DEFAULT 4,

    CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_taxes" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "tax_name" VARCHAR(100) NOT NULL,
    "tax_rate" DECIMAL(6,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "deleted_at" TIMESTAMP(6),
    "deleted_by" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_template_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "field_key" VARCHAR(100) NOT NULL,
    "field_label" VARCHAR(200) NOT NULL,
    "field_type" VARCHAR(50) NOT NULL,
    "field_order" INTEGER NOT NULL,
    "is_required" BOOLEAN DEFAULT false,
    "is_system" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "options" JSONB DEFAULT '[]',

    CONSTRAINT "invoice_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "billing_type" VARCHAR(50) NOT NULL,
    "is_default" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_snapshot" JSONB,
    "invoice_date" TIMESTAMP(6) NOT NULL,
    "due_date" TIMESTAMP(6) NOT NULL,
    "invoice_type" "invoice_type" NOT NULL DEFAULT 'STANDARD',
    "currency" TEXT NOT NULL,
    "recurring_frequency" "recurring_frequency",
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "tax_total" DECIMAL(15,2) NOT NULL,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "terms" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settings_profile_id" TEXT,
    "sent_at" TIMESTAMP(6),
    "paid_at" TIMESTAMP(6),
    "cancelled_at" TIMESTAMP(6),
    "pdf_url" TEXT,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "first_payment_date" TIMESTAMP(6),
    "last_payment_date" TIMESTAMP(6),
    "fully_paid_date" TIMESTAMP(6),
    "deleted_at" TIMESTAMP(6),
    "deleted_by" TEXT,
    "discount_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(15,2),
    "project_id" TEXT,
    "template_id" UUID,
    "metadata" JSONB,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requisition_contacts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "job_requisition_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_requisition_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requisitions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "job_code" TEXT,
    "client_id" TEXT,
    "client_contact_person" TEXT,
    "openings_count" INTEGER NOT NULL DEFAULT 1,
    "job_type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "experience" TEXT,
    "mandatory_skills" TEXT[],
    "secondary_skills" TEXT[],
    "education" TEXT,
    "certification" TEXT,
    "communication_skills" TEXT,
    "allowed_visa_types" TEXT[],
    "excluded_visa_types" TEXT[],
    "security_clearance" BOOLEAN NOT NULL DEFAULT false,
    "job_location" TEXT,
    "work_mode" TEXT NOT NULL DEFAULT 'Remote',
    "time_zone" TEXT,
    "max_bill_rate" DECIMAL(10,2),
    "min_pay_rate" DECIMAL(10,2),
    "recruiter_rate" DECIMAL(10,2),
    "start_date" TIMESTAMP(3),
    "submission_deadline" TIMESTAMP(3),
    "interview_start_date" TIMESTAMP(3),
    "expected_closure_date" TIMESTAMP(3),
    "job_details" TEXT,
    "internal_notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "account_manager_id" TEXT,
    "delivery_manager_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "interview_process" JSONB,
    "attachments" JSONB DEFAULT '[]',
    "blind_cv_required" BOOLEAN NOT NULL DEFAULT false,
    "exclusive_candidate" BOOLEAN NOT NULL DEFAULT false,
    "job_role" TEXT,
    "max_submissions" INTEGER,
    "max_total_submissions" INTEGER,
    "overtime_multiplier" DECIMAL(4,2),
    "relocation_allowed" BOOLEAN NOT NULL DEFAULT false,
    "responsibilities" TEXT,
    "screening_questions" JSONB DEFAULT '[]',
    "source_format" TEXT,
    "implementation_id" TEXT,
    "recruitment_client_id" TEXT,
    "vendor_ids" TEXT,

    CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_adjustments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "adjustment_type" TEXT NOT NULL,
    "amount" DECIMAL(5,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Days',
    "reason" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "comp_off_work_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "leave_type_id" TEXT,
    "employee_id" UUID,
    "is_taken" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_carry_forwards" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "sub_origin_id" TEXT NOT NULL,
    "is_taken" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_carry_forwards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_ledger" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "units" DECIMAL(6,2) NOT NULL,
    "balance_after" DECIMAL(6,2) NOT NULL,
    "transaction_date" DATE NOT NULL,
    "expiry_date" DATE,
    "policy_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_origin_structures" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sub_origin_id" TEXT NOT NULL,

    CONSTRAINT "leave_origin_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" TEXT,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "total_units" DECIMAL(5,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "days" INTEGER DEFAULT 1,
    "hours" DECIMAL(4,2),

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "duration" DECIMAL(5,2) NOT NULL,
    "duration_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_accounts" (
    "id" TEXT NOT NULL,
    "provider" "mail_provider" NOT NULL,
    "email" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "use_shared_tokens" BOOLEAN DEFAULT true,
    "sync_cursor" TEXT,
    "last_synced_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN DEFAULT true,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "download_url" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "subject" TEXT,
    "from_email" TEXT NOT NULL,
    "to_emails" JSONB NOT NULL,
    "cc_emails" JSONB,
    "bcc_emails" JSONB,
    "body_html" TEXT,
    "body_text" TEXT,
    "snippet" TEXT,
    "is_read" BOOLEAN DEFAULT false,
    "is_sent" BOOLEAN DEFAULT false,
    "has_attachments" BOOLEAN DEFAULT false,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "received_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "scheduled_at" TIMESTAMPTZ(6),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 465,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "redis_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_sync_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider" "mail_provider" NOT NULL,
    "sync_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_threads" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_thread_id" TEXT NOT NULL,
    "subject" TEXT,
    "last_message_at" TIMESTAMPTZ(6),
    "message_count" INTEGER DEFAULT 0,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "snippet" TEXT,
    "is_read" BOOLEAN DEFAULT false,
    "has_attachments" BOOLEAN DEFAULT false,
    "from_address" TEXT,
    "to_emails" JSONB,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "role" TEXT NOT NULL DEFAULT 'participant',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_features" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "module_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "feature_type" DEFAULT 'INCLUDED',
    "price_monthly" DECIMAL(10,2) DEFAULT 0.00,
    "price_yearly" DECIMAL(10,2) DEFAULT 0.00,
    "status" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origin_leave_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "leave_origin_id" TEXT,
    "unit" DECIMAL(5,2) NOT NULL,
    "period" TEXT NOT NULL,
    "carry_forward" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "leave_type_id" TEXT,
    "accrual_interval" INTEGER DEFAULT 1,

    CONSTRAINT "origin_leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "ifsc_code" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "qr_code" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_fields" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(255) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "value" TEXT,
    "type" "field_type" NOT NULL,
    "options" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" VARCHAR(255),
    "updated_by_id" VARCHAR(255),

    CONSTRAINT "payslip_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" SERIAL NOT NULL,
    "tenant_id" VARCHAR(255) NOT NULL,
    "employee_id" VARCHAR(255) NOT NULL,
    "company_id" INTEGER NOT NULL,
    "from_date" TIMESTAMP(6) NOT NULL,
    "to_date" TIMESTAMP(6) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdf_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" VARCHAR(255),

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "probability" INTEGER DEFAULT 0,
    "is_final" BOOLEAN DEFAULT false,
    "order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_default" BOOLEAN DEFAULT false,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "sub_module_id" UUID,
    "feature_id" UUID,
    "feature_tier_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "status" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "sub_department_id" TEXT,
    "grade_id" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "project_manager_id" TEXT NOT NULL,
    "repositories" JSONB DEFAULT '[]',
    "workflow_template" TEXT[],
    "default_priority" TEXT NOT NULL DEFAULT 'medium',
    "total_tickets" INTEGER NOT NULL DEFAULT 0,
    "completed_tickets" INTEGER NOT NULL DEFAULT 0,
    "in_progress_tickets" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reasons_for_exit" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reasons_for_exit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_actions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "action_name" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruitment_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_client_basic_information" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_name" TEXT,
    "account_type" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "company_email" TEXT,
    "company_phone" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "country" TEXT,
    "status" BOOLEAN DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "implementation_partner_id" TEXT[],
    "prime_vendor_id" TEXT[],

    CONSTRAINT "recruitment_client_basic_information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_client_business_detailes" (
    "id" TEXT NOT NULL,
    "recruitment_client_id" TEXT NOT NULL,
    "company_name" TEXT,
    "year_established" INTEGER,
    "revenue_range" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "recruitment_client_business_detailes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_client_contact" (
    "id" TEXT NOT NULL,
    "recruitment_client_id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruitment_client_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_client_hirring_preference" (
    "id" TEXT NOT NULL,
    "recruitment_id" TEXT NOT NULL,
    "employment_type" TEXT,
    "work_type" TEXT,
    "hiring_location" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruitment_client_hirring_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_client_relationship" (
    "id" TEXT NOT NULL,
    "recruitment_client_id" TEXT NOT NULL,
    "implementation_partner_id" TEXT,
    "prime_vendor_id" TEXT,
    "contacts" TEXT[],
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruitment_client_relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_statuses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "applies_to" TEXT[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_final_stage" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruitment_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_approvals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reimbursement_request_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursement_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_attachments" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "reimbursement_request_id" TEXT,
    "reimbursement_item_id" TEXT,
    "reimbursement_category_id" TEXT,
    "reimbursement_approval_id" TEXT,

    CONSTRAINT "reimbursement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_per_request" DECIMAL(10,2),
    "monthly_limit" DECIMAL(10,2),
    "yearly_limit" DECIMAL(10,2),
    "eligible_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approval_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accept_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attachment_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "code" VARCHAR(50),

    CONSTRAINT "reimbursement_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_configurations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" VARCHAR(255) NOT NULL,
    "origin" VARCHAR(255) NOT NULL,
    "sub_origin" VARCHAR(255),
    "category_type" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "created_by_id" VARCHAR(255) NOT NULL,
    "updated_by_id" VARCHAR(255),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reimbursement_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_item" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "reimbursement_request_id" TEXT NOT NULL,
    "title" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "bill_no" TEXT,
    "description" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reimbursement_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_item_approvers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "reimbursement_item_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "approver_type" VARCHAR(50),
    "approver_id" UUID NOT NULL,
    "status" "approver_status" NOT NULL,
    "acted_at" TIMESTAMP(6),
    "remarks" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reimbursement_item_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reimbursement_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "date" DATE NOT NULL,
    "bill_no" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT DEFAULT 'SUBMITTED',

    CONSTRAINT "reimbursement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin_type" VARCHAR(50) NOT NULL,
    "origin_id" UUID NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" VARCHAR(255),

    CONSTRAINT "reimbursement_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_policy_approvers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_rule_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "approver_type" VARCHAR(50) NOT NULL,
    "approver_id" TEXT,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" VARCHAR(255),
    "reimbursement_id" UUID,

    CONSTRAINT "reimbursement_policy_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_policy_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "category_id" VARCHAR(255) NOT NULL,
    "max_amount" DECIMAL(12,2) NOT NULL,
    "period_type" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" VARCHAR(255),

    CONSTRAINT "reimbursement_policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_requests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "policy" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finance_status" TEXT,
    "submitted_at" TIMESTAMP(3),
    "activity_log" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reimbursement_category_id" TEXT,
    "year" INTEGER NOT NULL DEFAULT EXTRACT(year FROM CURRENT_TIMESTAMP),

    CONSTRAINT "reimbursement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement_settings_categories" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "max_requests_per_month" INTEGER,
    "monthly_limit_amount" DECIMAL(12,2),
    "yearly_limit_amount" DECIMAL(12,2),
    "allowed_roles" TEXT[],
    "approval_flow" JSONB,
    "attachment_required" BOOLEAN DEFAULT false,
    "auto_approve_under_amount" DECIMAL(12,2),
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "reimbursement_settings_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "status" "reimbursementcreate_status" NOT NULL DEFAULT 'DRAFT',
    "total_amount" DECIMAL(10,2) NOT NULL,
    "submitted_at" TIMESTAMP(6),
    "submitted_by" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" TEXT NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "release_date" TIMESTAMP(6) NOT NULL,
    "environment" VARCHAR(10) NOT NULL DEFAULT 'DEV',
    "summary" JSONB,
    "key_insights" JSONB,
    "new_features" JSONB,
    "improvements" JSONB,
    "bug_fixes" JSONB,
    "breaking_changes" JSONB,
    "api_changes" JSONB,
    "database_changes" JSONB,
    "known_issues" JSONB,
    "linked_tickets" TEXT[],
    "repositories" TEXT[],
    "pull_requests" TEXT[],
    "visibility" TEXT[],
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT,
    "created_by" VARCHAR(255) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(255),

    CONSTRAINT "release_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_plans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "release_date" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'release_plan',
    "goal" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "committed_points" INTEGER NOT NULL DEFAULT 0,
    "completed_points" INTEGER NOT NULL DEFAULT 0,
    "end_date" TIMESTAMP(3),
    "start_date" TIMESTAMP(3),

    CONSTRAINT "release_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releasenotes_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "environment_status" NOT NULL DEFAULT 'ACTIVE',
    "color" TEXT,
    "order" INTEGER DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releasenotes_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_id" TEXT,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "component_type" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_approval_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "salary_payout_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "performed_by_id" TEXT NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_approval_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_type" "approver_type" NOT NULL,
    "role_id" UUID,
    "specific_user_id" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "fallback_user_id" TEXT,

    CONSTRAINT "salary_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_approval_workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER DEFAULT 1,
    "is_deleted" BOOLEAN DEFAULT false,

    CONSTRAINT "salary_approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_components" (
    "key" SERIAL NOT NULL,
    "tenant_id" VARCHAR(255) NOT NULL,
    "component_name" VARCHAR(100) NOT NULL,
    "component_code" VARCHAR(50) NOT NULL,
    "type" "component_type" NOT NULL DEFAULT 'Earning',
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" VARCHAR(255),
    "updated_by_id" VARCHAR(255),

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "salary_payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "gross_salary" DECIMAL(12,2) NOT NULL,
    "net_salary" DECIMAL(12,2) NOT NULL,
    "total_deductions" DECIMAL(12,2) NOT NULL,
    "lop_days" DECIMAL(10,2) NOT NULL,
    "lop_deduction" DECIMAL(12,2) NOT NULL,
    "worked_days" INTEGER NOT NULL,
    "approved_by_id" TEXT,
    "components" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "adjustments" JSONB DEFAULT '[]',
    "status" TEXT DEFAULT 'DRAFT',
    "current_step" INTEGER DEFAULT 0,
    "workflow_id" UUID,
    "approved_at" TIMESTAMP(6),
    "paid_at" TIMESTAMP(6),
    "paid_by_id" TEXT,

    CONSTRAINT "salary_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structure_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "structure_id" UUID NOT NULL,
    "component_id" INTEGER NOT NULL,
    "calculation_type" "calculation_type" NOT NULL,
    "percentage_basis" "percentage_basis",
    "value" DECIMAL(12,2) NOT NULL,
    "calculated_amount" DECIMAL(12,2),
    "display_order" INTEGER,

    CONSTRAINT "salary_structure_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "employee_type" TEXT,
    "gross_salary" DECIMAL(12,2),
    "effective_from" TIMESTAMP(6),
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings_profiles" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN DEFAULT false,
    "general_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "working_minutes" INTEGER NOT NULL DEFAULT 480,
    "grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "overtime_threshold" INTEGER NOT NULL DEFAULT 60,
    "break_minutes" INTEGER NOT NULL DEFAULT 60,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#007bff',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortcuts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" TEXT,

    CONSTRAINT "shortcuts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprint_completion_logs" (
    "id" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(255) NOT NULL,
    "sprint_plan_id" VARCHAR(255) NOT NULL,
    "project_id" VARCHAR(255) NOT NULL,
    "ticket_id" VARCHAR(255) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "destination_id" VARCHAR(255),
    "destination_type" VARCHAR(50),
    "performed_by_id" VARCHAR(255) NOT NULL,
    "performed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "sprint_completion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "squad_name" VARCHAR(100) NOT NULL,
    "squad_code" VARCHAR(50) NOT NULL,
    "squad_status" BOOLEAN DEFAULT true,
    "is_archived" BOOLEAN DEFAULT false,
    "is_deleted" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "squad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "squad_members" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "squad_id" TEXT NOT NULL,
    "squad_member_id" TEXT NOT NULL,
    "member_type" VARCHAR(50) NOT NULL,
    "status" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_updates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "project_updates" JSONB NOT NULL DEFAULT '[]',
    "mood" TEXT,
    "total_hours_worked" DECIMAL(5,2),
    "general_notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_missed" BOOLEAN NOT NULL DEFAULT false,
    "missed_updateAt" TIMESTAMP(3),
    "updateType" VARCHAR(10) DEFAULT 'BOD',

    CONSTRAINT "status_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_departments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_department_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "module_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "order_index" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "module_id" UUID NOT NULL,
    "sub_module_id" UUID,
    "feature_id" UUID,
    "feature_tier_id" UUID,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_modules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "module_id" UUID NOT NULL,
    "is_enabled" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "plan_type" TEXT NOT NULL DEFAULT 'basic',
    "max_users" INTEGER NOT NULL DEFAULT 10,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_trial" BOOLEAN DEFAULT false,
    "trial_ends_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_activity_log" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performed_by_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_branches" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "is_default" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_pull_requests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "number" INTEGER,
    "state" TEXT DEFAULT 'open',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "branch_name" TEXT,
    "branch_url" TEXT,

    CONSTRAINT "ticket_pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_related_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "link_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "added_by_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_related_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_workflow_steps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "step_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "assigned_to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approval_status" JSONB NOT NULL DEFAULT '[]',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "scheduled_meeting" JSONB,
    "branch_name" TEXT,
    "test_results" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "release_plan_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ticket_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "priority" TEXT NOT NULL DEFAULT 'Medium (P2)',
    "type" TEXT NOT NULL DEFAULT 'Task',
    "platform" TEXT NOT NULL DEFAULT 'Development',
    "stack" TEXT,
    "task_level" TEXT NOT NULL DEFAULT 'Medium',
    "story_point" INTEGER NOT NULL DEFAULT 1,
    "estimate_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "assignee_id" TEXT,
    "report_to_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "parent_tickets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parent_ticket_notes" TEXT,
    "current_workflow_step" TEXT NOT NULL DEFAULT 'Scope Document',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "epic_id" TEXT,
    "parent_id" TEXT,
    "rank" TEXT,
    "demo_plan_id" TEXT,
    "sprint_plan_id" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" VARCHAR(255),
    "bucket_id" VARCHAR(255),
    "is_deleted" BOOLEAN DEFAULT false,
    "deleted_at" TIMESTAMP(6),
    "deleted_by_id" VARCHAR(255),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_tracking_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "ticket_id" TEXT,
    "description" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "billing_rate" DECIMAL(10,2),
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_tracking_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_tracking_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "time_tracking_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_tracking_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_rows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "timesheet_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "project_name" TEXT NOT NULL,
    "task_name" TEXT NOT NULL,
    "description" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" UUID,
    "taskId" UUID,
    "dayorder" INTEGER,

    CONSTRAINT "timesheet_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_start" TIMESTAMP(6) NOT NULL,
    "week_end" TIMESTAMP(6) NOT NULL,
    "status" "timesheet_status" NOT NULL DEFAULT 'DRAFT',
    "total_hours" DOUBLE PRECISION NOT NULL,
    "reject_reason" TEXT,
    "approved_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leave_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sidebar_collapsed" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" TEXT,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "personal_email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "reports_to_id" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "work_days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "assigned_shift_id" TEXT,
    "shift_assigned_by_id" TEXT,
    "shift_assigned_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "department" TEXT,
    "company_id" INTEGER,
    "zoho_access_token" VARCHAR,
    "zoho_refresh_token" VARCHAR,
    "zoho_token_expiry" TIMESTAMPTZ(6),
    "zoho_calendar_id" VARCHAR,
    "position_id" TEXT,
    "zoho_last_sync" TIMESTAMPTZ(6),
    "employee_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor-basic-information" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "company_name" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "company_email" TEXT,
    "company_phone" TEXT,
    "status" BOOLEAN DEFAULT true,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zip_code" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "implementation_id" TEXT[],
    "client_id" TEXT[],

    CONSTRAINT "vendor-basic-information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_business_detailes" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "registration_number" TEXT,
    "tax_id" TEXT,
    "business_type" TEXT,
    "year_establiliesh" INTEGER,
    "total_employees" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_business_detailes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contact_person" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_contact_person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_document" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "vendor_id" TEXT NOT NULL,
    "document_type" TEXT,
    "document_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_relations" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "linked_vendor" TEXT,
    "linked_client" TEXT,
    "supports_visa_sponsorship" BOOLEAN NOT NULL,
    "visa_types_supported" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_authorization" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "work_authorization_type" TEXT,
    "visa_validation_type" TEXT,
    "willing_transfer_visa" BOOLEAN DEFAULT false,
    "ssn_number" TEXT,
    "passport_number" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_authorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_entry" (
    "id" TEXT NOT NULL,
    "status_update_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "hours_worked" DECIMAL(5,2) NOT NULL,
    "work_summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "blockers" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zithspace_admin_users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) DEFAULT 'ADMIN',
    "is_verified" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zithspace_admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zoho_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "location" TEXT,
    "user_id" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "attendees" JSONB,
    "calendar_name" VARCHAR(255),
    "exdate" JSONB,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "meeting_link" VARCHAR(255),
    "rrule" TEXT,
    "source_type" VARCHAR(100),
    "tenant_id" TEXT NOT NULL,

    CONSTRAINT "zoho_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "_AssignedRecruiters_AB_unique" ON "_AssignedRecruiters"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "_AssignedRecruiters_B_index" ON "_AssignedRecruiters"("B" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "_RequisitionRecruiters_AB_unique" ON "_RequisitionRecruiters"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "_RequisitionRecruiters_B_index" ON "_RequisitionRecruiters"("B" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_unique_user_date" ON "attendance"("tenant_id" ASC, "user_id" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "idx_attendance_sessions_attendance_id" ON "attendance_sessions"("attendance_id" ASC);

-- CreateIndex
CREATE INDEX "auth_logs_created_at_idx" ON "authorization_logs"("created_at" ASC);

-- CreateIndex
CREATE INDEX "auth_logs_tenant_user_idx" ON "authorization_logs"("tenant_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_bucket_members_bucket_id" ON "bucket_members"("bucket_id" ASC);

-- CreateIndex
CREATE INDEX "idx_bucket_members_user_id" ON "bucket_members"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_bucket_member" ON "bucket_members"("bucket_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_buckets_created_by_id" ON "buckets"("created_by_id" ASC);

-- CreateIndex
CREATE INDEX "idx_buckets_project_id" ON "buckets"("project_id" ASC);

-- CreateIndex
CREATE INDEX "idx_buckets_tenant_id" ON "buckets"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_bucket_per_project" ON "buckets"("tenant_id" ASC, "project_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "idx_exception_event_id" ON "calendar_event_exceptions"("event_id" ASC);

-- CreateIndex
CREATE INDEX "idx_exception_tenant_id" ON "calendar_event_exceptions"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_exception_user_id" ON "calendar_event_exceptions"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_event_occurrence" ON "calendar_event_exceptions"("event_id" ASC, "original_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_unique_provider_external_tenant" ON "calendar_events"("provider" ASC, "external_id" ASC, "tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_calendar_events_start_time" ON "calendar_events"("start_time" ASC);

-- CreateIndex
CREATE INDEX "idx_calendar_events_tenant" ON "calendar_events"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_calendar_events_user" ON "calendar_events"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_integrations_mail_account_id_unique" ON "calendar_integrations"("mail_account_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_integrations_unique_user_provider" ON "calendar_integrations"("user_id" ASC, "provider" ASC);

-- CreateIndex
CREATE INDEX "idx_calendar_integrations_provider" ON "calendar_integrations"("provider" ASC);

-- CreateIndex
CREATE INDEX "idx_calendar_integrations_tenant" ON "calendar_integrations"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_details_email_key" ON "candidate_details"("email" ASC);

-- CreateIndex
CREATE INDEX "candidate_educations_candidate_id_idx" ON "candidate_educations"("candidate_id" ASC);

-- CreateIndex
CREATE INDEX "candidate_interview_slots_candidate_id_idx" ON "candidate_interview_slots"("candidate_id" ASC);

-- CreateIndex
CREATE INDEX "candidate_skill_matrices_candidate_id_idx" ON "candidate_skill_matrices"("candidate_id" ASC);

-- CreateIndex
CREATE INDEX "candidate_work_experiences_candidate_id_idx" ON "candidate_work_experiences"("candidate_id" ASC);

-- CreateIndex
CREATE INDEX "candidates_email_idx" ON "candidates"("email" ASC);

-- CreateIndex
CREATE INDEX "candidates_tenant_id_idx" ON "candidates"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channel_id_user_id_key" ON "channel_members"("channel_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "channel_messages_channel_id_created_at_idx" ON "channel_messages"("channel_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "client_projects_client_id_project_id_key" ON "client_projects"("client_id" ASC, "project_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenant_id_email_key" ON "clients"("tenant_id" ASC, "email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_v2_client_code_key" ON "clients_v2"("client_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_v2_tenant_id_client_code_key" ON "clients_v2"("tenant_id" ASC, "client_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_companies_tenant_name" ON "companies"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "company_government_holidays_created_by_id_idx" ON "company_government_holidays"("created_by_id" ASC);

-- CreateIndex
CREATE INDEX "company_government_holidays_tenant_id_from_date_idx" ON "company_government_holidays"("tenant_id" ASC, "from_date" ASC);

-- CreateIndex
CREATE INDEX "company_government_holidays_tenant_id_idx" ON "company_government_holidays"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenant_id_code_key" ON "departments"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenant_id_name_key" ON "departments"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "document_history_createdbyid_idx" ON "document_history"("createdById" ASC);

-- CreateIndex
CREATE INDEX "document_history_documentid_idx" ON "document_history"("documentId" ASC);

-- CreateIndex
CREATE INDEX "idx_documenthub_created_by_id" ON "document_hub"("createdById" ASC);

-- CreateIndex
CREATE INDEX "idx_documenthub_project_id" ON "document_hub"("projectId" ASC);

-- CreateIndex
CREATE INDEX "idx_documenthub_tenant_id" ON "document_hub"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "idx_documenthub_ticket_id" ON "document_hub"("ticketId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "documents_share_token_key" ON "documents"("share_token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "documenttree_documentid_key" ON "documenttree"("documentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "dropdown_options_tenant_id_category_value_key" ON "dropdown_options"("tenant_id" ASC, "category" ASC, "value" ASC);

-- CreateIndex
CREATE INDEX "email_logs_customer_id_idx" ON "email_logs"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "email_logs_module_module_id_idx" ON "email_logs"("module" ASC, "module_id" ASC);

-- CreateIndex
CREATE INDEX "email_logs_module_sent_at_idx" ON "email_logs"("module" ASC, "sent_at" ASC);

-- CreateIndex
CREATE INDEX "email_logs_sent_at_idx" ON "email_logs"("sent_at" ASC);

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status" ASC);

-- CreateIndex
CREATE INDEX "email_logs_tenant_sent_at_idx" ON "email_logs"("tenant_id" ASC, "sent_at" ASC);

-- CreateIndex
CREATE INDEX "email_logs_to_email_idx" ON "email_logs"("to_email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_additional_details_employee_id_key" ON "employee_additional_details"("employee_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_bank_details_employee_id_key" ON "employee_bank_details"("employee_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_employee_field_tenant_company_system_key" ON "employee_field_configs"("tenant_id" ASC, "company_id" ASC, "system_key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_identities_employee_id_key" ON "employee_identities"("employee_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_details_employee_id_key" ON "employee_payroll_details"("employee_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_tenant_id_key" ON "employee_settings"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_timelines_employee_id_key" ON "employee_timelines"("employee_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employment_types_tenant_id_code_key" ON "employment_types"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employment_types_tenant_id_name_key" ON "employment_types"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "environments_tenant_code_unique" ON "environments"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "environments_tenant_idx" ON "environments"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "exit_notice_policies_code_key" ON "exit_notice_policies"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "feature_tiers_code_key" ON "feature_tiers"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "features_code_key" ON "features"("code" ASC);

-- CreateIndex
CREATE INDEX "idx_general_settings_tenant_id" ON "general_settings"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_code_key" ON "grades"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_activity_logs_invoice_id" ON "invoice_activity_logs"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_attachments_invoice_id" ON "invoice_attachments"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_items_invoice_id" ON "invoice_line_items"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_items_tenant_id" ON "invoice_line_items"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_line_items_invoice_id" ON "invoice_line_items"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_line_items_invoice_row" ON "invoice_line_items"("invoice_id" ASC, "row_number" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_line_items_tenant_id" ON "invoice_line_items"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_payments_invoice_id" ON "invoice_payments"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_payments_payment_date" ON "invoice_payments"("payment_date" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_payments_tenant_id" ON "invoice_payments"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_payments_tenant_invoice" ON "invoice_payments"("tenant_id" ASC, "invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_settings_tenant_id" ON "invoice_settings"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_taxes_invoice_id" ON "invoice_taxes"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoice_taxes_tenant_id" ON "invoice_taxes"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoices_customer_id" ON "invoices"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_invoices_first_payment_date" ON "invoices"("first_payment_date" ASC);

-- CreateIndex
CREATE INDEX "idx_invoices_last_payment_date" ON "invoices"("last_payment_date" ASC);

-- CreateIndex
CREATE INDEX "idx_invoices_status" ON "invoices"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_invoices_template_id" ON "invoices"("template_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number" ASC);

-- CreateIndex
CREATE INDEX "job_requisitions_client_id_idx" ON "job_requisitions"("client_id" ASC);

-- CreateIndex
CREATE INDEX "job_requisitions_tenant_id_status_idx" ON "job_requisitions"("tenant_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "job_requisitions_tenant_id_ticket_id_key" ON "job_requisitions"("tenant_id" ASC, "ticket_id" ASC);

-- CreateIndex
CREATE INDEX "leave_carry_forwards_leave_type_id_idx" ON "leave_carry_forwards"("leave_type_id" ASC);

-- CreateIndex
CREATE INDEX "leave_carry_forwards_sub_origin_id_idx" ON "leave_carry_forwards"("sub_origin_id" ASC);

-- CreateIndex
CREATE INDEX "leave_carry_forwards_tenant_id_idx" ON "leave_carry_forwards"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "leave_ledger_employee_id_idx" ON "leave_ledger"("employee_id" ASC);

-- CreateIndex
CREATE INDEX "leave_ledger_leave_type_id_idx" ON "leave_ledger"("leave_type_id" ASC);

-- CreateIndex
CREATE INDEX "leave_ledger_reference_id_idx" ON "leave_ledger"("reference_id" ASC);

-- CreateIndex
CREATE INDEX "leave_ledger_tenant_id_idx" ON "leave_ledger"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "leave_ledger_transaction_date_idx" ON "leave_ledger"("transaction_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "leave_origin_structures_tenant_id_origin_sub_origin_key" ON "leave_origin_structures"("tenant_id" ASC, "origin" ASC, "sub_origin_id" ASC);

-- CreateIndex
CREATE INDEX "leave_requests_created_by_id_idx" ON "leave_requests"("created_by_id" ASC);

-- CreateIndex
CREATE INDEX "leave_requests_leave_type_id_idx" ON "leave_requests"("leave_type_id" ASC);

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_employee_id_status_idx" ON "leave_requests"("tenant_id" ASC, "employee_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_tenant_id_code_key" ON "leave_types"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_accounts_tenant_id" ON "mail_accounts"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_accounts_user_id" ON "mail_accounts"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mail_accounts_provider_email_tenant_unique" ON "mail_accounts"("provider" ASC, "email" ASC, "tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_attachments_message_id" ON "mail_attachments"("message_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_attachments_tenant_id" ON "mail_attachments"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_messages_account_id" ON "mail_messages"("account_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_messages_tenant_id" ON "mail_messages"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_messages_thread_id" ON "mail_messages"("thread_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mail_messages_external_id_account_unique" ON "mail_messages"("external_id" ASC, "account_id" ASC);

-- CreateIndex
CREATE INDEX "mail_settings_active_idx" ON "mail_settings"("tenant_id" ASC, "is_active" ASC);

-- CreateIndex
CREATE INDEX "mail_settings_tenant_idx" ON "mail_settings"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mail_settings_unique_name_per_tenant" ON "mail_settings"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_sync_logs_account_id" ON "mail_sync_logs"("account_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_sync_logs_tenant_id" ON "mail_sync_logs"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_threads_account_id" ON "mail_threads"("account_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_threads_external_thread_id" ON "mail_threads"("external_thread_id" ASC);

-- CreateIndex
CREATE INDEX "idx_mail_threads_tenant_id" ON "mail_threads"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "meeting_participants_meeting_id_idx" ON "meeting_participants"("meeting_id" ASC);

-- CreateIndex
CREATE INDEX "idx_module_features_module" ON "module_features"("module_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code" ASC);

-- CreateIndex
CREATE INDEX "idx_payment_settings_tenant_id" ON "payment_settings"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payslip_field_tenant_label" ON "payslip_fields"("tenant_id" ASC, "label" ASC);

-- CreateIndex
CREATE INDEX "idx_payslips_tenant_employee" ON "payslips"("tenant_id" ASC, "employee_id" ASC);

-- CreateIndex
CREATE INDEX "idx_payslips_tenant_period" ON "payslips"("tenant_id" ASC, "from_date" ASC, "to_date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_unique" ON "permissions"("name" ASC);

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_tenant_id_name_key" ON "pipeline_stages"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_mapping" ON "plan_mappings"("plan_id" ASC, "module_id" ASC, "sub_module_id" ASC, "feature_id" ASC, "feature_tier_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "positions_tenant_id_code_key" ON "positions"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "projects_tenant_id_code_key" ON "projects"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_actions_tenant_id_action_name_key" ON "recruitment_actions"("tenant_id" ASC, "action_name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_statuses_tenant_id_status_name_key" ON "recruitment_statuses"("tenant_id" ASC, "status_name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token" ASC);

-- CreateIndex
CREATE INDEX "idx_ra_item" ON "reimbursement_attachments"("reimbursement_item_id" ASC);

-- CreateIndex
CREATE INDEX "idx_ra_request" ON "reimbursement_attachments"("reimbursement_request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_categories_tenant_id_name_key" ON "reimbursement_categories"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "idx_item_date" ON "reimbursement_item"("date" ASC);

-- CreateIndex
CREATE INDEX "idx_item_request" ON "reimbursement_item"("reimbursement_request_id" ASC);

-- CreateIndex
CREATE INDEX "idx_item_tenant" ON "reimbursement_item"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_reimbursement_policies_origin" ON "reimbursement_policies"("origin_type" ASC, "origin_id" ASC);

-- CreateIndex
CREATE INDEX "idx_policy_approvers_rule_id" ON "reimbursement_policy_approvers"("policy_rule_id" ASC);

-- CreateIndex
CREATE INDEX "idx_policy_rules_policy_id" ON "reimbursement_policy_rules"("policy_id" ASC);

-- CreateIndex
CREATE INDEX "idx_reimbursement_requests_category" ON "reimbursement_requests"("reimbursement_category_id" ASC);

-- CreateIndex
CREATE INDEX "idx_reimbursement_requests_status" ON "reimbursement_requests"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_reimbursement_requests_tenant_year" ON "reimbursement_requests"("tenant_id" ASC, "year" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "idx_reimbursement_requests_user" ON "reimbursement_requests"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_requests_tenant_id_request_id_key" ON "reimbursement_requests"("tenant_id" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_requests_tenant_id_year_request_id_key" ON "reimbursement_requests"("tenant_id" ASC, "year" ASC, "request_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "reimbursement_settings_categories_tenant_id_code_key" ON "reimbursement_settings_categories"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "release_plans_project_id_type_status_idx" ON "release_plans"("project_id" ASC, "type" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "release_plans_tenant_id_project_id_version_key" ON "release_plans"("tenant_id" ASC, "project_id" ASC, "version" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "repositories_tenant_id_name_key" ON "repositories"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_slug_unique" ON "roles"("tenant_id" ASC, "slug" ASC);

-- CreateIndex
CREATE INDEX "idx_logs_payout" ON "salary_approval_logs"("salary_payout_id" ASC);

-- CreateIndex
CREATE INDEX "idx_logs_tenant" ON "salary_approval_logs"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_logs_user" ON "salary_approval_logs"("performed_by_id" ASC);

-- CreateIndex
CREATE INDEX "idx_steps_fallback_user" ON "salary_approval_steps"("fallback_user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_steps_order" ON "salary_approval_steps"("step_order" ASC);

-- CreateIndex
CREATE INDEX "idx_steps_workflow" ON "salary_approval_steps"("workflow_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_workflow_step" ON "salary_approval_steps"("workflow_id" ASC, "step_order" ASC);

-- CreateIndex
CREATE INDEX "idx_workflow_active" ON "salary_approval_workflows"("is_active" ASC);

-- CreateIndex
CREATE INDEX "idx_workflow_tenant" ON "salary_approval_workflows"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_salary_component_tenant_code" ON "salary_components"("tenant_id" ASC, "component_code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_employee_month_year" ON "salary_payouts"("employee_id" ASC, "month" ASC, "year" ASC);

-- CreateIndex
CREATE INDEX "idx_structure_component_component" ON "salary_structure_components"("component_id" ASC);

-- CreateIndex
CREATE INDEX "idx_structure_component_structure" ON "salary_structure_components"("structure_id" ASC);

-- CreateIndex
CREATE INDEX "idx_salary_structure_tenant" ON "salary_structures"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_settings_profiles_general_id" ON "settings_profiles"("general_id" ASC);

-- CreateIndex
CREATE INDEX "idx_settings_profiles_invoice_id" ON "settings_profiles"("invoice_id" ASC);

-- CreateIndex
CREATE INDEX "idx_settings_profiles_payment_id" ON "settings_profiles"("payment_id" ASC);

-- CreateIndex
CREATE INDEX "idx_settings_profiles_tenant_id" ON "settings_profiles"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "shifts_tenant_id_name_key" ON "shifts"("tenant_id" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "idx_sprint_completion_logs_performed_at" ON "sprint_completion_logs"("performed_at" ASC);

-- CreateIndex
CREATE INDEX "idx_sprint_completion_logs_project_id" ON "sprint_completion_logs"("project_id" ASC);

-- CreateIndex
CREATE INDEX "idx_sprint_completion_logs_sprint_plan_id" ON "sprint_completion_logs"("sprint_plan_id" ASC);

-- CreateIndex
CREATE INDEX "idx_sprint_completion_logs_tenant_id" ON "sprint_completion_logs"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_sprint_completion_logs_ticket_id" ON "sprint_completion_logs"("ticket_id" ASC);

-- CreateIndex
CREATE INDEX "status_updates_tenant_id_date_idx" ON "status_updates"("tenant_id" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "status_updates_user_id_date_idx" ON "status_updates"("user_id" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sub_departments_tenant_id_code_key" ON "sub_departments"("tenant_id" ASC, "code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sub_modules_code_key" ON "sub_modules"("code" ASC);

-- CreateIndex
CREATE INDEX "idx_tenant_mappings_tenant_id" ON "tenant_mappings"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unique_tenant_mapping" ON "tenant_mappings"("tenant_id" ASC, "module_id" ASC, "sub_module_id" ASC, "feature_id" ASC, "feature_tier_id" ASC);

-- CreateIndex
CREATE INDEX "idx_tenant_modules_tenant" ON "tenant_modules"("tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_tenant_id_module_id_key" ON "tenant_modules"("tenant_id" ASC, "module_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain" ASC);

-- CreateIndex
CREATE INDEX "idx_attachment_tenant_ticket" ON "ticket_attachments"("tenant_id" ASC, "ticket_id" ASC);

-- CreateIndex
CREATE INDEX "idx_attachment_ticket" ON "ticket_attachments"("ticket_id" ASC);

-- CreateIndex
CREATE INDEX "ticket_attachments_tenant_id_ticket_id_idx" ON "ticket_attachments"("tenant_id" ASC, "ticket_id" ASC);

-- CreateIndex
CREATE INDEX "ticket_attachments_ticket_id_idx" ON "ticket_attachments"("ticket_id" ASC);

-- CreateIndex
CREATE INDEX "ticket_branches_repository_id_idx" ON "ticket_branches"("repository_id" ASC);

-- CreateIndex
CREATE INDEX "ticket_branches_ticket_id_idx" ON "ticket_branches"("ticket_id" ASC);

-- CreateIndex
CREATE INDEX "ticket_pull_requests_repository_id_idx" ON "ticket_pull_requests"("repository_id" ASC);

-- CreateIndex
CREATE INDEX "ticket_pull_requests_ticket_id_idx" ON "ticket_pull_requests"("ticket_id" ASC);

-- CreateIndex
CREATE INDEX "idx_tickets_bucket_id" ON "tickets"("bucket_id" ASC);

-- CreateIndex
CREATE INDEX "idx_tickets_is_deleted_deleted_at" ON "tickets"("is_deleted" ASC, "deleted_at" ASC);

-- CreateIndex
CREATE INDEX "idx_tickets_project_archived" ON "tickets"("project_id" ASC, "is_archived" ASC);

-- CreateIndex
CREATE INDEX "idx_tickets_project_is_deleted" ON "tickets"("project_id" ASC, "is_deleted" ASC);

-- CreateIndex
CREATE INDEX "idx_tickets_status_archived" ON "tickets"("status" ASC, "is_archived" ASC);

-- CreateIndex
CREATE INDEX "idx_tickets_tenant_archived" ON "tickets"("tenant_id" ASC, "is_archived" ASC);

-- CreateIndex
CREATE INDEX "idx_tickets_tenant_is_deleted" ON "tickets"("tenant_id" ASC, "is_deleted" ASC);

-- CreateIndex
CREATE INDEX "tickets_epic_id_idx" ON "tickets"("epic_id" ASC);

-- CreateIndex
CREATE INDEX "tickets_parent_id_idx" ON "tickets"("parent_id" ASC);

-- CreateIndex
CREATE INDEX "tickets_project_id_demo_plan_id_idx" ON "tickets"("project_id" ASC, "demo_plan_id" ASC);

-- CreateIndex
CREATE INDEX "tickets_project_id_release_plan_id_idx" ON "tickets"("project_id" ASC, "release_plan_id" ASC);

-- CreateIndex
CREATE INDEX "tickets_project_id_sprint_plan_id_idx" ON "tickets"("project_id" ASC, "sprint_plan_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_tenant_id_ticket_number_key" ON "tickets"("tenant_id" ASC, "ticket_number" ASC);

-- CreateIndex
CREATE INDEX "time_tracking_entries_project_id_idx" ON "time_tracking_entries"("project_id" ASC);

-- CreateIndex
CREATE INDEX "time_tracking_entries_tenant_id_user_id_idx" ON "time_tracking_entries"("tenant_id" ASC, "user_id" ASC);

-- CreateIndex
CREATE INDEX "time_tracking_logs_tenant_id_idx" ON "time_tracking_logs"("tenant_id" ASC);

-- CreateIndex
CREATE INDEX "time_tracking_logs_time_tracking_id_idx" ON "time_tracking_logs"("time_tracking_id" ASC);

-- CreateIndex
CREATE INDEX "idx_timesheet_rows_created_by" ON "timesheet_rows"("created_by_id" ASC);

-- CreateIndex
CREATE INDEX "idx_timesheet_rows_timesheet_id" ON "timesheet_rows"("timesheet_id" ASC);

-- CreateIndex
CREATE INDEX "idx_timesheet_rows_updated_by" ON "timesheet_rows"("updated_by_id" ASC);

-- CreateIndex
CREATE INDEX "idx_timesheets_user_id" ON "timesheets"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_timesheet_user_week" ON "timesheets"("user_id" ASC, "week_start" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id" ASC);

-- CreateIndex
CREATE INDEX "user_roles_user_tenant_idx" ON "user_roles"("user_id" ASC, "tenant_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_personal_email_key" ON "users"("tenant_id" ASC, "personal_email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_phone_key" ON "users"("tenant_id" ASC, "phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_work_email_key" ON "users"("tenant_id" ASC, "work_email" ASC);

-- CreateIndex
CREATE INDEX "idx_users_email" ON "zithspace_admin_users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "zithspace_admin_users_email_key" ON "zithspace_admin_users"("email" ASC);

-- CreateIndex
CREATE INDEX "idx_zoho_events_calendar_id" ON "zoho_events"("calendar_id" ASC);

-- CreateIndex
CREATE INDEX "idx_zoho_events_start_time" ON "zoho_events"("start_time" ASC);

-- CreateIndex
CREATE INDEX "idx_zoho_events_user_id" ON "zoho_events"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "zoho_events_event_user_unique" ON "zoho_events"("event_id" ASC, "user_id" ASC);

-- AddForeignKey
ALTER TABLE "EmployerContactPersons" ADD CONSTRAINT "EmployerContactPersons_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "EmployerManagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerDocuments" ADD CONSTRAINT "EmployerDocuments_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "EmployerManagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerManagement" ADD CONSTRAINT "EmployerManagement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerManagement" ADD CONSTRAINT "EmployerManagement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerManagement" ADD CONSTRAINT "EmployerManagement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_deal_users" ADD CONSTRAINT "assigned_deal_users_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assigned_deal_users" ADD CONSTRAINT "assigned_deal_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_disbursement_files" ADD CONSTRAINT "fk_bankfile_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_disbursement_files" ADD CONSTRAINT "fk_bankfile_sent_by" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_disbursement_files" ADD CONSTRAINT "fk_bankfile_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bucket_members" ADD CONSTRAINT "bucket_members_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bucket_members" ADD CONSTRAINT "bucket_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "fk_calendar_integrations_mail_account" FOREIGN KEY ("mail_account_id") REFERENCES "mail_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients_v2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_projects" ADD CONSTRAINT "client_projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients_v2" ADD CONSTRAINT "clients_v2_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients_v2" ADD CONSTRAINT "clients_v2_delivery_owner_id_fkey" FOREIGN KEY ("delivery_owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients_v2" ADD CONSTRAINT "clients_v2_sales_owner_id_fkey" FOREIGN KEY ("sales_owner_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients_v2" ADD CONSTRAINT "clients_v2_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_government_holidays" ADD CONSTRAINT "company_government_holidays_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_government_holidays" ADD CONSTRAINT "company_government_holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_government_holidays" ADD CONSTRAINT "company_government_holidays_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_communications" ADD CONSTRAINT "deal_communications_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_communications" ADD CONSTRAINT "deal_communications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_files" ADD CONSTRAINT "deal_files_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_files" ADD CONSTRAINT "deal_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_files" ADD CONSTRAINT "deal_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_payment_schedules" ADD CONSTRAINT "deal_payment_schedules_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_payment_schedules" ADD CONSTRAINT "deal_payment_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_hub" ADD CONSTRAINT "document_hub_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_hub" ADD CONSTRAINT "document_hub_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_hub" ADD CONSTRAINT "document_hub_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_hub" ADD CONSTRAINT "document_hub_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropdown_options" ADD CONSTRAINT "dropdown_options_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_exit_reason_id_fkey" FOREIGN KEY ("exit_reason_id") REFERENCES "reasons_for_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_exit_type_id_fkey" FOREIGN KEY ("exit_type_id") REFERENCES "exit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_assignment_components" ADD CONSTRAINT "fk_assignment" FOREIGN KEY ("assignment_id") REFERENCES "employee_salary_assignments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_salary_assignment_components" ADD CONSTRAINT "fk_component" FOREIGN KEY ("component_id") REFERENCES "salary_components"("key") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_salary_assignments" ADD CONSTRAINT "fk_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_salary_assignments" ADD CONSTRAINT "fk_structure" FOREIGN KEY ("structure_id") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_salary_assignments" ADD CONSTRAINT "fk_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employment_types" ADD CONSTRAINT "employment_types_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_types" ADD CONSTRAINT "employment_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_types" ADD CONSTRAINT "employment_types_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_types" ADD CONSTRAINT "exit_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_holidays" ADD CONSTRAINT "fixed_holidays_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_holidays" ADD CONSTRAINT "fixed_holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_holidays" ADD CONSTRAINT "fixed_holidays_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_settings" ADD CONSTRAINT "general_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_activity_logs" ADD CONSTRAINT "invoice_activity_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_templates" ADD CONSTRAINT "fk_invoice_templates_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_templates" ADD CONSTRAINT "fk_invoice_templates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "fk_invoices_template" FOREIGN KEY ("template_id") REFERENCES "invoice_templates"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_settings_profile_id_fkey" FOREIGN KEY ("settings_profile_id") REFERENCES "settings_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_origin_structures" ADD CONSTRAINT "leave_origin_structures_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_origin_structures" ADD CONSTRAINT "leave_origin_structures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_origin_structures" ADD CONSTRAINT "leave_origin_structures_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_accounts" ADD CONSTRAINT "fk_mail_accounts_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_accounts" ADD CONSTRAINT "fk_mail_accounts_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_accounts" ADD CONSTRAINT "fk_mail_accounts_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_accounts" ADD CONSTRAINT "fk_mail_accounts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_attachments" ADD CONSTRAINT "fk_mail_attachments_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_attachments" ADD CONSTRAINT "fk_mail_attachments_message" FOREIGN KEY ("message_id") REFERENCES "mail_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_attachments" ADD CONSTRAINT "fk_mail_attachments_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_attachments" ADD CONSTRAINT "fk_mail_attachments_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "fk_mail_messages_account" FOREIGN KEY ("account_id") REFERENCES "mail_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "fk_mail_messages_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "fk_mail_messages_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "fk_mail_messages_thread" FOREIGN KEY ("thread_id") REFERENCES "mail_threads"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_messages" ADD CONSTRAINT "fk_mail_messages_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_sync_logs" ADD CONSTRAINT "fk_mail_sync_logs_account" FOREIGN KEY ("account_id") REFERENCES "mail_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_sync_logs" ADD CONSTRAINT "fk_mail_sync_logs_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_sync_logs" ADD CONSTRAINT "fk_mail_sync_logs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_sync_logs" ADD CONSTRAINT "fk_mail_sync_logs_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "fk_mail_threads_account" FOREIGN KEY ("account_id") REFERENCES "mail_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "fk_mail_threads_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "fk_mail_threads_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "mail_threads" ADD CONSTRAINT "fk_mail_threads_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origin_leave_types" ADD CONSTRAINT "origin_leave_types_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origin_leave_types" ADD CONSTRAINT "origin_leave_types_leave_origin_id_fkey" FOREIGN KEY ("leave_origin_id") REFERENCES "leave_origin_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origin_leave_types" ADD CONSTRAINT "origin_leave_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origin_leave_types" ADD CONSTRAINT "origin_leave_types_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_sub_department_id_fkey" FOREIGN KEY ("sub_department_id") REFERENCES "sub_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasons_for_exit" ADD CONSTRAINT "reasons_for_exit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_client_basic_information" ADD CONSTRAINT "fk_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_client_basic_information" ADD CONSTRAINT "fk_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_client_basic_information" ADD CONSTRAINT "fk_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_client_business_detailes" ADD CONSTRAINT "fk_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_client_business_detailes" ADD CONSTRAINT "fk_recruitment_client" FOREIGN KEY ("recruitment_client_id") REFERENCES "recruitment_client_basic_information"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_client_business_detailes" ADD CONSTRAINT "fk_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_client_contact" ADD CONSTRAINT "fk_recruitment_client" FOREIGN KEY ("recruitment_client_id") REFERENCES "recruitment_client_basic_information"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruitment_client_hirring_preference" ADD CONSTRAINT "fk_recruitment" FOREIGN KEY ("recruitment_id") REFERENCES "recruitment_client_basic_information"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "recruitment_client_relationship" ADD CONSTRAINT "fk_recruitment_client_relationship" FOREIGN KEY ("recruitment_client_id") REFERENCES "recruitment_client_basic_information"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement_item_approvers" ADD CONSTRAINT "fk_reimbursement_item" FOREIGN KEY ("reimbursement_item_id") REFERENCES "reimbursement_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reimbursement_policy_approvers" ADD CONSTRAINT "fk_reimbursement" FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursements"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "release_plans" ADD CONSTRAINT "release_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_plans" ADD CONSTRAINT "release_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_plans" ADD CONSTRAINT "release_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_adjustments" ADD CONSTRAINT "fk_adjustment_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_adjustments" ADD CONSTRAINT "fk_adjustment_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_logs" ADD CONSTRAINT "fk_logs_payout" FOREIGN KEY ("salary_payout_id") REFERENCES "salary_payouts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_logs" ADD CONSTRAINT "fk_logs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_logs" ADD CONSTRAINT "fk_logs_user" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_steps" ADD CONSTRAINT "fk_steps_fallback_user" FOREIGN KEY ("fallback_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_steps" ADD CONSTRAINT "fk_steps_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_steps" ADD CONSTRAINT "fk_steps_user" FOREIGN KEY ("specific_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_steps" ADD CONSTRAINT "fk_steps_workflow" FOREIGN KEY ("workflow_id") REFERENCES "salary_approval_workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_approval_workflows" ADD CONSTRAINT "fk_workflow_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_payouts" ADD CONSTRAINT "fk_salary_approved_by" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_payouts" ADD CONSTRAINT "fk_salary_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_payouts" ADD CONSTRAINT "fk_salary_payout_paid_by" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_payouts" ADD CONSTRAINT "fk_salary_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_structure_components" ADD CONSTRAINT "fk_component" FOREIGN KEY ("component_id") REFERENCES "salary_components"("key") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_structure_components" ADD CONSTRAINT "fk_structure" FOREIGN KEY ("structure_id") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "fk_salary_structures_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "settings_profiles" ADD CONSTRAINT "settings_profiles_general_id_fkey" FOREIGN KEY ("general_id") REFERENCES "general_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_profiles" ADD CONSTRAINT "settings_profiles_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoice_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_profiles" ADD CONSTRAINT "settings_profiles_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings_profiles" ADD CONSTRAINT "settings_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprint_completion_logs" ADD CONSTRAINT "sprint_completion_logs_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "squad" ADD CONSTRAINT "fk_squad_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad" ADD CONSTRAINT "fk_squad_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad" ADD CONSTRAINT "fk_squad_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "fk_squad_members_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "fk_squad_members_squad" FOREIGN KEY ("squad_id") REFERENCES "squad"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "fk_squad_members_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "fk_squad_members_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "squad_members" ADD CONSTRAINT "fk_squad_members_user" FOREIGN KEY ("squad_member_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_departments" ADD CONSTRAINT "sub_departments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_departments" ADD CONSTRAINT "sub_departments_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_departments" ADD CONSTRAINT "sub_departments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_departments" ADD CONSTRAINT "sub_departments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activity_log" ADD CONSTRAINT "ticket_activity_log_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activity_log" ADD CONSTRAINT "ticket_activity_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activity_log" ADD CONSTRAINT "ticket_activity_log_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_branches" ADD CONSTRAINT "ticket_branches_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_branches" ADD CONSTRAINT "ticket_branches_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_pull_requests" ADD CONSTRAINT "ticket_pull_requests_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_pull_requests" ADD CONSTRAINT "ticket_pull_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_related_links" ADD CONSTRAINT "ticket_related_links_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_related_links" ADD CONSTRAINT "ticket_related_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_related_links" ADD CONSTRAINT "ticket_related_links_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_workflow_steps" ADD CONSTRAINT "ticket_workflow_steps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_workflow_steps" ADD CONSTRAINT "ticket_workflow_steps_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "buckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_demo_plan_id_fkey" FOREIGN KEY ("demo_plan_id") REFERENCES "release_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_release_plan_id_fkey" FOREIGN KEY ("release_plan_id") REFERENCES "release_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_report_to_id_fkey" FOREIGN KEY ("report_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sprint_plan_id_fkey" FOREIGN KEY ("sprint_plan_id") REFERENCES "release_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_tracking_entries" ADD CONSTRAINT "time_tracking_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_tracking_entries" ADD CONSTRAINT "time_tracking_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_tracking_entries" ADD CONSTRAINT "time_tracking_entries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_tracking_entries" ADD CONSTRAINT "time_tracking_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_tracking_logs" ADD CONSTRAINT "time_tracking_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_tracking_logs" ADD CONSTRAINT "time_tracking_logs_time_tracking_id_fkey" FOREIGN KEY ("time_tracking_id") REFERENCES "time_tracking_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_assigned_shift_id_fkey" FOREIGN KEY ("assigned_shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_shift_assigned_by_id_fkey" FOREIGN KEY ("shift_assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_authorization" ADD CONSTRAINT "fk_candidate_work_auth" FOREIGN KEY ("candidate_id") REFERENCES "candidate_details"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_entry" ADD CONSTRAINT "work_entry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_entry" ADD CONSTRAINT "work_entry_status_update_id_fkey" FOREIGN KEY ("status_update_id") REFERENCES "status_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_entry" ADD CONSTRAINT "work_entry_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zoho_events" ADD CONSTRAINT "fk_zoho_events_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "zoho_events" ADD CONSTRAINT "fk_zoho_events_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

