-- Store account-level settings used by the Settings page.
CREATE TABLE "user_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultTimezone" TEXT,
    "browserNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fullPageAlarm" BOOLEAN NOT NULL DEFAULT false,
    "notificationSound" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_preference_userId_key" ON "user_preference"("userId");
CREATE INDEX "user_preference_userId_idx" ON "user_preference"("userId");

ALTER TABLE "user_preference"
  ADD CONSTRAINT "user_preference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
