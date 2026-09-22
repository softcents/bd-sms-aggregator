ALTER TABLE "Message" ADD COLUMN "dlrClaimedAt" TIMESTAMP(3);
CREATE INDEX "Message_dlrClaimedAt_status_idx" ON "Message"("dlrClaimedAt","status");