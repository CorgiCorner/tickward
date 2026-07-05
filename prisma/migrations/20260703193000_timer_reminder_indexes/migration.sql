-- Cover the scheduler pick query and the inbox retention sweep.
CREATE INDEX "notification_outbox_item_workflow_status_scheduled_for_idx" ON "notification_outbox_item"("workflowIdentifier", "status", "scheduledFor");
CREATE INDEX "in_app_notification_createdAt_idx" ON "in_app_notification"("createdAt");
