/**
 * Регистрирует список команд бота в меню Telegram (синее «/» в чате) через
 * BotFather API. Независимо от webhook/деплоя — вступает в силу сразу для
 * реального бота.
 *
 *   TELEGRAM_BOT_TOKEN=... npx tsx scripts/set-commands.ts          # установить
 *   ... npx tsx scripts/set-commands.ts info                        # посмотреть текущий список
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

// Описания — то, что видит человек в списке под полем ввода при наборе «/».
const COMMANDS = [
  { command: "start", description: "Приветствие и список команд" },
  { command: "login", description: "Новый одноразовый пароль (если уже привязаны)" },
  { command: "code", description: "Войти по коду от администратора: /code ВАШКОД" },
  { command: "id", description: "Узнать свой Telegram ID" },
  { command: "help", description: "Список команд" },
];

async function main() {
  if (action === "info") {
    console.log(JSON.stringify(await call("getMyCommands"), null, 2));
    return;
  }
  const res = await call("setMyCommands", { commands: COMMANDS });
  console.log("setMyCommands →", COMMANDS.map((c) => `/${c.command}`).join(", "));
  console.log(res);
}

main().then(() => process.exit(0));
