"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";

export type CardDetails = {
  title: string;
  description: string | null;
  condition: string | null;
  partnerName: string | null;
  discountType: string | null;
  terms: string | null;
  contactPerson: string | null;
  contacts: string | null;
};

/** Кнопка «Подробнее» на карточке льготы — модалка с полной информацией:
 * что это, у какого партнёра, на каких условиях и как связаться, если
 * возникнут вопросы «куда ехать / от кого / что делать». */
export function CardDetailsButton({ card }: { card: CardDetails }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
      window.addEventListener("keydown", onKey);
      closeRef.current?.focus();
      wasOpen.current = true;
      return () => window.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const hasDetails =
    card.description || card.condition || card.discountType || card.terms || card.contactPerson || card.contacts;
  if (!hasDetails) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-strong hover:underline"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        Подробнее
      </button>

      {open &&
        createPortal(
          // Портал в <body> — иначе модалка остаётся потомком карточки с
          // hover:-translate-y (см. flex-selection.tsx): при наведении рядом
          // с краем карточки её translate то включается, то выключается
          // (мышь то внутри, то снаружи из-за сдвига), и fixed-модалка внутри
          // такого transform-родителя дёргается вместе с ней — глюк-мигание.
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden="true" />
            <div
              className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-2xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold leading-snug text-ink">{card.title}</h3>
                  {card.partnerName && <p className="mt-0.5 text-sm text-ink-subtle">{card.partnerName}</p>}
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {card.description && (
                  <p className="text-sm leading-6 text-ink">{card.description}</p>
                )}

                {(card.condition || card.discountType || card.terms) && (
                  <div className="rounded-xl bg-surface-muted p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">
                      Как получить и условия
                    </p>
                    <div className="mt-1.5 space-y-1.5 text-sm leading-6 text-ink">
                      {card.condition && <p>{card.condition}</p>}
                      {card.discountType && <p>{card.discountType}</p>}
                      {card.terms && <p>{card.terms}</p>}
                    </div>
                  </div>
                )}

                {(card.contactPerson || card.contacts) && (
                  <div className="rounded-xl bg-surface-muted p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">
                      Если возникнут вопросы
                    </p>
                    <div className="mt-1.5 space-y-1 text-sm leading-6 text-ink">
                      {card.contactPerson && <p>{card.contactPerson}</p>}
                      {card.contacts && <p className="text-ink-muted">{card.contacts}</p>}
                    </div>
                  </div>
                )}
              </div>

              <Button variant="secondary" fullWidth className="mt-5" onClick={() => setOpen(false)}>
                Понятно
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
