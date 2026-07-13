-- CreateTable: runtime-configurable limits for each public plan
CREATE TABLE "plan_entitlements" (
    "plan" TEXT NOT NULL,
    "maxTimers" INTEGER NOT NULL,
    "maxTimersPerSpace" INTEGER NOT NULL,
    "maxProjects" INTEGER NOT NULL,
    "maxSpaces" INTEGER NOT NULL,
    "maxSnapshotTimers" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("plan")
);
