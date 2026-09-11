"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cx } from "@/components/ui";
import { deleteEmployee, deleteServiceAccount, setEmployeeArchived } from "./actions";

type Kind = "employee" | "service";

const ITEM_CLASS =
  "block w-full px-3 py-2 text-left text-[13px] text-ink transition hover:bg-surface-muted disabled:opacity-60";

/**
 * Меню строки по правому клику: то же, что и кнопки в колонке «Действия», плюс
 * безвозвратное удаление (кнопки для него нет намеренно — слишком легко нажать).
 * Живёт внутри строки, а слушателя вешает на саму `<tr>` — так серверная
 * разметка таблицы остаётся серверной, клиентский только этот кусочек.
 */
export function RowContextMenu({
  kind,
  id,
  name,
  archived = false,
}: {
  kind: Kind;
  id: string;
  name: string;
  archived?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const row = anchor.current?.closest("tr");
    if (!row) return;
    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Меню не должно уезжать за нижний/правый край окна.
      setAt({
        x: Math.min(e.clientX, window.innerWidth - 200),
        y: Math.min(e.clientY, window.innerHeight - 160),
      });
    };
    row.addEventListener("contextmenu", onMenu);
    return () => row.removeEventListener("contextmenu", onMenu);
  }, []);

  const close = useCallback(() => setAt(null), []);

  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [at, close]);

  function archive() {
    close();
    start(async () => {
      const r = await setEmployeeArchived(id, !archived);
      if (r?.error) setErr(r.error);
    });
  }

  function remove() {
    setErr(null);
    start(async () => {
      const r = kind === "employee" ? await deleteEmployee(id) : await deleteServiceAccount(id);
      if (r?.error) setErr(r.error);
      else setConfirming(false);
    });
  }

  return (
    <span ref={anchor} className="contents">
      {at && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          style={{ top: at.y, left: at.x }}
          className="fixed z-[80] w-[190px] overflow-hidden rounded-[12px] border border-line bg-surface py-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          {kind === "employee" && (
            <>
              <Link href={`/admin/users/${id}`} role="menuitem" className={ITEM_CLASS}>
                Открыть карточку
              </Link>
              <button type="button" role="menuitem" className={ITEM_CLASS} onClick={archive}>
                {archived ? "Вернуть из архива" : "В архив"}
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className={cx(ITEM_CLASS, "text-danger")}
            onClick={() => {
              close();
              setErr(null);
              setConfirming(true);
            }}
          >
            Удалить безвозвратно…
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Удалить безвозвратно?"
        message={
          <>
            <b className="text-ink">{name}</b> и учётная запись будут стёрты без возможности
            восстановления. Если нужно просто убрать из списка — используйте архив.
            {err && (
              <span className="mt-2 block font-medium text-danger" role="alert">
                {err}
              </span>
            )}
          </>
        }
        confirmLabel="Удалить"
        tone="danger"
        busy={pending}
        onConfirm={remove}
        onClose={() => setConfirming(false)}
      />

      {err && !confirming && (
        <span className="mt-1 block text-xs font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
