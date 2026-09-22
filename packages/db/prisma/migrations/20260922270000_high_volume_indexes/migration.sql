CREATE INDEX IF NOT EXISTS "Message_batchId_status_id_idx" ON "Message" ("batchId","status","id");
CREATE INDEX IF NOT EXISTS "Message_userId_createdAt_id_idx" ON "Message" ("userId","createdAt","id");
CREATE INDEX IF NOT EXISTS "Message_status_id_idx" ON "Message" ("status","id");
CREATE INDEX IF NOT EXISTS "OutboxEvent_availableAt_id_idx" ON "OutboxEvent" ("availableAt","id");
CREATE INDEX IF NOT EXISTS "OutboxEvent_unpublished_available_idx" ON "OutboxEvent" ("availableAt","id") WHERE "publishedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Message_dlr_poll_idx" ON "Message" ("nextPollAt","id") WHERE status='sent' AND "gatewayMessageId" IS NOT NULL;
