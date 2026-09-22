ALTER TABLE "ApiKey" ADD COLUMN "externalId" TEXT;
UPDATE "ApiKey" SET "externalId" = gen_random_uuid()::text WHERE "externalId" IS NULL;
ALTER TABLE "ApiKey" ALTER COLUMN "externalId" SET NOT NULL;
CREATE UNIQUE INDEX "ApiKey_externalId_key" ON "ApiKey"("externalId");
