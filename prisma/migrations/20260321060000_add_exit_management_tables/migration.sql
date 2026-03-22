-- CreateTable: exit_types
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

-- CreateTable: reasons_for_exit
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

-- CreateTable: exit_approval_workflows
CREATE TABLE "exit_approval_workflows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_type" VARCHAR(50) NOT NULL,
    "approver_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exit_approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable: employee_exits
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
    "notice_period_day" TIMESTAMP(3) NOT NULL,
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

-- AddForeignKey
ALTER TABLE "exit_types" ADD CONSTRAINT "exit_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reasons_for_exit" ADD CONSTRAINT "reasons_for_exit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_approval_workflows" ADD CONSTRAINT "exit_approval_workflows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_exit_type_id_fkey" FOREIGN KEY ("exit_type_id") REFERENCES "exit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_exit_reason_id_fkey" FOREIGN KEY ("exit_reason_id") REFERENCES "reasons_for_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
