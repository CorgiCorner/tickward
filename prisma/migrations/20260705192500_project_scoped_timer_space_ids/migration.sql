-- Scope timer and space ids to their project. The public API's duplicate-id
-- semantics have always been per project, but the primary keys were global,
-- so a client-supplied id taken in another account's project was rejected
-- (leaking that the id exists elsewhere). Existing rows keep their ids.

ALTER TABLE "timer" DROP CONSTRAINT "timer_pkey";
ALTER TABLE "timer" ADD CONSTRAINT "timer_pkey" PRIMARY KEY ("projectId", "id");
DROP INDEX "timer_projectId_idx";
-- Reminder outbox rows created before this migration only carry the timer id.
CREATE INDEX "timer_id_idx" ON "timer"("id");

ALTER TABLE "space" DROP CONSTRAINT "space_pkey";
ALTER TABLE "space" ADD CONSTRAINT "space_pkey" PRIMARY KEY ("projectId", "id");
DROP INDEX "space_projectId_idx";
