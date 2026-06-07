-- Align notification tracking fields with workflow event terminology.
ALTER TABLE "notification_delivery_log" RENAME COLUMN "idempotencyKey" TO "transactionId";
ALTER TABLE "notification_delivery_log" RENAME COLUMN "provider" TO "providerId";

ALTER TABLE "notification_delivery_log" ADD COLUMN "workflowIdentifier" TEXT NOT NULL DEFAULT 'timer.finished';
ALTER TABLE "notification_delivery_log" ADD COLUMN "subscriberId" TEXT;

ALTER INDEX "notification_delivery_log_idempotencyKey_channel_provider_recipientHash_key" RENAME TO "notification_delivery_log_transactionId_channel_providerId_recipientHash_key";
ALTER INDEX "notification_delivery_log_provider_createdAt_idx" RENAME TO "notification_delivery_log_providerId_createdAt_idx";

CREATE INDEX "notification_delivery_log_workflowIdentifier_status_createdAt_idx" ON "notification_delivery_log"("workflowIdentifier", "status", "createdAt");

-- Store workflow trigger intents before delivery so a worker can take over later.
CREATE TABLE "notification_outbox_item" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "workflowIdentifier" TEXT NOT NULL,
    "subscriberId" TEXT,
    "timerId" TEXT,
    "channels" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "overrides" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "notification_outbox_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_outbox_item_transactionId_key" ON "notification_outbox_item"("transactionId");
CREATE INDEX "notification_outbox_item_subscriberId_idx" ON "notification_outbox_item"("subscriberId");
CREATE INDEX "notification_outbox_item_workflowIdentifier_status_createdAt_idx" ON "notification_outbox_item"("workflowIdentifier", "status", "createdAt");
CREATE INDEX "notification_outbox_item_status_scheduledFor_idx" ON "notification_outbox_item"("status", "scheduledFor");

ALTER TABLE "notification_outbox_item" ADD CONSTRAINT "notification_outbox_item_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
