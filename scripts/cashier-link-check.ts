/** Проверка привязки телефона кассы на тестовой кассе: создание, отказы, одноразовость. Печатает тестовый токен. */
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { createCashierLink, peekCashierLink, consumeCashierLink } from "../src/lib/cashier-link";

async function main() {
  const cashier = await db.user.findUnique({ where: { login: "test_cb_cashier" }, select: { id: true, roles: true, partnerId: true, isActive: true } });
  assert.ok(cashier, "нет test_cb_cashier — запустите scripts/seed-cashback-test.ts");
  console.log("кассир:", JSON.stringify({ roles: cashier.roles, partner: !!cashier.partnerId, active: cashier.isActive }));

  // 1. Админская учётка — ссылка недоступна.
  const admin = await db.user.findFirst({ where: { roles: { has: "C_AND_B" }, isActive: true }, select: { id: true } });
  assert.ok(admin);
  const denied = await createCashierLink(admin.id, admin.id);
  assert.equal(denied.ok, false);
  console.log("✓ админской учётке ссылку не выдали:", !denied.ok && denied.error);

  // 2. Тестовая касса — ссылка создаётся; повторное создание гасит прежнюю.
  const first = await createCashierLink(cashier.id, admin.id);
  assert.ok(first.ok);
  const second = await createCashierLink(cashier.id, admin.id);
  assert.ok(second.ok);
  assert.equal(await peekCashierLink(first.token), null);
  console.log("✓ новая ссылка погасила прежнюю неиспользованную");

  // 3. Просмотр не тратит ссылку.
  assert.ok(await peekCashierLink(second.token));
  assert.ok(await peekCashierLink(second.token));
  console.log("✓ открытие страницы (peek) ссылку не тратит");

  // 4. Просроченная ссылка не работает.
  const expired = await createCashierLink(cashier.id, admin.id);
  assert.ok(expired.ok);
  await db.cashierLink.updateMany({ where: { userId: cashier.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await peekCashierLink(expired.token), null);
  assert.equal((await consumeCashierLink(expired.token, { ip: "test", userAgent: "check" })).ok, false);
  console.log("✓ просроченная ссылка отвергается");

  // 5. Одноразовость и гонка: две одновременные попытки — выигрывает одна.
  const live = await createCashierLink(cashier.id, admin.id);
  assert.ok(live.ok);
  const [a, b] = await Promise.all([
    consumeCashierLink(live.token, { ip: "test", userAgent: "check" }),
    consumeCashierLink(live.token, { ip: "test", userAgent: "check" }),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.equal((await consumeCashierLink(live.token, { ip: "test", userAgent: "check" })).ok, false);
  console.log("✓ ссылка одноразовая, гонка двух нажатий пропускает одно");

  // 6. Мусорные токены.
  for (const bad of ["", "x", "a".repeat(500), "../../etc"]) assert.equal(await peekCashierLink(bad), null);
  console.log("✓ мусорные токены отвергаются");

  // Свежая ссылка для проверки в браузере.
  const forBrowser = await createCashierLink(cashier.id, admin.id);
  assert.ok(forBrowser.ok);
  console.log("TOKEN=" + forBrowser.token);
}
main().then(() => db.$disconnect(), (e) => { console.error(e); process.exit(1); });
