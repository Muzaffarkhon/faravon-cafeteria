/**
 * Регистрация / снятие Telegram webhook для роута /api/telegram.
 *
 *   PLATFORM_URL=https://<project>.vercel.app \
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
 *   npx tsx scripts/set-webhook.ts            # установить
 *
 *   ... npx tsx scripts/set-webhook.ts delete # снять (вернуться на polling)
 *   ... npx tsx scripts/set-webhook.ts info   # текущее состояние
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env необязателен */
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const PLATFORM_URL = process.env.PLATFORM_URL;
const action = process.argv[2] || "set";

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не задан.");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;

async function call(method: string, body?: Record<string, unknown>) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return r.json();
}

async function main() {
  if (action === "info") {
    console.log(JSON.stringify(await call("getWebhookInfo"), null, 2));
    return;
  }
  if (action === "delete") {
    console.log(await call("deleteWebhook", { drop_pending_updates: false }));
    return;
  }
  if (!PLATFORM_URL || !SECRET) {
    console.error("Нужны PLATFORM_URL и TELEGRAM_WEBHOOK_SECRET.");
    process.exit(1);
  }
  const url = `${PLATFORM_URL.replace(/\/$/, "")}/api/telegram`;
  const res = await call("setWebhook", {
    url,
    secret_token: SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  console.log("setWebhook →", url);
  console.log(res);
}

main().then(() => process.exit(0));
