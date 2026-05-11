-- CreateTable
CREATE TABLE "routing"."route_students" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing"."route_drivers" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "route_students_companyId_idx" ON "routing"."route_students"("companyId");

-- CreateIndex
CREATE INDEX "route_students_studentId_idx" ON "routing"."route_students"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "route_students_routeId_studentId_key" ON "routing"."route_students"("routeId", "studentId");

-- CreateIndex
CREATE INDEX "route_drivers_companyId_idx" ON "routing"."route_drivers"("companyId");

-- CreateIndex
CREATE INDEX "route_drivers_driverId_idx" ON "routing"."route_drivers"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "route_drivers_routeId_driverId_key" ON "routing"."route_drivers"("routeId", "driverId");

-- AddForeignKey
ALTER TABLE "routing"."route_students" ADD CONSTRAINT "route_students_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routing"."routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."route_students" ADD CONSTRAINT "route_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."route_drivers" ADD CONSTRAINT "route_drivers_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routing"."routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."route_drivers" ADD CONSTRAINT "route_drivers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
