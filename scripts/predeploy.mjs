/**
 * Запускается в начале `build`. На production-деплое Vercel применяет
 * ожидающие миграции Prisma к боевой БД (иначе их приходится накатывать
 * вручную и легко забыть — см. историю с ApplicationItem.escalationLevel).
 *
 * Локально и на preview-деплоях ничего не делает.
 *
 * Neon (пул) плохо держит advisory-lock: `migrate deploy` иногда падает с
 * P1002 «timed out trying to acquire a postgres advisory lock», роняя весь
 * деплой. Поэтому: (1) если ожидающих миграций нет — не трогаем БД вообще;
 * (2) при ошибке повторяем несколько раз с паузой (Neon мог быть «холодным»).
 */
import { execSync } from "node:child_process";

const onVercelProd = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (!onVercelProd) {
  console.log("[predeploy] не production-деплой Vercel — миграции не трогаем.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[predeploy] DATABASE_URL не задан — не могу применить миграции.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Есть ли что применять? `migrate status` не берёт advisory-lock.
let hasPending = true;
try {
  const out = execSync("npx prisma migrate status", { encoding: "utf8" });
  hasPending = !/Database schema is up to date/i.test(out);
  console.log(`[predeploy] migrate status: ${hasPending ? "есть ожидающие миграции" : "схема актуальна"}`);
} catch (e) {
  // status не смог достучаться — пусть решает migrate deploy с ретраями.
  console.warn("[predeploy] migrate status не отработал, продолжаю с migrate deploy:", e.message);
}

if (!hasPending) {
  console.log("[predeploy] ожидающих миграций нет — deploy пропускаю.");
  process.exit(0);
}

// 2. migrate deploy с ретраями (Neon advisory-lock / холодный старт).
const MAX_TRIES = 4;
for (let i = 1; i <= MAX_TRIES; i++) {
  try {
    console.log(`[predeploy] prisma migrate deploy (попытка ${i}/${MAX_TRIES})…`);
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    console.log("[predeploy] миграции применены.");
    process.exit(0);
  } catch (e) {
    if (i === MAX_TRIES) {
      console.error("[predeploy] migrate deploy не удался после всех попыток.");
      throw e;
    }
    const waitMs = 8000 * i;
    console.warn(`[predeploy] ошибка migrate deploy, повтор через ${waitMs / 1000} c…`);
    await sleep(waitMs);
  }
}
