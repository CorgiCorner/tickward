-- Add one-time device authorization grants for browser-based native app connect flows.
CREATE TABLE "device_authorization_grant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),

  CONSTRAINT "device_authorization_grant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_authorization_grant_tokenHash_key"
  ON "device_authorization_grant"("tokenHash");

CREATE INDEX "device_authorization_grant_userId_expiresAt_idx"
  ON "device_authorization_grant"("userId", "expiresAt");

CREATE INDEX "device_authorization_grant_expiresAt_idx"
  ON "device_authorization_grant"("expiresAt");

ALTER TABLE "device_authorization_grant"
  ADD CONSTRAINT "device_authorization_grant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
