"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cx, buttonClass, Input, Select } from "./ui";
import {
  NUM_OPS,
  TEXT_OPS,
  type FilterOp,
  type FilterValue,
  type SmartFilterField,
} from "@/lib/smart-filter";

export type SmartFilterPreset = {
  id: string;
  label: string;
  /** `null` — сбрасывает все фильтры («Все записи»). */
  values: Record<string, FilterValue> | null;
};

type Draft = Record<string, FilterValue>;

const SAVED_KEY_PREFIX = "smartFilter:saved:";

type SavedFilter = { id: string; label: string; values: Draft };

function loadSaved(storageKey: string): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY_PREFIX + storageKey);
    return raw ? (JSON.parse(raw) as SavedFilter[]) : [];
  } catch {
    return [];
  }
}

function persistSaved(storageKey: string, list: SavedFilter[]) {
  try {
    window.localStorage.setItem(SAVED_KEY_PREFIX + storageKey, JSON.stringify(list));
  } catch {
    // приватный режим/квота — сохранённые пресеты просто не переживут сессию
  }
}

function defaultOp(type: SmartFilterField["type"]): FilterOp {
  return type === "text" || type === "select" ? "contains" : "eq";
}

/**
 * Кнопка + модальное окно «умного фильтра»: поиск по таблице, пресеты слева,
 * построчные условия на поле (оператор + значение). Пишет состояние в адрес
 * страницы (`sf_<key>`, `sf_<key>_v`, `sf_<key>_v2`) — тот же принцип, что и
 * у остальных фильтров в системе (см. `filter-chips.tsx`), так что работает
 * без JS на сервере и фильтр можно переслать ссылкой.
 */
export function SmartFilterButton({
  basePath,
  params,
  fields,
  presets = [],
  storageKey,
  extraParamKeys = [],
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  fields: SmartFilterField[];
  presets?: SmartFilterPreset[];
  /** Ключ для сохранённых фильтров в localStorage; по умолчанию — `basePath`. */
  storageKey?: string;
  /** Параметры адреса, которые нужно сохранить при переходе (кроме `page`, `sf_*`, `q`). */
  extraParamKeys?: string[];
}) {
  const router = useRouter();
  const key = storageKey ?? basePath;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(params.q ?? "");
  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState<SavedFilter[]>([]);

  const initial = useMemo(() => {
    const out: Draft = {};
    for (const f of fields) {
      const op = params[`sf_${f.key}`] as FilterOp | undefined;
      const v = params[`sf_${f.key}_v`];
      const v2 = params[`sf_${f.key}_v2`];
      if (op) out[f.key] = { op, v, v2 };
    }
    return out;
  }, [fields, params]);

  const openModal = () => {
    setDraft(initial);
    setQ(params.q ?? "");
    setSaved(loadSaved(key));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const activeCount = Object.keys(initial).length;

  const navigate = (values: Draft, qValue: string) => {
    const p = new URLSearchParams();
    for (const k of extraParamKeys) if (params[k]) p.set(k, params[k]!);
    if (qValue.trim()) p.set("q", qValue.trim());
    for (const f of fields) {
      const fv = values[f.key];
      if (!fv || (!fv.v && fv.op !== "range") || (fv.op === "range" && !fv.v && !fv.v2)) continue;
      p.set(`sf_${f.key}`, fv.op);
      if (fv.v) p.set(`sf_${f.key}_v`, fv.v);
      if (fv.v2) p.set(`sf_${f.key}_v2`, fv.v2);
    }
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
    setOpen(false);
  };

  const setField = (fieldKey: string, patch: Partial<FilterValue> | null) => {
    setDraft((d) => {
      const next = { ...d };
      if (patch === null) {
        delete next[fieldKey];
      } else {
        next[fieldKey] = { ...next[fieldKey], ...patch } as FilterValue;
      }
      return next;
    });
  };

  const applyPreset = (p: SmartFilterPreset) => {
    if (p.values === null) {
      setDraft({});
    } else {
      setDraft(p.values);
    }
  };

  const saveCurrent = () => {
    const label = window.prompt("Название фильтра:");
    if (!label) return;
    const next = [...saved, { id: crypto.randomUUID(), label, values: draft }];
    setSaved(next);
    persistSaved(key, next);
  };

  const removeSaved = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    persistSaved(key, next);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cx(buttonClass({ variant: activeCount ? "soft" : "secondary", size: "sm" }))}
      >
        Фильтры{activeCount ? ` (${activeCount})` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[18px] bg-surface shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-line-subtle p-3">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск по всей таблице…"
                className="text-sm"
                autoFocus
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="shrink-0 rounded-full p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
                  aria-label="Очистить поиск"
                >
                  ×
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              {presets.length > 0 && (
                <div className="w-48 shrink-0 overflow-y-auto border-r border-line-subtle p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                    Пресеты
                  </div>
                  <div className="space-y-0.5">
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-muted"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {saved.length > 0 && (
                    <>
                      <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                        Сохранённые
                      </div>
                      <div className="space-y-0.5">
                        {saved.map((s) => (
                          <div key={s.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDraft(s.values)}
                              className="block flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-muted"
                            >
                              {s.label}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSaved(s.id)}
                              className="shrink-0 rounded p-1 text-ink-subtle hover:text-danger"
                              aria-label="Удалить сохранённый фильтр"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {fields.map((f) => {
                  const fv = draft[f.key];
                  const ops = f.type === "text" || f.type === "select" ? TEXT_OPS : NUM_OPS;
                  return (
                    <div key={f.key}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-sm font-semibold text-ink">{f.label}</label>
                        {fv && (
                          <button
                            type="button"
                            onClick={() => setField(f.key, null)}
                            className="text-ink-subtle hover:text-danger"
                            aria-label={`Сбросить условие: ${f.label}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {f.type === "select" ? (
                          <Select
                            value={fv?.v ?? ""}
                            onChange={(e) =>
                              setField(f.key, { op: fv?.op ?? "contains", v: e.target.value })
                            }
                            className="text-sm"
                          >
                            <option value="">Все варианты</option>
                            {f.options?.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <>
                            <Select
                              value={fv?.op ?? defaultOp(f.type)}
                              onChange={(e) =>
                                setField(f.key, { op: e.target.value as FilterOp, v: fv?.v, v2: fv?.v2 })
                              }
                              className="w-auto shrink-0 text-sm"
                            >
                              {ops.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </Select>
                            <Input
                              type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                              value={fv?.v ?? ""}
                              onChange={(e) =>
                                setField(f.key, { op: fv?.op ?? defaultOp(f.type), v: e.target.value })
                              }
                              placeholder={f.type === "number" ? "Число…" : f.type === "date" ? "" : "Поиск…"}
                              className="text-sm"
                            />
                            {fv?.op === "range" && (
                              <Input
                                type={f.type === "date" ? "date" : "number"}
                                value={fv?.v2 ?? ""}
                                onChange={(e) => setField(f.key, { v2: e.target.value })}
                                placeholder="до…"
                                className="text-sm"
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line-subtle p-3">
              <button
                type="button"
                onClick={saveCurrent}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                Сохранить фильтр
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate({}, "")}
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Сбросить
                </button>
                <button
                  type="button"
                  onClick={() => navigate(draft, q)}
                  className={buttonClass({ variant: "primary", size: "sm" })}
                >
                  Найти
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
