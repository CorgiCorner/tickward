ALTER TABLE "user_preference"
  ADD COLUMN "attentionPolicy" TEXT NOT NULL DEFAULT 'until-i-move-it',
  ADD COLUMN "attentionPolicyMinutes" INTEGER,
  ADD COLUMN "attentionIntroDismissed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "timer_attention_event"
  ADD COLUMN "policyMode" TEXT NOT NULL DEFAULT 'until-i-move-it',
  ADD COLUMN "policyMinutes" INTEGER;
