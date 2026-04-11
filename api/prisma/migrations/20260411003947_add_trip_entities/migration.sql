-- CreateEnum
CREATE TYPE "trip"."TripStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "trip"."TripType" AS ENUM ('OUTBOUND', 'RETURN');

-- CreateTable
CREATE TABLE "trip"."trips" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "trip"."TripType" NOT NULL,
    "status" "trip"."TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "relatedTripId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trips_relatedTripId_key" ON "trip"."trips"("relatedTripId");

-- CreateIndex
CREATE INDEX "trips_driverId_status_idx" ON "trip"."trips"("driverId", "status");

-- CreateIndex
CREATE INDEX "trips_routeId_status_idx" ON "trip"."trips"("routeId", "status");

-- CreateIndex
CREATE INDEX "trips_companyId_idx" ON "trip"."trips"("companyId");

-- AddForeignKey
ALTER TABLE "trip"."trips" ADD CONSTRAINT "trips_relatedTripId_fkey" FOREIGN KEY ("relatedTripId") REFERENCES "trip"."trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
