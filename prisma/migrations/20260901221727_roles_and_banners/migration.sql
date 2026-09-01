/*
  Warnings:

  - The values [SUPERADMIN,CONTENT_MANAGER,APPROVER,HR_BP,ANALYST] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('C_AND_B', 'EMPLOYEE', 'CONTRACTOR');
-- Normalize existing user roles: map legacy/admin roles to C_AND_B, keep EMPLOYEE/CONTRACTOR.
UPDATE "User" SET roles = (
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY['EMPLOYEE'])
  FROM (
    SELECT CASE
      WHEN r IN ('EMPLOYEE','CONTRACTOR','C_AND_B') THEN r
      WHEN r IN ('SUPERADMIN','CONTENT_MANAGER','APPROVER','HR_BP','ANALYST') THEN 'C_AND_B'
    END as x
    FROM unnest(roles) as r
  ) t
  WHERE x IS NOT NULL
);

-- Normalize SLA escalation notifyRoles similarly
UPDATE "SlaEscalationRule" SET "notifyRoles" = (
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY['C_AND_B'])
  FROM (
    SELECT CASE
      WHEN r IN ('EMPLOYEE','CONTRACTOR','C_AND_B') THEN r
      WHEN r IN ('SUPERADMIN','CONTENT_MANAGER','APPROVER','HR_BP','ANALYST') THEN 'C_AND_B'
    END as x
    FROM unnest("notifyRoles") as r
  ) t
  WHERE x IS NOT NULL
);

ALTER TABLE "public"."User" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "roles" TYPE "Role_new"[] USING ("roles"::text::"Role_new"[]);
ALTER TABLE "SlaEscalationRule" ALTER COLUMN "notifyRoles" TYPE "Role_new"[] USING ("notifyRoles"::text::"Role_new"[]);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "roles" SET DEFAULT ARRAY['EMPLOYEE']::"Role"[];
COMMIT;

-- CreateTable
CREATE TABLE "PartnerBanner" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "href" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisingRequest" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productDescription" TEXT NOT NULL,
    "budget" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvertisingRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PartnerBanner" ADD CONSTRAINT "PartnerBanner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
