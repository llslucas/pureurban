-- CreateTable
CREATE TABLE "boarding"."boarding_absences" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancellableUntil" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boarding_absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boarding_absences_tripId_studentId_idx" ON "boarding"."boarding_absences"("tripId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_absences_companyId_idempotencyKey_key" ON "boarding"."boarding_absences"("companyId", "idempotencyKey");
