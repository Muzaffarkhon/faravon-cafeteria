/** Показывает число строк по каждой таблице схемы — для сверки до/после переноса. */
import { PrismaClient, Prisma } from "@prisma/client";

const url = process.env.COUNT_URL ?? process.env.DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url } } });

function toCamel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

async function main() {
  const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
  let total = 0;
  for (const model of models) {
    const key = toCamel(model);
    const n = await (db as Record<string, any>)[key].count();
    total += n;
    console.log(`${model}\t${n}`);
  }
  console.log(`\nВсего строк: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
