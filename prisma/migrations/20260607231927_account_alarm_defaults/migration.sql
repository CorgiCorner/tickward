-- Default timer alarms to an in-app full-page alarm with the polite sound.
ALTER TABLE "user_preference"
  ALTER COLUMN "fullPageAlarm" SET DEFAULT true,
  ALTER COLUMN "notificationSound" SET DEFAULT 'polite';
