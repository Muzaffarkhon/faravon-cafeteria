"use client";

import { useState, useTransition } from "react";
import { Badge, cx } from "@/components/ui";
import { BLOCK_LABELS, CARD_STATUS_LABELS } from "@/lib/labels";
import { restoreCardVersionAction } from "./actions";

export type CardVersionRow = {
  id: string;
  version: number;
  reason: string | null;
  createdAt: string;
  editor: string | null;
  block: string;
  title: string;
  description: string | null;
  condition: string | null;
  imageUrl: string | null;
  category: string | null;
  isActive: boolean;
  status: string;
  sortOrder: number;
  minParticipants: number;
  mode: string;
  cashbackPercent: number;
  groupWaves: boolean;
  partnerId: string | null;
};

const REASON_LABEL: Record<string, string> = {
  created: "создана",
  updated: "изменена",
};

function reasonText(reason: string | null): string {
  if (!reason) return "изменена";
  if (reason.startsWith("restored:v")) return `восстановлена из v${reason.slice(10)}`;
  return REASON_LABEL[reason] ?? reason;
}

type FieldDef = {
  key: string;
  label: string;
  fmt: (v: CardVersionRow, names: Record<string, string>) => string;
  image?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: "title", label: "Название", fmt: (v) => v.title },
  { key: "block", label: "Блок", fmt: (v) => BLOCK_LABELS[v.block as keyof typeof BLOCK_LABELS] ?? v.block },
  {
    key: "status",
    label: "Публикация",
    fmt: (v) => CARD_STATUS_LABELS[v.status as keyof typeof CARD_STATUS_LABELS] ?? v.status,
  },
  { key: "isActive", label: "Активна", fmt: (v) => (v.isActive ? "да" : "нет (скоро)") },
  { key: "description", label: "Описание", fmt: (v) => v.description ?? "—" },
  { key: "condition", label: "Условие", fmt: (v) => v.condition ?? "—" },
  { key: "category", label: "Категория", fmt: (v) => v.category ?? "—" },
  { key: "partnerId", label: "Партнёр", fmt: (v, n) => (v.partnerId ? n[v.partnerId] ?? v.partnerId : "—") },
  { key: "sortOrder", label: "Порядок", fmt: (v) => String(v.sortOrder) },
  {
    key: "minParticipants",
    label: "Мин. участников",
    fmt: (v) => (v.minParticipants > 1 ? String(v.minParticipants) : "без порога"),
  },
  {
    key: "mode",
    label: "Режим",
    fmt: (v) =>
      v.mode === "CASHBACK"
        ? `Кешбек ${v.cashbackPercent}%`
        : v.mode === "PERIOD"
          ? "Многоразовый (весь период)"
          : "Одноразовый",
  },
  { key: "groupWaves", label: "Набор группами", fmt: (v) => (v.groupWaves ? "да" : "нет") },
  { key: "imageUrl", label: "Изображение", fmt: (v) => v.imageUrl ?? "", image: true },
];

/** Список меток полей, отличающихся между версиями. */
function changedFields(
  cur: CardVersionRow,
  prev: CardVersionRow | undefined,
  names: Record<string, string>,
): Set<string> {
  const set = new Set<string>();
  if (!prev) return set;
  for (const f of FIELDS) {
    if (f.fmt(cur, names) !== f.fmt(prev, names)) set.add(f.key);
  }
  return set;
}

export function CardHistory({
  versions,
  partnerNames,
}: {
  versions: CardVersionRow[];
  partnerNames: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (versions.length === 0) {
    return <p className="text-sm text-ink-subtle">Пока нет сохранённых версий.</p>;
  }

  const current = versions[0];

  function onRestore(id: string) {
    setError(null);
    setConfirmId(null);
    start(async () => {
      try {
        await restoreCardVersionAction(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось восстановить.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <ul className="divide-y divide-line-subtle rounded-lg border border-line">
        {versions.map((v, i) => {
          const prev = versions[i + 1]; // следующая в списке = предыдущая по времени
          const isOpen = openId === v.id;
          const isCurrent = v.id === current.id;
          const changed = changedFields(v, prev, partnerNames);
          const changedLabels = FIELDS.filter((f) => changed.has(f.key)).map((f) => f.label);

          return (
            <li key={v.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-ink">v{v.version}</span>
                {isCurrent && <Badge tone="success">текущая</Badge>}
                <span className="text-ink-subtle">· {reasonText(v.reason)}</span>
                <span className="text-ink-subtle">· {v.createdAt}</span>
                {v.editor && <span className="text-ink-subtle">· {v.editor}</span>}
                <span className="ml-auto flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : v.id)}
                    className="font-medium text-primary hover:underline"
                  >
                    {isOpen ? "скрыть" : "показать"}
                  </button>
                  {!isCurrent &&
                    (confirmId === v.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onRestore(v.id)}
                          disabled={pending}
                          className="font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          точно восстановить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="font-medium text-ink-subtle hover:underline"
                        >
                          отмена
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(v.id)}
                        disabled={pending}
                        className="font-medium text-ink-muted hover:text-primary hover:underline disabled:opacity-50"
                      >
                        восстановить
                      </button>
                    ))}
                </span>
              </div>

              {changedLabels.length > 0 && !isOpen && (
                <p className="mt-1 text-xs text-ink-subtle">изменено: {changedLabels.join(", ")}</p>
              )}

              {isOpen && (
                <dl className="mt-2 grid gap-x-4 gap-y-1.5 border-t border-line-subtle pt-2 sm:grid-cols-[130px_1fr]">
                  {FIELDS.map((f) => {
                    const isChanged = changed.has(f.key);
                    const value = f.fmt(v, partnerNames);
                    const wasValue = prev ? f.fmt(prev, partnerNames) : "";
                    return (
                      <div key={f.key} className="contents">
                        <dt className={cx("text-ink-muted", isChanged && "font-medium text-primary-strong")}>
                          {f.label}
                        </dt>
                        <dd className="min-w-0">
                          {f.image ? (
                            value ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={value}
                                alt=""
                                className="h-16 w-16 rounded-md border border-line object-cover"
                              />
                            ) : (
                              <span className="text-ink-subtle">—</span>
                            )
                          ) : (
                            <span className={cx("text-ink", isChanged && "font-medium")}>{value}</span>
                          )}
                          {isChanged && !f.image && wasValue !== value && (
                            <span className="ml-2 text-xs text-ink-subtle">было: {wasValue}</span>
                          )}
                          {isChanged && f.image && (
                            <span className="ml-2 text-xs text-ink-subtle">изменено</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
      {pending && <p className="text-xs text-ink-subtle">Восстановление…</p>}
    </div>
  );
}
