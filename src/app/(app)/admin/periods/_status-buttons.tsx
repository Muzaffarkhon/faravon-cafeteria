"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { setPeriodStatus, deletePeriod, resetFlowData } from "./actions";

export function PeriodActions({
  id,
  status,
  name,
}: {
  id: string;
  status: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  function execute(fn: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (r?.error) setError(r.error);
        else onSuccess?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status === "DRAFT" && (
          <Button
            variant="success"
            size="sm"
            disabled={pending}
            onClick={() => execute(() => setPeriodStatus(id, "OPEN"))}
          >
            Открыть
          </Button>
        )}
        {status === "OPEN" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmClose(true)}
          >
            Закрыть
          </Button>
        )}
        {(status === "DRAFT" || status === "CLOSED") && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmDel(true)}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            Удалить
          </Button>
        )}
      </div>

      {error && (
        <span className="max-w-[240px] text-right text-[11px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}

      <ConfirmDialog
        open={confirmClose}
        title="Закрыть период?"
        tone="primary"
        confirmLabel="Закрыть период"
        busy={pending}
        message={`Закрыть период «${name}»? Подача и изменение заявок станут недоступны.`}
        onConfirm={() => execute(() => setPeriodStatus(id, "CLOSED"), () => setConfirmClose(false))}
        onClose={() => !pending && setConfirmClose(false)}
      />

      <ConfirmDialog
        open={confirmDel}
        title="Удалить период?"
        tone="danger"
        confirmLabel="Удалить"
        busy={pending}
        message={
          <div className="space-y-1.5">
            <p>Вы уверены, что хотите удалить период «<strong>{name}</strong>»?</p>
            <p className="text-xs text-ink-subtle">
              Период и связанные с ним заявки/купоны будут удалены.
            </p>
          </div>
        }
        onConfirm={() => execute(() => deletePeriod(id), () => setConfirmDel(false))}
        onClose={() => !pending && setConfirmDel(false)}
      />
    </div>
  );
}

export function ResetFlowButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    setError(null);
    start(async () => {
      try {
        const r = await resetFlowData();
        if (r?.error) setError(r.error);
        else setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сброса данных");
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="text-danger hover:bg-danger/10 hover:text-danger"
      >
        Очистить тестовые заявки и купоны
      </Button>

      <ConfirmDialog
        open={open}
        title="Сбросить заявки и купоны?"
        tone="danger"
        confirmLabel="Очистить всё"
        busy={pending}
        message={
          <div className="space-y-2">
            <p>
              Будут безвозвратно удалены все поданные заявки сотрудников, позиции и купоны.
            </p>
            <p className="text-xs text-ink-subtle">
              Все настройки карточек льгот, баннеры, партнёры и пользователи останутся нетронутыми.
            </p>
            {error && (
              <p className="rounded-md bg-danger/10 p-2 text-xs font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        }
        onConfirm={handleReset}
        onClose={() => !pending && setOpen(false)}
      />
    </>
  );
}

