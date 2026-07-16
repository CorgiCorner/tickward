-- Bind each per-user attention occurrence to the exact project-local timer.
ALTER TABLE "timer_attention_event" ADD COLUMN "projectId" TEXT;

-- Existing attention rows were created only for timers owned by the same user.
-- Match both the timer id and absolute occurrence timestamp, preferring the
-- timer row's owner marker before the owning project when legacy data overlaps.
WITH matching_timer AS (
  SELECT
    event."id" AS "eventId",
    timer."projectId",
    ROW_NUMBER() OVER (
      PARTITION BY event."id"
      ORDER BY
        CASE
          WHEN timer."ownerId" = event."userId" THEN 0
          WHEN project."ownerId" = event."userId" THEN 1
          ELSE 2
        END,
        timer."updatedAt" DESC,
        timer."projectId"
    ) AS rank
  FROM "timer_attention_event" AS event
  JOIN "timer" AS timer
    ON timer."id" = event."timerId"
  JOIN "project" AS project
    ON project."id" = timer."projectId"
  WHERE
    (timer."ownerId" = event."userId" OR project."ownerId" = event."userId")
    AND timer."archivedAt" IS NULL
    AND timer."data" ->> 'archivedAt' IS NULL
    AND COALESCE((timer."data" -> 'recurrence' ->> 'enabled')::BOOLEAN, false) = false
    AND (EXTRACT(EPOCH FROM ((timer."data" ->> 'targetDate')::timestamptz)) * 1000)::BIGINT = event."targetAtMs"
    AND (timer."data" ->> 'targetDate')::timestamptz <= CURRENT_TIMESTAMP
)
UPDATE "timer_attention_event" AS event
SET "projectId" = matching_timer."projectId"
FROM matching_timer
WHERE event."id" = matching_timer."eventId" AND matching_timer.rank = 1;

-- An unmatched overlay can no longer be associated safely and is invalid.
DELETE FROM "timer_attention_event" WHERE "projectId" IS NULL;

ALTER TABLE "timer_attention_event" ALTER COLUMN "projectId" SET NOT NULL;

CREATE INDEX "timer_attention_event_projectId_timerId_idx"
  ON "timer_attention_event"("projectId", "timerId");

ALTER TABLE "timer_attention_event"
  ADD CONSTRAINT "timer_attention_event_projectId_timerId_fkey"
  FOREIGN KEY ("projectId", "timerId") REFERENCES "timer"("projectId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
