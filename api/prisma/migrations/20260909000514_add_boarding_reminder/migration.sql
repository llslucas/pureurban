-- CreateTable
CREATE TABLE "boarding"."boarding_reminders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "remindedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boarding_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boarding_reminders_companyId_idx" ON "boarding"."boarding_reminders"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "boarding_reminders_tripId_studentId_key" ON "boarding"."boarding_reminders"("tripId", "studentId");
