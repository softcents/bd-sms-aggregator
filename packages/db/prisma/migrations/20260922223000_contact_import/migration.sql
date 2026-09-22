CREATE TABLE "ContactImport" (
 "id" BIGSERIAL PRIMARY KEY,
 "externalId" TEXT NOT NULL UNIQUE,
 "userId" BIGINT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "fileName" TEXT,
 "status" TEXT NOT NULL DEFAULT 'processing',
 "totalRows" INT NOT NULL DEFAULT 0,
 "importedRows" INT NOT NULL DEFAULT 0,
 "skippedRows" INT NOT NULL DEFAULT 0,
 "errorRows" INT NOT NULL DEFAULT 0,
 "groupId" BIGINT REFERENCES "ContactGroup"("id") ON DELETE SET NULL,
 "errorReport" JSONB,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "completedAt" TIMESTAMPTZ
);
CREATE INDEX "ContactImport_userId_createdAt_idx" ON "ContactImport"("userId","createdAt");