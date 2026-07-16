DROP INDEX "timer_attention_event_userId_timerId_targetAtMs_key";

CREATE UNIQUE INDEX "timer_attention_event_userId_projectId_timerId_targetAtMs_key"
  ON "timer_attention_event"("userId", "projectId", "timerId", "targetAtMs");
