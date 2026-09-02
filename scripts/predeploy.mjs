/**
 * Запускается в начале `build`. На production-деплое Vercel применяет
 * ожидающие миграции Prisma к боевой БД (иначе их приходится накатывать
 * вручную и легко забыть — см. историю с ApplicationItem.escalationLevel).
 *
 * Локально и на preview-деплоях ничего не делает.
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

console.log("[predeploy] prisma migrate deploy…");
execSync("npx prisma migrate deploy", { stdio: "inherit" });
console.log("[predeploy] миграции применены.");
