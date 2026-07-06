-- Add the account-level master switch for in-app notifications.
ALTER TABLE "user_preference" ADD COLUMN "inAppNotifications" BOOLEAN NOT NULL DEFAULT true;
