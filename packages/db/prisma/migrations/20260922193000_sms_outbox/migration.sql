ALTER TABLE "Batch" ADD COLUMN "externalId" TEXT;
UPDATE "Batch" SET "externalId" = gen_random_uuid()::text WHERE "externalId" IS NULL;
ALTER TABLE "Batch" ALTER COLUMN "externalId" SET NOT NULL;
CREATE UNIQUE INDEX "Batch_externalId_key" ON "Batch"("externalId");
CREATE TABLE "OutboxEvent" (
  "id" BIGSERIAL PRIMARY KEY,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "publishedAt" TIMESTAMPTZ,
  "lockedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "OutboxEvent_publishedAt_availableAt_idx" ON "OutboxEvent" ("publishedAt","availableAt");
