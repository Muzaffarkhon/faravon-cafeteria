/**
 * Разовый перенос данных Neon -> Supabase.
 *
 * Читает все таблицы из NEON_DIRECT_URL и полностью перезаписывает те же
 * таблицы в SUPABASE_DIRECT_URL (сначала чистит, потом копирует) — безопасно
 * запускать повторно (идемпотентно), в том числе прямо перед финальным
 * переключением как последнюю досинхронизацию.
 *
 * Порядок таблиц не важен: на время записи в Supabase отключены проверки FK
 * (session_replication_role = replica), поэтому строки с "висящими" на
 * первый взгляд внешними ключами всё равно вставляются корректно.
 *
 * Использование:
 *   NEON_DIRECT_URL=postgres://... SUPABASE_DIRECT_URL=postgres://... npx tsx scripts/migrate-to-supabase.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const NEON_URL = process.env.NEON_DIRECT_URL;
const SUPABASE_URL = process.env.SUPABASE_DIRECT_URL;

if (!NEON_URL || !SUPABASE_URL) {
  console.error("Нужны NEON_DIRECT_URL и SUPABASE_DIRECT_URL (прямые, не -pooler, подключения).");
  process.exit(1);
}

const source = new PrismaClient({ datasources: { db: { url: NEON_URL } } });
const target = new PrismaClient({ datasources: { db: { url: SUPABASE_URL } } });

// Таблицы с автоинкрементным `seq` — после массовой вставки нужно подвинуть
// последовательность вперёд, иначе следующий INSERT упадёт на дубликате.
const SEQ_TABLES = ["Employee", "User", "Partner", "ApplicationItem", "Coupon", "AdvertisingRequest"];

function toCamel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

async function main() {
  const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
  console.log(`Моделей в схеме: ${models.length}`);

  await target.$executeRawUnsafe(`SET session_replication_role = replica;`);

  // Чистим приёмник перед копированием — скрипт идемпотентен, можно
  // запускать повторно на любом этапе (репетиция и финальный cutover).
  for (const model of models) {
    const key = toCamel(model);
    await (target as Record<string, any>)[key].deleteMany();
  }

  let totalRows = 0;
  for (const model of models) {
    const key = toCamel(model);
    const rows = await (source as Record<string, any>)[key].findMany();
    if (rows.length === 0) {
      console.log(`  ${model}: 0 строк`);
      continue;
    }
    await (target as Record<string, any>)[key].createMany({ data: rows });
    totalRows += rows.length;
    console.log(`  ${model}: ${rows.length}`);
  }

  await target.$executeRawUnsafe(`SET session_replication_role = DEFAULT;`);

  for (const table of SEQ_TABLES) {
    await target.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${table}"', 'seq'),
        COALESCE((SELECT MAX(seq) FROM "${table}"), 1),
        (SELECT COUNT(*) FROM "${table}") > 0
      );
    `);
  }

  console.log(`\nГотово. Всего перенесено строк: ${totalRows}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
