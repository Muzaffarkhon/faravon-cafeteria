/**
 * Самопроверка безопасности кешбека (без БД): подпись токена операции, код клиента, расчёт.
 * Запуск:  AUTH_SECRET=test-secret npx tsx --conditions=react-server scripts/cashback-selftest.ts
 * (--conditions=react-server нужен, чтобы пакет server-only не блокировал импорт вне Next.)
 */
import assert from "node:assert/strict";
import { signOpToken, verifyOpToken } from "../src/lib/op-token";
import { currentCashbackCode, matchCashbackCodeWindow, CODE_STEP_S } from "../src/lib/cashback-code";
import { calcCashback, parseSomoni, formatSomoni, MAX_PURCHASE_DIRAM } from "../src/lib/cashback-math";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "selftest-secret";
const claims = { employeeId: "emp_1", partnerId: "par_1", actorId: "usr_1" };
const T0 = 1_800_000_000_000; // фиксированное «сейчас»

console.log("Токен операции");
test("подписанный токен проходит проверку и несёт данные", () => {
  const c = verifyOpToken(signOpToken(claims, T0), T0 + 1000);
  assert.ok(c);
  assert.equal(c.employeeId, "emp_1");
  assert.equal(c.partnerId, "par_1");
  assert.equal(c.actorId, "usr_1");
  assert.match(c.nonce, /^[0-9a-f]{32}$/);
});
test("nonce уникален для каждого токена", () => {
  assert.notEqual(verifyOpToken(signOpToken(claims, T0), T0)?.nonce, verifyOpToken(signOpToken(claims, T0), T0)?.nonce);
});
test("истёкший токен отвергается (5 минут)", () => {
  const t = signOpToken(claims, T0);
  assert.ok(verifyOpToken(t, T0 + 4 * 60_000));
  assert.equal(verifyOpToken(t, T0 + 5 * 60_000 + 1), null);
});
test("подмена содержимого (другой сотрудник/партнёр) отвергается", () => {
  const [body, sig] = signOpToken(claims, T0).split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url").toString());
  forged.employeeId = "emp_VICTIM";
  const forgedBody = Buffer.from(JSON.stringify(forged)).toString("base64url");
  assert.equal(verifyOpToken(`${forgedBody}.${sig}`, T0), null);
  forged.employeeId = "emp_1";
  forged.partnerId = "par_OTHER";
  assert.equal(verifyOpToken(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, T0), null);
});
test("подмена срока действия отвергается", () => {
  const [body, sig] = signOpToken(claims, T0).split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url").toString());
  forged.exp = T0 + 10 * 365 * 24 * 3600_000;
  assert.equal(verifyOpToken(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, T0), null);
});
test("мусор, пустая подпись, лишние части, чужой ключ", () => {
  for (const bad of ["", "abc", "a.b", "a.b.c", ".", "..", "x".repeat(2000), "e30.e30"]) {
    assert.equal(verifyOpToken(bad, T0), null, `должно отвергнуться: ${bad.slice(0, 20)}`);
  }
  const t = signOpToken(claims, T0);
  const prev = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "another-secret";
  assert.equal(verifyOpToken(t, T0), null);
  process.env.AUTH_SECRET = prev;
});

