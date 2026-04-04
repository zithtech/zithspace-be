-- CreateTable
CREATE TABLE "OpeningManagement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "hiringManagerId" TEXT NOT NULL,
    "minExperience" INTEGER,
    "maxExperience" INTEGER,
    "primarySkills" TEXT[],
    "noticePeriod" INTEGER,
    "jobDescription" TEXT,
    "baseLocation" TEXT,
    "workArrangement" TEXT,
    "employmentType" TEXT,
    "totalOpenings" INTEGER,
    "minSalary" DOUBLE PRECISION,
    "maxSalary" DOUBLE PRECISION,
    "currency" TEXT,
    "priorityLevel" TEXT,
    "currentStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "OpeningManagement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OpeningManagement" ADD CONSTRAINT "OpeningManagement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningManagement" ADD CONSTRAINT "OpeningManagement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningManagement" ADD CONSTRAINT "OpeningManagement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
