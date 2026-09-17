"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ItemStatus, SupportThreadSource, SupportThreadStatus } from "@prisma/client";
import { Field, Input, Select, buttonClass } from "@/components/ui";
import { FEEDBACK_TOPICS } from "@/lib/feedback";
import type { Dataset } from "@/lib/report-builder-shared";

const ITEM_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "PENDING", label: "На согласовании" },
  { value: "APPROVED", label: "Одобрено" },
  { value: "REJECTED", label: "Отклонено" },
  { value: "COUPON_CREATED", label: "Купон сформирован" },
  { value: "COUPON_ISSUED", label: "Купон выдан" },
];

const THREAD_STATUSES: { value: SupportThreadStatus; label: string }[] = [
  { value: "OPEN", label: "Открыто" },
  { value: "CLOSED", label: "Закрыто" },
];

const SOURCES: { value: SupportThreadSource; label: string }[] = [
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WEB", label: "Сайт" },
];

export type FilterState = {
  periodId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  cardQuery: string;
  departmentQuery: string;
  topic: string;
  source: string;
  limit: string;
};

const EMPTY: FilterState = {
  periodId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  cardQuery: "",
  departmentQuery: "",
  topic: "",
  source: "",
  limit: "",
};

/**
 * Фильтр конструктора — отдельное модальное окно (референс: «Фильтр» в
 * ATLAS), заданный заранее, а не применяемый на лету: «Очистить» чистит
 * только черновик в окне, «Отмена» закрывает без изменений, «Применить»
 * переходит по новому адресу. Поля группировки/агрегации (`g`/`c` в query)
 * переносятся как есть. Набор полей зависит от источника данных (`dataset`).
 */
export function FilterModal({
  basePath,
  restQuery,
  dataset,
  periods,
  initial,
}: {
  basePath: string;
  /** Строка query без фильтровых ключей — `g`/`c`/`dataset` переносятся как есть. */
  restQuery: string;
  dataset: Dataset;
  periods: { id: string; name: string }[];
  initial: FilterState;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(initial);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(initial);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeCount = Object.values(initial).filter(Boolean).length;

  function apply() {
    const p = new URLSearchParams(restQuery);
    (Object.keys(draft) as (keyof FilterState)[]).forEach((k) => {
      if (draft[k]) p.set(k, draft[k]);
      else p.delete(k);
    });
    router.push(`${basePath}?${p.toString()}`);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass({ variant: activeCount ? "soft" : "secondary", size: "sm" })}
      >
        Фильтры{activeCount ? ` (${activeCount})` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[18px] bg-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-[15px] font-bold text-ink">Фильтр</div>
            <div className="space-y-3">
              {dataset === "benefits" ? (
                <>
                  <Field label="Период">
                    <Select value={draft.periodId} onChange={(e) => setDraft((d) => ({ ...d, periodId: e.target.value }))}>
                      <option value="">Все периоды</option>
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Статус позиции">
                    <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                      <option value="">Любой (кроме отменённых)</option>
                      {ITEM_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Льгота содержит">
                    <Input
                      value={draft.cardQuery}
                      onChange={(e) => setDraft((d) => ({ ...d, cardQuery: e.target.value }))}
                      placeholder="например, спорт"
                    />
                  </Field>
                  <Field label="Подразделение содержит">
                    <Input
                      value={draft.departmentQuery}
                      onChange={(e) => setDraft((d) => ({ ...d, departmentQuery: e.target.value }))}
                      placeholder="например, IT"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Тема">
                    <Select value={draft.topic} onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))}>
                      <option value="">Любая</option>
                      {FEEDBACK_TOPICS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Источник">
                    <Select value={draft.source} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}>
                      <option value="">Любой</option>
                      {SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Статус">
                    <Select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                      <option value="">Любой</option>
                      {THREAD_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label={dataset === "benefits" ? "Дата подачи — от" : "Дата обращения — от"}>
                  <Input
                    type="date"
                    value={draft.dateFrom}
                    onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                  />
                </Field>
                <Field label={dataset === "benefits" ? "Дата подачи — до" : "Дата обращения — до"}>
                  <Input
                    type="date"
                    value={draft.dateTo}
                    onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Количество записей в выборке" hint="пусто — все">
                <Input
                  type="number"
                  min={1}
                  value={draft.limit}
                  onChange={(e) => setDraft((d) => ({ ...d, limit: e.target.value }))}
                  placeholder="например, 10"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setDraft(EMPTY)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                Очистить
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                  Отмена
                </button>
                <button type="button" onClick={apply} className={buttonClass({ variant: "primary", size: "sm" })}>
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
