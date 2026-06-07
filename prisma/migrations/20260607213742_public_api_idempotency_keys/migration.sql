-- Store completed public API write responses so clients can safely retry.
CREATE TABLE "public_api_idempotency_key" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_api_idempotency_key_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_api_idempotency_key_apiKeyId_keyHash_key"
  ON "public_api_idempotency_key"("apiKeyId", "keyHash");

CREATE INDEX "public_api_idempotency_key_userId_idx"
  ON "public_api_idempotency_key"("userId");

CREATE INDEX "public_api_idempotency_key_expiresAt_idx"
  ON "public_api_idempotency_key"("expiresAt");

ALTER TABLE "public_api_idempotency_key"
  ADD CONSTRAINT "public_api_idempotency_key_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "api_key"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public_api_idempotency_key"
  ADD CONSTRAINT "public_api_idempotency_key_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
