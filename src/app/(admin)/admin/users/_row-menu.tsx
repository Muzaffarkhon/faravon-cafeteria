"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cx } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  deleteEmployee,
  deleteServiceAccount,
  setEmployeeArchived,
  type DeleteResult,
} from "./actions";

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
  locale,
}: {
  kind: Kind;
  id: string;
  name: string;
  archived?: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const anchor = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; openUp: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<DeleteResult["blocked"] | null>(null);
  const [cascadeArmed, setCascadeArmed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const row = anchor.current?.closest("tr");
    if (!row) return;
    rowRef.current = row;
    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Для нижних строк открываем меню вверх от курсора, а не вниз — иначе
      // оно упирается в нижний край экрана и часть пунктов не помещается.
      setAt({
        x: Math.min(e.clientX, window.innerWidth - 200),
        y: e.clientY,
        openUp: e.clientY > window.innerHeight * 0.65,
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
    // Правый клик по другой строке открывает её меню — это должно закрывать
    // наше, иначе открытые меню копятся стопкой. Клик по своей же строке
    // пропускаем: там меню просто переезжает на новое место.
    const onCtx = (e: MouseEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", onCtx);
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
      if (kind === "employee") {
        const r = await deleteEmployee(id);
        if (r.error) {
          setErr(r.error);
          setBlocked(r.blocked ?? null);
          return;
        }
      } else {
        const r = await deleteServiceAccount(id);
        if (r.error) {
          setErr(r.error);
          return;
        }
      }
      setConfirming(false);
    });
  }

  /** Отказали в удалении — предложить архив прямо из диалога. */
  function archiveFromDialog() {
    start(async () => {
      const r = await setEmployeeArchived(id, true);
      if (r?.error) setErr(r.error);
      else setConfirming(false);
    });
  }

  /** Каскад: отвязать и стереть заявки/купоны/обращения вместе с сотрудником. */
  function removeCascade() {
    if (!cascadeArmed) {
      setCascadeArmed(true);
      return;
    }
    setErr(null);
    start(async () => {
      const r = await deleteEmployee(id, { cascade: true });
      if (r.error) {
        setErr(r.error);
        return;
      }
      setConfirming(false);
      setCascadeArmed(false);
    });
  }

  function openAtButton(e: React.MouseEvent<HTMLButtonElement>) {
    // Иначе тот же клик, что открывает меню, доходит (bubbling) до window и
    // мгновенно закрывает его — тем же слушателем click-вне-меню ниже.
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setAt({
      x: Math.min(r.left, window.innerWidth - 200),
      y: r.bottom > window.innerHeight * 0.65 ? r.top : r.bottom,
      openUp: r.bottom > window.innerHeight * 0.65,
    });
  }

  return (
    <span ref={anchor} className="contents">
      {/* Видимая кнопка-триггер — раньше меню открывалось только по правому
          клику, без единой подсказки, что оно вообще есть (сам «Удалить
          навсегда» внутри намеренно без отдельной кнопки на строке — слишком
          легко нажать; тут нужно ещё открыть меню и подтвердить). */}
      <button
        type="button"
        aria-label={t("users.menu.moreActions")}
        onClick={openAtButton}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-subtle transition hover:bg-surface-muted hover:text-ink"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {at &&
        createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          style={
            at.openUp
              ? { bottom: window.innerHeight - at.y, left: at.x }
              : { top: at.y, left: at.x }
          }
          className="fixed z-[80] w-[190px] overflow-hidden rounded-[12px] border border-line bg-surface py-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          {kind === "employee" && (
            <>
              <Link href={`/admin/users/${id}`} role="menuitem" className={ITEM_CLASS}>
                {t("users.menu.openCard")}
              </Link>
              <button type="button" role="menuitem" className={ITEM_CLASS} onClick={archive}>
                {archived ? t("users.arch.returnFromArchive") : t("users.arch.toArchive")}
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
              setBlocked(null);
              setConfirming(true);
            }}
          >
            {t("users.menu.deleteForever")}
          </button>
        </div>,
        document.body,
        )}

      <ConfirmDialog
        open={confirming}
        title={t("users.menu.deleteConfirmTitle")}
        message={
          <>
            <b className="text-ink">{name}</b> {t("users.menu.deleteConfirmMessage")}
            {err && (
              <>
                <span className="mt-2 block font-medium text-danger" role="alert">
                  {err}
                </span>
                {(blocked?.feedback ?? 0) > 0 && (
                  <Link
                    href="/admin/support"
                    className="mt-1.5 block font-semibold text-primary hover:underline"
                  >
                    {t("users.menu.goToFeedback")}
                  </Link>
                )}
                {kind === "employee" && !archived && blocked && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={archiveFromDialog}
                    className="mt-2 w-full rounded-[10px] border-2 border-line bg-surface px-3 py-2 text-[13px] font-bold text-ink transition hover:bg-surface-muted disabled:opacity-60"
                  >
                    {t("users.menu.moveToArchive")}
                  </button>
                )}
                {kind === "employee" && blocked && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={removeCascade}
                    className="mt-1.5 w-full rounded-[10px] border-2 border-danger bg-surface px-3 py-2 text-[13px] font-bold text-danger transition hover:bg-danger-soft disabled:opacity-60"
                  >
                    {cascadeArmed
                      ? t("users.menu.cascadeConfirm")
                      : t("users.menu.cascadeDelete")}
                  </button>
                )}
              </>
            )}
          </>
        }
        confirmLabel={t("users.menu.delete")}
        tone="danger"
        busy={pending}
        onConfirm={remove}
        onClose={() => {
          setConfirming(false);
          setBlocked(null);
          setCascadeArmed(false);
        }}
      />

      {err && !confirming && (
        <span className="mt-1 block text-xs font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
