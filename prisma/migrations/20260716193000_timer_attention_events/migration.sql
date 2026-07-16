-- Store per-user zero-cross attention without changing shared timer data.
CREATE TABLE "timer_attention_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "timerId" TEXT NOT NULL,
  "targetAtMs" BIGINT NOT NULL,
  "crossedAt" TIMESTAMP(3) NOT NULL,
  "firstSeenAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "deferredUntil" TIMESTAMP(3),

  CONSTRAINT "timer_attention_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "timer_attention_event_userId_timerId_targetAtMs_key"
  ON "timer_attention_event"("userId", "timerId", "targetAtMs");
CREATE INDEX "timer_attention_event_userId_acknowledgedAt_idx"
  ON "timer_attention_event"("userId", "acknowledgedAt");
CREATE INDEX "timer_attention_event_timerId_idx"
  ON "timer_attention_event"("timerId");

ALTER TABLE "timer_attention_event"
  ADD CONSTRAINT "timer_attention_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
