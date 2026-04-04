-- CreateTable
CREATE TABLE "payslip_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,
    "generated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unique_payslip_payout" ON "payslip_records"("payout_id");

-- AddForeignKey
ALTER TABLE "payslip_records" ADD CONSTRAINT "fk_payslip_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payslip_records" ADD CONSTRAINT "fk_payslip_payout" FOREIGN KEY ("payout_id") REFERENCES "salary_payouts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payslip_records" ADD CONSTRAINT "fk_payslip_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payslip_records" ADD CONSTRAINT "fk_payslip_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
