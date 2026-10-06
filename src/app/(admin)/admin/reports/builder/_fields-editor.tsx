"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CALC_CATALOG,
  DATE_BUCKET_LABELS,
  FIELD_CATALOG,
  PRIMARY_DATE,
  defaultCalcLabel,
  fieldMeta,
  type AggFn,
  type CalcField,
  type DateBucket,
  type Dataset,
  type GroupField,
} from "@/lib/report-builder-shared";
import { Select, Input, buttonClass, cx } from "@/components/ui";

const DATE_BUCKETS = Object.keys(DATE_BUCKET_LABELS) as DateBucket[];
const SMALL = "!py-1 !text-xs";

/**
 * «Поля группировки» + «Вычисляемые поля». Каждое изменение сразу переходит
 * по новому адресу (`g`/`c` — JSON в query), остальные параметры страницы
 * (условия, режим) сохраняются. Каталоги — свои под каждый датасет.
 */
export function FieldsEditor({
  basePath,
  restQuery,
  dataset,
  groupFields,
  calcFields,
}: {
  basePath: string;
  /** Query без `g` и `c`. */
  restQuery: string;
  dataset: Dataset;
  groupFields: GroupField[];
  calcFields: CalcField[];
}) {
  const router = useRouter();
  const groupable = FIELD_CATALOG[dataset].filter((f) => f.groupable !== false);
  const dateFields = FIELD_CATALOG[dataset].filter((f) => f.kind === "date");
  const calcCatalog = CALC_CATALOG[dataset];
  const groupLabel = (id: string) => fieldMeta(dataset, id)?.label ?? id;
  const [labels, setLabels] = useState(() => calcFields.map((c) => c.label));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabels(calcFields.map((c) => c.label));
  }, [calcFields]);

  function navigate(nextGroup: GroupField[], nextCalc: CalcField[]) {
    const p = new URLSearchParams(restQuery);
    p.set("g", JSON.stringify(nextGroup));
    p.set("c", JSON.stringify(nextCalc));
    router.push(`${basePath}?${p.toString()}`);
  }

  const available = groupable.filter((f) => !groupFields.some((g) => g.field === f.id));
  const isDateAgg = (a: AggFn) => a === "firstDate" || a === "lastDate";

  function changeCalc(i: number, next: { agg?: AggFn; field?: string }) {
    navigate(
      groupFields,
      calcFields.map((c, j) => {
        if (j !== i) return c;
        const agg = next.agg ?? c.agg;
        const field = isDateAgg(agg) ? (next.field ?? c.field ?? PRIMARY_DATE[dataset]) : undefined;
        const wasDefault = c.label === defaultCalcLabel(dataset, c.agg, c.field);
        return { agg, field, label: wasDefault ? defaultCalcLabel(dataset, agg, field) : c.label };
      }),
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Группировка</div>
        <div className="space-y-1">
          {groupFields.map((gf, i) => (
            <div key={gf.field} className="flex items-center gap-1 rounded-lg border border-line-subtle p-1">
              <span className="flex-1 truncate px-1 font-medium text-ink">{groupLabel(gf.field)}</span>
              {fieldMeta(dataset, gf.field)?.kind === "date" && (
                <Select
                  value={gf.bucket ?? "day"}
                  onChange={(e) =>
                    navigate(
                      groupFields.map((g, j) => (j === i ? { ...g, bucket: e.target.value as DateBucket } : g)),
                      calcFields,
                    )
                  }
                  className={cx("w-auto", SMALL)}
                >
                  {DATE_BUCKETS.map((b) => (
                    <option key={b} value={b}>
                      {DATE_BUCKET_LABELS[b]}
                    </option>
                  ))}
                </Select>
              )}
              <button
                type="button"
                aria-label={`Убрать поле «${groupLabel(gf.field)}»`}
                onClick={() => navigate(groupFields.filter((_, j) => j !== i), calcFields)}
                className="shrink-0 rounded px-1 text-ink-subtle hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
          {groupFields.length === 0 && <p className="text-ink-subtle">Нет полей — добавьте хотя бы одно.</p>}
        </div>
        {available.length > 0 && (
          <Select
            value=""
            onChange={(e) => {
              const meta = fieldMeta(dataset, e.target.value);
              if (meta) navigate([...groupFields, { field: meta.id, bucket: meta.kind === "date" ? "day" : undefined }], calcFields);
            }}
            className={cx("mt-1.5", SMALL)}
          >
            <option value="">+ Добавить поле…</option>
            {available.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Показатели</div>
        <div className="space-y-1">
          {calcFields.map((cf, i) => (
            <div key={i} className="space-y-1 rounded-lg border border-line-subtle p-1">
              <div className="flex items-center gap-1">
                <Input
                  value={labels[i] ?? cf.label}
                  onChange={(e) => setLabels((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))}
                  onBlur={() => {
                    const label = (labels[i] ?? cf.label).trim() || defaultCalcLabel(dataset, cf.agg, cf.field);
                    if (label !== cf.label) navigate(groupFields, calcFields.map((c, j) => (j === i ? { ...c, label } : c)));
                  }}
                  className={SMALL}
                  placeholder="Название колонки"
                />
                <button
                  type="button"
                  aria-label="Убрать показатель"
                  onClick={() => navigate(groupFields, calcFields.filter((_, j) => j !== i))}
                  className="shrink-0 rounded px-1 text-ink-subtle hover:text-danger"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-1">
                <Select value={cf.agg} onChange={(e) => changeCalc(i, { agg: e.target.value as AggFn })} className={SMALL}>
                  {calcCatalog.map((c) => (
                    <option key={c.agg} value={c.agg}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                {isDateAgg(cf.agg) && (
                  <Select value={cf.field ?? PRIMARY_DATE[dataset]} onChange={(e) => changeCalc(i, { field: e.target.value })} className={SMALL}>
                    {dateFields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
          ))}
          {calcFields.length === 0 && <p className="text-ink-subtle">Нет показателей — добавьте хотя бы один.</p>}
        </div>
        <button
          type="button"
          onClick={() => navigate(groupFields, [...calcFields, { agg: "count", label: defaultCalcLabel(dataset, "count") }])}
          className={cx(buttonClass({ variant: "secondary", size: "sm" }), "mt-1.5 w-full")}
        >
          + Показатель
        </button>
      </div>
    </div>
  );
}
