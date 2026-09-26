"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

/**
 * Кнопка отправки формы, отключающая себя на время pending (useFormStatus).
 * Без этого двойной клик по обычной <button type="submit"> в server-actions
 * формах (нет своего client-state) успевает уйти вторым запросом до того,
 * как страница перерендерится после первого — см. gamification actions.
 */
export function SubmitButton({
  disabled,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}
