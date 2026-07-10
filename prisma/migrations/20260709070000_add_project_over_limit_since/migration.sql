-- AlterTable: add nullable overLimitSince column to project
ALTER TABLE "project" ADD COLUMN "overLimitSince" TIMESTAMP(3);

-- CreateIndex: index for the over-limit GC sweep (full index — matches @@index in schema.prisma)
CREATE INDEX "project_overLimitSince_idx" ON "project"("overLimitSince");
