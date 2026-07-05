-- Add storage for timer reminder intents and in-app delivery.
ALTER TABLE "user_preference" ADD COLUMN "emailReminders" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "in_app_notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timerId" TEXT,
    "projectId" TEXT,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "in_app_notification_userId_transactionId_key" ON "in_app_notification"("userId", "transactionId");
CREATE INDEX "in_app_notification_userId_readAt_createdAt_idx" ON "in_app_notification"("userId", "readAt", "createdAt");
CREATE INDEX "notification_outbox_item_timerId_status_idx" ON "notification_outbox_item"("timerId", "status");

ALTER TABLE "in_app_notification"
  ADD CONSTRAINT "in_app_notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
