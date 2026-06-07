-- CreateTable
CREATE TABLE "notification_delivery_log" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "timerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "providerMessageId" TEXT,
    "recipientType" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "senderType" TEXT,
    "senderId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "notification_delivery_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_log_idempotencyKey_channel_provider_recipientHash_key" ON "notification_delivery_log"("idempotencyKey", "channel", "provider", "recipientHash");

-- CreateIndex
CREATE INDEX "notification_delivery_log_timerId_idx" ON "notification_delivery_log"("timerId");

-- CreateIndex
CREATE INDEX "notification_delivery_log_channel_status_createdAt_idx" ON "notification_delivery_log"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_delivery_log_provider_createdAt_idx" ON "notification_delivery_log"("provider", "createdAt");
