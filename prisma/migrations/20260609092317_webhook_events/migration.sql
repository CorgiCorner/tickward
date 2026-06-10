CREATE TABLE "webhook_endpoint" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "eventTypes" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),
  "lastDeliveredAt" TIMESTAMP(3),
  "lastFailedAt" TIMESTAMP(3),

  CONSTRAINT "webhook_endpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "projectId" TEXT,
  "timerId" TEXT,
  "shareId" TEXT,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "error" TEXT,

  CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_delivery" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "responseStatus" INTEGER,
  "responseBody" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_event_dedupeKey_key" ON "webhook_event"("dedupeKey");
CREATE UNIQUE INDEX "webhook_delivery_eventId_endpointId_key" ON "webhook_delivery"("eventId", "endpointId");

CREATE INDEX "webhook_endpoint_userId_status_idx" ON "webhook_endpoint"("userId", "status");
CREATE INDEX "webhook_event_status_availableAt_idx" ON "webhook_event"("status", "availableAt");
CREATE INDEX "webhook_event_userId_type_occurredAt_idx" ON "webhook_event"("userId", "type", "occurredAt");
CREATE INDEX "webhook_event_projectId_type_idx" ON "webhook_event"("projectId", "type");
CREATE INDEX "webhook_event_timerId_type_idx" ON "webhook_event"("timerId", "type");
CREATE INDEX "webhook_delivery_status_nextAttemptAt_idx" ON "webhook_delivery"("status", "nextAttemptAt");
CREATE INDEX "webhook_delivery_endpointId_status_idx" ON "webhook_delivery"("endpointId", "status");
CREATE INDEX "webhook_delivery_userId_createdAt_idx" ON "webhook_delivery"("userId", "createdAt");

ALTER TABLE "webhook_endpoint"
  ADD CONSTRAINT "webhook_endpoint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_event"
  ADD CONSTRAINT "webhook_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_delivery"
  ADD CONSTRAINT "webhook_delivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_delivery"
  ADD CONSTRAINT "webhook_delivery_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "webhook_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_delivery"
  ADD CONSTRAINT "webhook_delivery_endpointId_fkey"
  FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
