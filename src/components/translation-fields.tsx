"use client";

import { useState } from "react";
import { Field, Input, Textarea } from "./ui";

type FieldDef = { name: string; label: string; multiline?: boolean };
type Translations = Partial<Record<"tg" | "uz", Record<string, string>>>;

const LOCALE_LABEL: Record<"tg" | "uz", string> = { tg: "Тоҷикӣ", uz: "Ўзбекча" };

/** Отбрасывает пустые поля, чтобы в JSON не копился мусор из очищенных полей. */
function clean(value: Translations): Translations {
  const out: Translations = {};
  for (const loc of ["tg", "uz"] as const) {
    const entries = Object.entries(value[loc] ?? {}).filter(([, v]) => v.trim());
    if (entries.length) out[loc] = Object.fromEntries(entries);
  }
  return out;
}

/**
 * Переводы полей записи на таджикский/узбекский — сворачиваемый блок в форме.
 * Копит значения в одно скрытое поле `translations` (JSON), которое разбирает
 * серверный экшен и кладёт как есть в колонку `translations` записи. Пустой
 * язык/язык без изменений — на экране сотрудника остаётся русский текст.
 */
export function TranslationFields({
  fields,
  initial,
}: {
  fields: FieldDef[];
  initial?: Translations | null;
}) {
  const [value, setValue] = useState<Translations>({ tg: initial?.tg ?? {}, uz: initial?.uz ?? {} });
  const [open, setOpen] = useState(false);

  function set(locale: "tg" | "uz", field: string, v: string) {
    setValue((prev) => ({ ...prev, [locale]: { ...prev[locale], [field]: v } }));
  }

  return (
    <div className="rounded-xl border border-line-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-ink-muted"
      >
        <span>Переводы (таджикский / узбекский)</span>
        <span className="text-xs">{open ? "Свернуть ▲" : "Развернуть ▼"}</span>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line-subtle p-3 sm:grid-cols-2">
          {(["tg", "uz"] as const).map((loc) => (
            <div key={loc} className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-subtle">
                {LOCALE_LABEL[loc]}
              </p>
              {fields.map((f) => (
                <Field key={f.name} label={f.label} htmlFor={`tr-${loc}-${f.name}`}>
                  {f.multiline ? (
                    <Textarea
                      id={`tr-${loc}-${f.name}`}
                      rows={2}
                      value={value[loc]?.[f.name] ?? ""}
                      onChange={(e) => set(loc, f.name, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={`tr-${loc}-${f.name}`}
                      value={value[loc]?.[f.name] ?? ""}
                      onChange={(e) => set(loc, f.name, e.target.value)}
                    />
                  )}
                </Field>
              ))}
            </div>
          ))}
        </div>
      )}
      <input type="hidden" name="translations" value={JSON.stringify(clean(value))} />
    </div>
  );
}
