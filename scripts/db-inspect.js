const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  console.log('Inspecting DB Role enum and user role values...');
  const enums = await db.$queryRawUnsafe(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'Role' ORDER BY e.enumsortorder;`);
  console.log('Enum labels:');
  console.dir(enums, { depth: null });

  const userRoles = await db.$queryRawUnsafe(`SELECT DISTINCT unnest(roles) AS role FROM "User" ORDER BY role;`);
  console.log('Distinct roles used in users:');
  console.dir(userRoles, { depth: null });

  const slaRoles = await db.$queryRawUnsafe(`SELECT DISTINCT unnest("notifyRoles") AS role FROM "SlaEscalationRule" ORDER BY role;`);
  console.log('Distinct roles used in SlaEscalationRule.notifyRoles:');
  console.dir(slaRoles, { depth: null });

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
