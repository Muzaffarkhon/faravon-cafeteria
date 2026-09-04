"use client";

import { useEffect, useRef, useState } from "react";

/** QR-код купона с увеличением по нажатию: оверлей по центру экрана. */
export function QrZoom({ svg, number }: { svg: string; number: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
      window.addEventListener("keydown", onKey);
      closeRef.current?.focus(); // фокус в модалку
      wasOpen.current = true;
      return () => window.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus(); // вернуть фокус на кнопку после закрытия
    }
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Увеличить QR-код"
        className="shrink-0 rounded-lg bg-white p-2 shadow-xs transition-transform hover:scale-[1.03] [&>svg]:block [&>svg]:h-[108px] [&>svg]:w-[108px]"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden="true" />
          <div
            className="relative rounded-2xl bg-white p-5 shadow-2xl [&>svg]:block [&>svg]:h-[min(70vw,340px)] [&>svg]:w-[min(70vw,340px)]"
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="absolute inset-x-0 bottom-8 text-center">
            <span className="rounded-full bg-white/90 px-3 py-1 font-mono text-sm font-semibold text-ink shadow">
              № {number}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            className="absolute right-5 top-5 rounded-lg bg-white/90 p-2 text-ink shadow hover:bg-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
