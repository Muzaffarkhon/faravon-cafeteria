"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

/**
 * <form> вокруг server action, показывающий ActionResult.error по месту.
 * Раньше формы геймификации (asFormAction) молча глотали ошибку — сотрудник
 * не видел, почему покупка/подтверждение не прошли, только не срабатывала кнопка.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
