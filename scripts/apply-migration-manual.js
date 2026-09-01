const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function exec(sql) {
  console.log('--- SQL ---');
  console.log(sql);
  try {
    const r = await db.$executeRawUnsafe(sql);
    console.log('OK', r);
  } catch (e) {
    console.error('ERROR', e.message || e);
    throw e;
  }
}

async function main() {
  console.log('Applying manual migration steps...');

    await exec(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role_new') THEN CREATE TYPE "Role_new" AS ENUM ('C_AND_B','EMPLOYEE','CONTRACTOR'); END IF; END$$;`);

    // Convert enum[] columns to text[] to allow safe normalization
    // Create temporary text[] columns and populate normalized values row-by-row
    await exec(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS roles_tmp text[]`);
    await exec(`UPDATE "User" SET roles_tmp = (
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY['EMPLOYEE'])
      FROM (
        SELECT CASE
          WHEN r::text IN ('EMPLOYEE','CONTRACTOR','C_AND_B') THEN r::text
          WHEN r::text IN ('SUPERADMIN','CONTENT_MANAGER','APPROVER','HR_BP','ANALYST') THEN 'C_AND_B'
        END as x
        FROM unnest(roles) as r
      ) t
      WHERE x IS NOT NULL
    )`);

    await exec(`ALTER TABLE "SlaEscalationRule" ADD COLUMN IF NOT EXISTS notifyRoles_tmp text[]`);
    await exec(`UPDATE "SlaEscalationRule" SET notifyRoles_tmp = (
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY['C_AND_B'])
      FROM (
        SELECT CASE
          WHEN r::text IN ('EMPLOYEE','CONTRACTOR','C_AND_B') THEN r::text
          WHEN r::text IN ('SUPERADMIN','CONTENT_MANAGER','APPROVER','HR_BP','ANALYST') THEN 'C_AND_B'
        END as x
        FROM unnest("notifyRoles") as r
      ) t
      WHERE x IS NOT NULL
    )`);

    // Create enum[] typed columns and populate from text tmp columns
    await exec(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS roles_enum "Role_new"[]`);
    await exec(`UPDATE "User" SET roles_enum = (
      SELECT array_agg(elem::"Role_new") FROM unnest(roles_tmp) AS elem
    )`);

    await exec(`ALTER TABLE "SlaEscalationRule" ADD COLUMN IF NOT EXISTS notifyRoles_enum "Role_new"[]`);
    await exec(`UPDATE "SlaEscalationRule" SET notifyRoles_enum = (
      SELECT array_agg(elem::"Role_new") FROM unnest(notifyRoles_tmp) AS elem
    )`);

    // Drop old columns and rename enum columns into place
    await exec(`ALTER TABLE "User" DROP COLUMN roles`);
    await exec(`ALTER TABLE "User" RENAME COLUMN roles_enum TO roles`);
    await exec(`ALTER TABLE "User" DROP COLUMN roles_tmp`);

    await exec(`ALTER TABLE "SlaEscalationRule" DROP COLUMN "notifyRoles"`);
    await exec(`ALTER TABLE "SlaEscalationRule" RENAME COLUMN notifyRoles_enum TO "notifyRoles"`);
    await exec(`ALTER TABLE "SlaEscalationRule" DROP COLUMN notifyRoles_tmp`);

    await exec(`ALTER TYPE "Role" RENAME TO "Role_old"`);
    await exec(`ALTER TYPE "Role_new" RENAME TO "Role"`);
    await exec(`DROP TYPE IF EXISTS "public"."Role_old"`);
    await exec(`ALTER TABLE "User" ALTER COLUMN "roles" SET DEFAULT ARRAY['EMPLOYEE']::"Role"[]`);

  // Create new tables
  await exec(`CREATE TABLE IF NOT EXISTS "PartnerBanner" (
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
  )`);

  await exec(`CREATE TABLE IF NOT EXISTS "AdvertisingRequest" (
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
  )`);

  await exec(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerBanner_partnerId_fkey') THEN ALTER TABLE "PartnerBanner" ADD CONSTRAINT "PartnerBanner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END$$;`);

  console.log('Manual migration applied.');
  await db.$disconnect();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  db.$disconnect().then(() => process.exit(1));
});
