/*
  Warnings:

  - The values [SUPERADMIN,CONTENT_MANAGER,APPROVER,HR_BP,ANALYST] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
-- Removes roles [SUPERADMIN, CONTENT_MANAGER, APPROVER, HR_BP, ANALYST].
-- Legacy admin roles are folded into C_AND_B; EMPLOYEE / CONTRACTOR are kept.
-- The mapping is done inside the column-type USING clause over the text
-- representation of the array, so no legacy value is ever written back into a
-- column that is still typed as the old enum.
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('C_AND_B', 'EMPLOYEE', 'CONTRACTOR');

ALTER TABLE "public"."User" ALTER COLUMN "roles" DROP DEFAULT;

-- A USING clause may not contain a subquery, so the legacy -> C_AND_B mapping
-- is done by string-replacing on the array's text form (all enum labels are
-- plain [A-Z_]+ and none is a substring of another, so this is unambiguous).
ALTER TABLE "User" ALTER COLUMN "roles" TYPE "Role_new"[] USING (
  replace(replace(replace(replace(replace(
    "roles"::text,
    'SUPERADMIN', 'C_AND_B'),
    'CONTENT_MANAGER', 'C_AND_B'),
    'APPROVER', 'C_AND_B'),
    'HR_BP', 'C_AND_B'),
    'ANALYST', 'C_AND_B')::"Role_new"[]
);

ALTER TABLE "SlaEscalationRule" ALTER COLUMN "notifyRoles" TYPE "Role_new"[] USING (
  replace(replace(replace(replace(replace(
    "notifyRoles"::text,
    'SUPERADMIN', 'C_AND_B'),
    'CONTENT_MANAGER', 'C_AND_B'),
    'APPROVER', 'C_AND_B'),
    'HR_BP', 'C_AND_B'),
    'ANALYST', 'C_AND_B')::"Role_new"[]
);

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
