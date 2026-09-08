/*
  Warnings:

  - A unique constraint covering the columns `[companyId,cancelIdempotencyKey]` on the table `boarding_absences` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "boarding"."boarding_absences" ADD COLUMN "cancelIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "boarding_absences_companyId_cancelIdempotencyKey_key" ON "boarding"."boarding_absences"("companyId", "cancelIdempotencyKey");
