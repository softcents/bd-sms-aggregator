ALTER TABLE "User" ADD COLUMN "username" TEXT;
UPDATE "User" SET "username" = lower(regexp_replace(coalesce("name",'customer'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || "id"::text WHERE "username" IS NULL;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