console.log("Код клиента");
test("текущий код принимается, формат 6 цифр", () => {
  const { code, secondsLeft } = currentCashbackCode("emp_1", T0);
  assert.match(code, /^\d{6}$/);
  assert.ok(secondsLeft >= 1 && secondsLeft <= CODE_STEP_S);
  assert.notEqual(matchCashbackCodeWindow("emp_1", code, T0), null);
});
test("код с пробелом («123 456») принимается", () => {
  const { code } = currentCashbackCode("emp_1", T0);
  assert.notEqual(matchCashbackCodeWindow("emp_1", `${code.slice(0, 3)} ${code.slice(3)}`, T0), null);
});
test("код предыдущего окна ещё принимается, позапрошлого — нет", () => {
  const old = currentCashbackCode("emp_1", T0).code;
  assert.notEqual(matchCashbackCodeWindow("emp_1", old, T0 + CODE_STEP_S * 1000), null);
  assert.equal(matchCashbackCodeWindow("emp_1", old, T0 + 2 * CODE_STEP_S * 1000), null);
});
test("код привязан к сотруднику: чужой код не подходит", () => {
  const { code } = currentCashbackCode("emp_1", T0);
  assert.equal(matchCashbackCodeWindow("emp_2", code, T0), null);
});
test("возвращаемое окно монотонно растёт (основа одноразовости)", () => {
  const a = matchCashbackCodeWindow("emp_1", currentCashbackCode("emp_1", T0).code, T0)!;
  const b = matchCashbackCodeWindow("emp_1", currentCashbackCode("emp_1", T0 + CODE_STEP_S * 1000).code, T0 + CODE_STEP_S * 1000)!;
  assert.equal(b, a + 1);
});
test("неверные форматы отвергаются", () => {
  for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5", "١٢٣٤٥٦", "12345\n", null as unknown as string]) {
    assert.equal(matchCashbackCodeWindow("emp_1", bad, T0), null);
  }
});
test("коды не повторяются подряд и распределены (нет вырожденности)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(currentCashbackCode("emp_1", T0 + i * CODE_STEP_S * 1000).code);
  assert.ok(seen.size > 190, `уникальных кодов ${seen.size}/200`);
});

console.log("Расчёт");
test("пример: чек 100, баланс 30, 10% → спишется 30, платит 70, начислится 7", () => {
  assert.deepEqual(calcCashback({ purchase: 10000, balance: 3000, percent: 10, canAccrue: true, useBalance: true }), {
    redeem: 3000, paid: 7000, accrue: 700, newBalance: 700,
  });
});
test("баланс больше чека: списывается только чек, платить 0, начислять нечего", () => {
  assert.deepEqual(calcCashback({ purchase: 2000, balance: 3000, percent: 10, canAccrue: true, useBalance: true }), {
    redeem: 2000, paid: 0, accrue: 0, newBalance: 1000,
  });
});
test("купон не действует: начисления нет, списание возможно", () => {
  const c = calcCashback({ purchase: 10000, balance: 3000, percent: 10, canAccrue: false, useBalance: true });
  assert.equal(c.accrue, 0);
  assert.equal(c.redeem, 3000);
});
test("свойства: инварианты на 20 000 случайных входов", () => {
  let seed = 12345;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  for (let i = 0; i < 20_000; i++) {
    const purchase = 1 + rnd(MAX_PURCHASE_DIRAM);
    const balance = rnd(50_000_000);
    const percent = rnd(101);
    const r = calcCashback({ purchase, balance, percent, canAccrue: rnd(2) === 1, useBalance: rnd(2) === 1 });
    assert.ok(Number.isInteger(r.redeem) && Number.isInteger(r.paid) && Number.isInteger(r.accrue));
    assert.ok(r.redeem >= 0 && r.redeem <= balance && r.redeem <= purchase, "списание в пределах баланса и чека");
    assert.equal(r.paid, purchase - r.redeem);
    assert.ok(r.paid >= 0);
    assert.ok(r.accrue >= 0 && r.accrue <= Math.floor((r.paid * percent) / 100), "начисление от оплаченного");
    assert.equal(r.newBalance, balance - r.redeem + r.accrue);
    assert.ok(r.newBalance >= 0, "баланс не уходит в минус");
  }
});
test("разбор суммы: границы и мусор", () => {
  assert.equal(parseSomoni("12,5"), 1250);
  assert.equal(parseSomoni(" 100 "), 10000);
  assert.equal(parseSomoni("0,01"), 1);
  for (const bad of ["", "0", "0,00", "-5", "1e3", "12.505", "abc", "1 2 3.4.5", "NaN", "Infinity", "1_000"]) {
    assert.equal(parseSomoni(bad), null, `должно отвергнуться: ${bad}`);
  }
  assert.equal(parseSomoni(formatSomoni(MAX_PURCHASE_DIRAM).replace(/\s/g, "").replace(/ /g, "")), MAX_PURCHASE_DIRAM);
  assert.equal(parseSomoni(String(MAX_PURCHASE_DIRAM / 100 + 0.01)), null, "выше потолка отвергается");
});

console.log(`\nВсе проверки пройдены: ${passed}`);
