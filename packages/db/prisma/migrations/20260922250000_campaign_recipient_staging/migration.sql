CREATE TABLE "CampaignRecipient" (
  "id" BIGSERIAL PRIMARY KEY,
  "batchId" BIGINT NOT NULL REFERENCES "Batch"("id") ON DELETE CASCADE,
  "phone" TEXT NOT NULL,
  "operatorId" BIGINT,
  "rate" DECIMAL(18,6),
  "cost" DECIMAL(18,6),
  "parts" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "messageId" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("batchId","phone")
);
CREATE INDEX "CampaignRecipient_batchId_status_id_idx" ON "CampaignRecipient"("batchId","status","id");