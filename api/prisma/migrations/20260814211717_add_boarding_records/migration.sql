-- CreateTable
CREATE TABLE "boarding"."boarding_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boarding_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boarding_records_companyId_idempotencyKey_key" ON "boarding"."boarding_records"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_records_tripId_studentId_key" ON "boarding"."boarding_records"("tripId", "studentId");
