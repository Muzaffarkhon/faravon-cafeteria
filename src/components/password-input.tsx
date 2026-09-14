"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Input, cx } from "@/components/ui";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** Текстовое поле пароля с переключателем видимости («глазок»). */
export function PasswordInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cx("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-subtle transition-colors hover:text-ink"
      >
        <EyeIcon off={visible} />
      </button>
    </div>
  );
}
