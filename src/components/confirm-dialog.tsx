"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cx } from "./ui";

type Tone = "primary" | "danger" | "success";

const TONE_BTN: Record<Tone, string> = {
  primary: "bg-primary text-on-brand hover:bg-primary-hover",
  danger: "bg-danger text-on-brand hover:brightness-95",
  success: "bg-success text-on-brand hover:brightness-95",
};

/**
 * Модалка-подтверждение (по макету редизайна): согласование/отклонение
 * заявок, удаление карточек и партнёров. Закрывается по клику вне, Esc и
 * «Отмена». Деструктивное действие — только по явному нажатию.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  tone = "primary",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  // Портал в <body> — иначе диалог остаётся потомком строки таблицы/карточки,
  // и если у родителя есть transform/filter (напр. hover-эффект), fixed-диалог
  // окажется зажат в его контексте наложения и может уехать под шапку (см. тот
  // же приём в card-details.tsx / flex-selection.tsx).
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-5"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-[20px] bg-surface p-7 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
      >
        <div className="font-display text-[17px] font-bold text-ink">{title}</div>
        {message != null && (
          <div className="mt-2 text-[13px] leading-6 text-ink-muted">{message}</div>
        )}
        <div className="mt-6 flex gap-2.5">
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={cx(
              "flex-1 rounded-[10px] px-3 py-3 text-[13px] font-bold transition disabled:opacity-60",
              TONE_BTN[tone],
            )}
          >
            {busy ? "…" : confirmLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-[10px] border-2 border-line bg-surface px-3 py-[calc(0.75rem-2px)] text-[13px] font-bold text-ink transition hover:bg-surface-muted disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
