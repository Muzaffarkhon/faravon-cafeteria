"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";
import { buttonClass, type ButtonVariant, type ButtonSize } from "@/components/ui";

/**
 * Кнопка отправки формы, отключающая себя на время pending (useFormStatus).
 * Без этого двойной клик по обычной <button type="submit"> в server-actions
 * формах (нет своего client-state) успевает уйти вторым запросом до того,
 * как страница перерендерится после первого — см. gamification actions.
 *
 * Без variant — как раньше, голая <button> с className как есть (обратная
 * совместимость). С variant — визуал как у обычного Button, с тем же спиннером
 * на время pending.
 */
export function SubmitButton({
  disabled,
  className,
  children,
  variant,
  size,
  fullWidth,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  const styled = variant !== undefined;
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={styled ? buttonClass({ variant, size, fullWidth, className }) : className}
      {...props}
    >
      {styled && pending && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
}
