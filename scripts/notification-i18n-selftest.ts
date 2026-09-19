/** Проверка переводов уведомлений: те же подстановки, что в русском, парные [[ ]], рендер без остатков. */
import assert from "node:assert/strict";
import {
  DEFAULT_TEMPLATES,
  NOTIFICATION_EVENTS,
  TEMPLATE_SAMPLE_VARS,
  formatNotificationText,
  templateMapFromRows,
} from "../src/lib/notification-format";
import { DEFAULT_TEMPLATES_I18N } from "../src/lib/notification-i18n";

const vars = (s: string) => [...new Set((s.match(/\{([^}]+)\}/g) ?? []))].sort();
let n = 0;

for (const l of ["tg", "uz"] as const) {
  for (const e of NOTIFICATION_EVENTS) {
    const tr = DEFAULT_TEMPLATES_I18N[l][e];
    assert.ok(tr, `нет перевода ${l}/${e}`);
    assert.deepEqual(vars(tr), vars(DEFAULT_TEMPLATES[e].body), `подстановки ${l}/${e} не совпадают с русским`);
    assert.equal((tr.match(/\[\[/g) ?? []).length, (tr.match(/\]\]/g) ?? []).length, `скобки ${l}/${e}`);
    assert.equal((tr.match(/<b>/g) ?? []).length, (tr.match(/<\/b>/g) ?? []).length, `<b> ${l}/${e}`);
    const out = formatNotificationText(e, { ...TEMPLATE_SAMPLE_VARS[e], siteUrl: undefined, count: 3, group: "групповая" }, undefined, l);
    assert.ok(!/[{}]|\[\[|\]\]/.test(out), `остались служебные символы ${l}/${e}: ${out}`);
    n++;
  }
}
// правка админа для tg побеждает зашитый перевод; русская правка на tg не подставляется
const m = templateMapFromRows([{ event: "BROADCAST", body: "RU {text}", translations: { tg: "TG {text}" } }]);
assert.equal(formatNotificationText("BROADCAST", { text: "x" }, m, "tg"), "TG x");
assert.equal(formatNotificationText("BROADCAST", { text: "x" }, m, "uz"), DEFAULT_TEMPLATES_I18N.uz.BROADCAST.replace("{text}", "x"));
assert.equal(formatNotificationText("BROADCAST", { text: "x" }, m, "ru"), "RU x");
console.log(`Проверок пройдено: ${n} переводов + 3`);
