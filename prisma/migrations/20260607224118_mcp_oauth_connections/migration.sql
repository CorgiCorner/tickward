-- Add first-party MCP OAuth consent grants and scoped MCP connection credentials.
ALTER TABLE "api_key"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'api_key',
  ADD COLUMN "clientName" TEXT,
  ADD COLUMN "scopes" JSONB;

ALTER TABLE "api_key"
  ADD CONSTRAINT "api_key_kind_check" CHECK ("kind" IN ('api_key', 'mcp_connection'));

CREATE INDEX "api_key_userId_kind_revokedAt_idx"
  ON "api_key"("userId", "kind", "revokedAt");

CREATE TABLE "mcp_authorization_grant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "clientName" TEXT,
  "scopes" JSONB NOT NULL,
  "mcpOrigin" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),

  CONSTRAINT "mcp_authorization_grant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_authorization_grant_tokenHash_key"
  ON "mcp_authorization_grant"("tokenHash");

CREATE INDEX "mcp_authorization_grant_userId_expiresAt_idx"
  ON "mcp_authorization_grant"("userId", "expiresAt");

CREATE INDEX "mcp_authorization_grant_expiresAt_idx"
  ON "mcp_authorization_grant"("expiresAt");

ALTER TABLE "mcp_authorization_grant"
  ADD CONSTRAINT "mcp_authorization_grant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
