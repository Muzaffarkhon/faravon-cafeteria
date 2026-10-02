"use client";

import Form from "next/form";
import type { ReactNode } from "react";

/**
 * Фильтры аудитории применяются сразу при выборе в списке — без кнопки «Показать»
 * (раньше выбранное, но не применённое значение расходилось с тем, кому реально уйдёт).
 * next/form — переход без перезагрузки, поэтому набранный текст сообщения не теряется.
 */
export function FilterForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Form
      action="/admin/broadcast"
      replace
      scroll={false}
      className={className}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </Form>
  );
}
