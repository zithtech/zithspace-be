-- CreateTable
CREATE TABLE "test" (
    "id" TEXT NOT NULL,
    "field_a" TEXT NOT NULL,
    "field_b" TEXT,

    CONSTRAINT "test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_2" (
    "id" TEXT NOT NULL,
    "field_a" TEXT NOT NULL,
    "field_b" TEXT,

    CONSTRAINT "test_2_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "employee_work_details" ADD CONSTRAINT "employee_work_details_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
