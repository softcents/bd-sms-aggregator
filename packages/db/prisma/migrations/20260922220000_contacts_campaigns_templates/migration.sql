CREATE TABLE "Contact" (
 "id" BIGSERIAL PRIMARY KEY,
 "userId" BIGINT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL DEFAULT '',
 "phone" TEXT NOT NULL,
 "email" TEXT,
 "group_name" TEXT,
 "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "Contact_user_phone_key" UNIQUE ("userId","phone")
);
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");

CREATE TABLE "ContactGroup" (
 "id" BIGSERIAL PRIMARY KEY,
 "userId" BIGINT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL,
 "description" TEXT,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "ContactGroup_user_name_key" UNIQUE ("userId","name")
);

CREATE TABLE "ContactGroupMember" (
 "groupId" BIGINT NOT NULL REFERENCES "ContactGroup"("id") ON DELETE CASCADE,
 "contactId" BIGINT NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
 PRIMARY KEY ("groupId","contactId")
);
CREATE INDEX "ContactGroupMember_contactId_idx" ON "ContactGroupMember"("contactId");

CREATE TABLE "SmsTemplate" (
 "id" BIGSERIAL PRIMARY KEY,
 "userId" BIGINT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL,
 "body" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "SmsTemplate_user_name_key" UNIQUE ("userId","name")
);
CREATE INDEX "SmsTemplate_userId_idx" ON "SmsTemplate"("userId");
