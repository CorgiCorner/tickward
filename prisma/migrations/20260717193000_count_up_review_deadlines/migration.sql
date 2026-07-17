-- Materialize the effective Review deadline and remember whether the
-- occurrence used the global policy or a per-timer afterZero override.
ALTER TABLE "timer_attention_event"
  ADD COLUMN "reviewExpiresAt" TIMESTAMP(3),
  ADD COLUMN "usesDefaultPolicy" BOOLEAN NOT NULL DEFAULT true;

UPDATE "timer_attention_event"
SET "reviewExpiresAt" = CASE
  WHEN "firstSeenAt" IS NULL THEN NULL
  WHEN "deferredUntil" IS NOT NULL THEN "deferredUntil"
  WHEN "policyMode" = 'after-seen-5m' THEN "firstSeenAt" + INTERVAL '5 minutes'
  WHEN "policyMode" = 'after-seen-15m' THEN "firstSeenAt" + INTERVAL '15 minutes'
  WHEN "policyMode" = 'after-seen-1h' THEN "firstSeenAt" + INTERVAL '1 hour'
  WHEN "policyMode" = 'after-seen-1d' THEN "firstSeenAt" + INTERVAL '1 day'
  WHEN "policyMode" = 'custom' AND "policyMinutes" IS NOT NULL
    THEN "firstSeenAt" + ("policyMinutes" * INTERVAL '1 minute')
  ELSE NULL
END;

UPDATE "timer_attention_event" AS occurrence
SET "usesDefaultPolicy" = COALESCE(timer."data" -> 'afterZero' ->> 'mode', 'use-default') = 'use-default'
FROM "timer" AS timer
WHERE timer."projectId" = occurrence."projectId"
  AND timer."id" = occurrence."timerId";
