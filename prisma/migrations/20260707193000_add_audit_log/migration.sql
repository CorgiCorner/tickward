CREATE TABLE "audit_log" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,

  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");
CREATE INDEX "audit_log_actorId_createdAt_idx" ON "audit_log"("actorId", "createdAt");
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");
