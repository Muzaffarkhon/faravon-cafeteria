"use client";

import { useState } from "react";
import { Button, Field, Input, Textarea } from "./ui";
import { RichTextarea } from "./rich-textarea";

/** sourceId — id DOM-элемента с русским текстом этого поля, если он не совпадает
 * с `name` (например, форма добавляет префикс к id, как в _components/texts). */
type FieldDef = { name: string; label: string; multiline?: boolean; sourceId?: string };
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
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  function set(locale: "tg" | "uz", field: string, v: string) {
    setValue((prev) => ({ ...prev, [locale]: { ...prev[locale], [field]: v } }));
  }

  // Черновой перевод по кнопке: берёт текущий русский текст прямо из DOM (эти
  // поля — не controlled-состояние этого компонента, а полей формы-родителя),
  // тянет /api/translate и подставляет результат — сотрудник правит вручную.
  async function autoTranslate() {
    const sources = fields.map((f) => {
      const el = document.getElementById(f.sourceId ?? f.name) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      return el?.value ?? "";
    });
    if (sources.every((s) => !s.trim())) {
      setTranslateError("Сначала заполните русский текст.");
      return;
    }
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: sources }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка перевода");
      setValue((prev) => {
        const next: Translations = { tg: { ...prev.tg }, uz: { ...prev.uz } };
        fields.forEach((f, i) => {
          if (data.tg[i]) next.tg = { ...next.tg, [f.name]: data.tg[i] };
          if (data.uz[i]) next.uz = { ...next.uz, [f.name]: data.uz[i] };
        });
        return next;
      });
      setOpen(true);
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : "Ошибка перевода");
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="rounded-xl border border-line-subtle">
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center justify-between text-sm font-semibold text-ink-muted"
        >
          <span>Переводы (таджикский / узбекский)</span>
          <span className="text-xs">{open ? "Свернуть ▲" : "Развернуть ▼"}</span>
        </button>
        <Button type="button" variant="ghost" size="sm" loading={translating} onClick={autoTranslate}>
          Перевести автоматически
        </Button>
      </div>
      {translateError && (
        <p className="border-t border-line-subtle px-3 py-2 text-xs font-medium text-danger" role="alert">
          {translateError}
        </p>
      )}
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
                    <RichTextarea
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
