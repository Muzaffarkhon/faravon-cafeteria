"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DATE_BUCKET_LABELS,
  type GroupField,
  type GroupFieldId,
  type CalcField,
  type AggFn,
  type DateBucket,
  type FieldCatalogEntry,
  type AggCatalogEntry,
} from "@/lib/report-builder";
import { Select, Input, buttonClass, cx } from "@/components/ui";

const DATE_BUCKETS = Object.keys(DATE_BUCKET_LABELS) as DateBucket[];

/**
 * «Поля группировки» + «Вычисляемые поля» — соответствуют панели «Настройки»
 * в референсе (ATLAS): слева список выбранных полей группировки (для даты —
 * ещё и режим группировки), справа — вычисляемые поля с агрегатной функцией.
 * Клик «+ Добавить» вместо drag-and-drop (проще, работает на мобильном).
 * Каталоги полей/функций приходят пропсами — свои под каждый источник
 * данных (`Dataset`), а не глобальный список. Каждое изменение сразу
 * переходит по новому адресу (`g`/`c` — JSON в query), остальные параметры
 * страницы (фильтры) сохраняются как есть.
 */
export function FieldsEditor({
  basePath,
  restQuery,
  groupCatalog,
  calcCatalog,
  groupFields,
  calcFields,
}: {
  basePath: string;
  /** Строка query без ключей `g` и `c` — остальные параметры (фильтры) переносятся как есть. */
  restQuery: string;
  groupCatalog: FieldCatalogEntry[];
  calcCatalog: AggCatalogEntry[];
  groupFields: GroupField[];
  calcFields: CalcField[];
}) {
  const router = useRouter();
  const groupLabel = (id: GroupFieldId) => groupCatalog.find((f) => f.id === id)?.label ?? id;
  const aggLabel = (agg: AggFn) => calcCatalog.find((c) => c.agg === agg)?.label ?? agg;
  // Локальный черновик названий вычисляемых полей — навигация (перестроение
  // отчёта) срабатывает по потере фокуса, а не на каждый символ: иначе поле
  // ввода теряло бы фокус посреди набора текста (полный переход страницы).
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

  const availableGroupFields = groupCatalog.filter((f) => !groupFields.some((g) => g.field === f.id));

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">Поля группировки</div>
        <div className="space-y-1.5">
          {groupFields.map((gf, i) => (
            <div key={gf.field} className="flex items-center gap-1.5 rounded-lg border border-line-subtle p-1.5">
              <span className="flex-1 truncate text-sm font-medium text-ink">{groupLabel(gf.field)}</span>
              {gf.field === "date" && (
                <Select
                  value={gf.bucket ?? "day"}
                  onChange={(e) => {
                    const bucket = e.target.value as DateBucket;
                    navigate(
                      groupFields.map((g, j) => (j === i ? { ...g, bucket } : g)),
                      calcFields,
                    );
                  }}
                  className="w-auto text-xs"
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
                className="shrink-0 rounded p-1 text-ink-subtle hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
          {groupFields.length === 0 && (
            <p className="text-xs text-ink-subtle">Нет полей — добавьте хотя бы одно.</p>
          )}
        </div>
        {availableGroupFields.length > 0 && (
          <Select
            value=""
            onChange={(e) => {
              const field = e.target.value as GroupFieldId;
              if (!field) return;
              navigate([...groupFields, { field, bucket: field === "date" ? "day" : undefined }], calcFields);
            }}
            className="mt-2 text-sm"
          >
            <option value="">+ Добавить поле…</option>
            {availableGroupFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-subtle">Вычисляемые поля</div>
        <div className="space-y-1.5">
          {calcFields.map((cf, i) => (
            <div key={i} className="space-y-1 rounded-lg border border-line-subtle p-1.5">
              <div className="flex items-center gap-1.5">
                <Input
                  value={labels[i] ?? cf.label}
                  onChange={(e) => setLabels((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))}
                  onBlur={() => {
                    const label = (labels[i] ?? cf.label).trim() || aggLabel(cf.agg);
                    if (label !== cf.label) {
                      navigate(
                        groupFields,
                        calcFields.map((c, j) => (j === i ? { ...c, label } : c)),
                      );
                    }
                  }}
                  className="text-sm"
                  placeholder="Название колонки"
                />
                <button
                  type="button"
                  aria-label="Убрать вычисляемое поле"
                  onClick={() => navigate(groupFields, calcFields.filter((_, j) => j !== i))}
                  className="shrink-0 rounded p-1 text-ink-subtle hover:text-danger"
                >
                  ×
                </button>
              </div>
              <Select
                value={cf.agg}
                onChange={(e) => {
                  const agg = e.target.value as AggFn;
                  navigate(
                    groupFields,
                    calcFields.map((c, j) => (j === i ? { agg, label: c.label === aggLabel(c.agg) ? aggLabel(agg) : c.label } : c)),
                  );
                }}
                className="text-xs"
              >
                {calcCatalog.map((c) => (
                  <option key={c.agg} value={c.agg}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          {calcFields.length === 0 && (
            <p className="text-xs text-ink-subtle">Нет полей — добавьте хотя бы одно.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate(groupFields, [...calcFields, { agg: calcCatalog[0].agg, label: calcCatalog[0].label }])}
          className={cx(buttonClass({ variant: "secondary", size: "sm" }), "mt-2 w-full")}
        >
          + Добавить вычисляемое поле
        </button>
      </div>
    </div>
  );
}
