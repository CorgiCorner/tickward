-- Align historical notification defaults and PostgreSQL-truncated index names
-- with the current Prisma schema.
ALTER TABLE "notification_delivery_log"
  ALTER COLUMN "workflowIdentifier" DROP DEFAULT;

ALTER INDEX "notification_delivery_log_transactionId_channel_providerId_reci"
  RENAME TO "notification_delivery_log_transactionId_channel_providerId__key";
ALTER INDEX "notification_delivery_log_workflowIdentifier_status_createdAt_i"
  RENAME TO "notification_delivery_log_workflowIdentifier_status_created_idx";
ALTER INDEX "notification_outbox_item_workflowIdentifier_status_createdAt_id"
  RENAME TO "notification_outbox_item_workflowIdentifier_status_createdA_idx";
