"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
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

export function CardHistory({
  versions,
  partnerNames,
}: {
  versions: CardVersionRow[];
  partnerNames: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (versions.length === 0) {
    return <p className="text-sm text-ink-subtle">Пока нет сохранённых версий.</p>;
  }

  const current = versions[0];

  function onRestore(id: string) {
    if (!confirm("Восстановить карточку в это состояние? Текущее сохранится в истории.")) return;
    setError(null);
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
        {versions.map((v) => {
          const isOpen = openId === v.id;
          const isCurrent = v.id === current.id;
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
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => onRestore(v.id)}
                      disabled={pending}
                      className="font-medium text-ink-muted hover:text-primary hover:underline disabled:opacity-50"
                    >
                      восстановить
                    </button>
                  )}
                </span>
              </div>

              {isOpen && (
                <dl className="mt-2 grid gap-x-4 gap-y-1 border-t border-line-subtle pt-2 sm:grid-cols-[130px_1fr]">
                  <Row k="Название" v={v.title} />
                  <Row k="Блок" v={BLOCK_LABELS[v.block as keyof typeof BLOCK_LABELS] ?? v.block} />
                  <Row k="Публикация" v={CARD_STATUS_LABELS[v.status as keyof typeof CARD_STATUS_LABELS] ?? v.status} />
                  <Row k="Активна" v={v.isActive ? "да" : "нет (скоро)"} />
                  {v.description && <Row k="Описание" v={v.description} />}
                  {v.condition && <Row k="Условие" v={v.condition} />}
                  {v.category && <Row k="Категория" v={v.category} />}
                  {v.partnerId && <Row k="Партнёр" v={partnerNames[v.partnerId] ?? v.partnerId} />}
                  <Row k="Порядок" v={String(v.sortOrder)} />
                  {v.imageUrl && (
                    <>
                      <dt className="text-ink-muted">Изображение</dt>
                      <dd>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.imageUrl}
                          alt=""
                          className="h-16 w-16 rounded-md border border-line object-cover"
                        />
                      </dd>
                    </>
                  )}
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-muted">{k}</dt>
      <dd className="font-medium text-ink">{v}</dd>
    </>
  );
}
