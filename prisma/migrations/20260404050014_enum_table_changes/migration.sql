-- CreateTable
CREATE TABLE "salary_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "current_salary" DECIMAL(12,2) NOT NULL,
    "revision_type" TEXT NOT NULL,
    "revision_amount" DECIMAL(12,2) NOT NULL,
    "new_salary" DECIMAL(12,2) NOT NULL,
    "effective_from" TIMESTAMP(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_revisions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "salary_revisions" ADD CONSTRAINT "fk_revision_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_revisions" ADD CONSTRAINT "fk_revision_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "salary_revisions" ADD CONSTRAINT "fk_revision_creator" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
