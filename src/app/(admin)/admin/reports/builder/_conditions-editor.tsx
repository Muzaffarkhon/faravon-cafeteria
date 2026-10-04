"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  OPS_BY_KIND,
  OP_LABELS,
  FIELD_CATALOG,
  describeCondition,
  fieldMeta,
  opNeedsValue,
  type Condition,
  type Dataset,
  type FieldMeta,
  type Op,
  type Option,
} from "@/lib/report-builder-shared";
import { Input, Select, buttonClass, cx } from "@/components/ui";

const SMALL = "!py-1 !text-xs";

function optionsFor(meta: FieldMeta, dynamic: Record<string, Option[]>): Option[] {
  return meta.options ?? dynamic[meta.id] ?? [];
}

function newCondition(meta: FieldMeta): Condition {
  return { field: meta.id, op: OPS_BY_KIND[meta.kind][0] };
}

const isComplete = (c: Condition) => !opNeedsValue(c.op) || (c.op === "between" ? !!(c.value || c.value2) : !!c.value);

/**
 * Условия отчёта: список «поле — оператор — значение». Чипы активных условий
 * всегда на виду (× убирает условие сразу), редактор раскрывается кнопкой.
 * Применение — переход по адресу с параметром `f` (JSON), как и остальные
 * настройки конструктора.
 */
export function ConditionsEditor({
  basePath,
  restQuery,
  dataset,
  conditions,
  options,
  limit,
}: {
  basePath: string;
  /** Query без `f` и `limit`. */
  restQuery: string;
  dataset: Dataset;
  conditions: Condition[];
  options: Record<string, Option[]>;
  limit?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Condition[]>(conditions);
  const [draftLimit, setDraftLimit] = useState(limit ? String(limit) : "");
  const fields = FIELD_CATALOG[dataset];

  const optionLabel = useMemo(
    () => (field: string, value: string) => {
      const meta = fieldMeta(dataset, field);
      return (meta ? optionsFor(meta, options).find((o) => o.value === value)?.label : undefined) ?? value;
    },
    [dataset, options],
  );

  function go(next: Condition[], nextLimit: string) {
    const p = new URLSearchParams(restQuery);
    p.set("f", JSON.stringify(next));
    const n = Number.parseInt(nextLimit, 10);
    if (n > 0) p.set("limit", String(n));
    else p.delete("limit");
    router.push(`${basePath}?${p.toString()}`);
  }

  const patch = (i: number, c: Partial<Condition>) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...c } : x)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (!open) {
              setDraft(conditions);
              setDraftLimit(limit ? String(limit) : "");
            }
            setOpen(!open);
          }}
          className={buttonClass({ variant: conditions.length ? "soft" : "secondary", size: "sm" })}
          aria-expanded={open}
        >
          Условия{conditions.length ? ` (${conditions.length})` : ""} {open ? "▴" : "▾"}
        </button>
        {conditions.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface-muted py-0.5 pl-2.5 pr-1 text-xs text-ink"
          >
            {describeCondition(dataset, c, optionLabel)}
            <button
              type="button"
              aria-label="Убрать условие"
              onClick={() => go(conditions.filter((_, j) => j !== i), limit ? String(limit) : "")}
              className="rounded-full px-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
        {limit ? <span className="text-xs text-ink-subtle">· первые {limit} строк</span> : null}
      </div>

      {open && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
          {draft.length === 0 && <p className="text-xs text-ink-subtle">Условий нет — в отчёт попадают все записи. Все условия объединяются через «И».</p>}
          {draft.map((c, i) => {
            const meta = fieldMeta(dataset, c.field) ?? fields[0];
            const ops = OPS_BY_KIND[meta.kind];
            const opts = optionsFor(meta, options);
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <Select
                  value={c.field}
                  className={cx("w-44", SMALL)}
                  onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? newCondition(fieldMeta(dataset, e.target.value) ?? fields[0]) : x)))}
                >
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={c.op}
                  className={cx("w-32", SMALL)}
                  onChange={(e) => patch(i, { op: e.target.value as Op, value: undefined, value2: undefined })}
                >
                  {ops.map((o) => (
                    <option key={o} value={o}>
                      {OP_LABELS[o]}
                    </option>
                  ))}
                </Select>

                {opNeedsValue(c.op) &&
                  (meta.kind === "date" ? (
                    <>
                        <Input type="date" value={c.value ?? ""} className={cx("w-36", SMALL)} onChange={(e) => patch(i, { value: e.target.value })} />
                      {c.op === "between" && (
                        <>
                          <span className="text-xs text-ink-subtle">—</span>
                          <Input type="date" value={c.value2 ?? ""} className={cx("w-36", SMALL)} onChange={(e) => patch(i, { value2: e.target.value })} />
                        </>
                      )}
                    </>
                  ) : meta.kind === "enum" && c.op === "in" ? (
                    <div className="flex flex-wrap gap-1">
                      {opts.map((o) => {
                        const set = new Set((c.value ?? "").split("|").filter(Boolean));
                        const on = set.has(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              if (on) set.delete(o.value);
                              else set.add(o.value);
                              patch(i, { value: [...set].join("|") });
                            }}
                            className={cx(
                              "rounded-full border px-2 py-0.5 text-xs",
                              on ? "border-primary bg-primary-soft font-semibold text-primary-strong" : "border-line text-ink-muted hover:bg-surface-muted",
                            )}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : meta.kind === "enum" ? (
                    <Select value={c.value ?? ""} className={cx("w-56", SMALL)} onChange={(e) => patch(i, { value: e.target.value })}>
                      <option value="">Выберите…</option>
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <>
                      <Input
                        value={c.value ?? ""}
                        list={opts.length ? `opts-${meta.id}` : undefined}
                        className={cx("w-56", SMALL)}
                        placeholder="значение"
                        onChange={(e) => patch(i, { value: e.target.value })}
                      />
                      {opts.length > 0 && (
                        <datalist id={`opts-${meta.id}`}>
                          {opts.map((o) => (
                            <option key={o.value} value={o.value} />
                          ))}
                        </datalist>
                      )}
                    </>
                  ))}
                <button
                  type="button"
                  aria-label="Удалить условие"
                  onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                  className="rounded p-1 text-ink-subtle hover:text-danger"
                >
                  ×
                </button>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => setDraft((d) => [...d, newCondition(fields[0])])} className={buttonClass({ variant: "secondary", size: "sm" })}>
              + Условие
            </button>
            <label className="ml-2 flex items-center gap-1.5 text-xs text-ink-muted">
              Первые
              <Input type="number" min={1} value={draftLimit} onChange={(e) => setDraftLimit(e.target.value)} className={cx("w-20", SMALL)} placeholder="все" />
              строк
            </label>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft([]);
                  setDraftLimit("");
                }}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                Очистить
              </button>
              <button
                type="button"
                onClick={() => {
                  go(draft.filter(isComplete), draftLimit);
                  setOpen(false);
                }}
                className={buttonClass({ size: "sm" })}
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
