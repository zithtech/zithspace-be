/*
  Warnings:

  - The values [MANAGER,ROLE] on the enum `approver_type` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `role_id` on the `salary_approval_steps` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "approver_type_new" AS ENUM ('SPECIFIC_USER', 'POSITION');
ALTER TABLE "salary_approval_steps" ALTER COLUMN "approver_type" TYPE "approver_type_new" USING ("approver_type"::text::"approver_type_new");
ALTER TYPE "approver_type" RENAME TO "approver_type_old";
ALTER TYPE "approver_type_new" RENAME TO "approver_type";
DROP TYPE "approver_type_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "salary_approval_steps" DROP CONSTRAINT "fk_steps_role";

-- AlterTable
ALTER TABLE "salary_approval_steps" DROP COLUMN "role_id",
ADD COLUMN     "position_id" UUID;

-- AddForeignKey
ALTER TABLE "salary_approval_steps" ADD CONSTRAINT "fk_steps_position" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
