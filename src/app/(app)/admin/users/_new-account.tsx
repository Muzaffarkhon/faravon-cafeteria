"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import { createEmployee } from "./actions";
import { EmployeeForm } from "./_form";
import { NewServiceAccount } from "./_account";

type Kind = "employee" | "service";

/**
 * Единый шаг создания учётной записи: сначала выбираем тип (роль по сути),
 * затем показывается соответствующая форма.
 *  - «Сотрудник» — карточка (ФИО/подразделение) + опционально вход на платформу;
 *  - «Служебная» — только логин и роль (C&B, подрядчик и т.п.).
 */
export function NewAccount({ partners }: { partners: { id: string; name: string }[] }) {
  const [kind, setKind] = useState<Kind>("employee");

  const tab = (key: Kind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(key)}
      aria-current={kind === key ? "page" : undefined}
      className={cx(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        kind === key ? "bg-primary text-on-brand" : "text-ink hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-line bg-surface p-0.5">
        {tab("employee", "Сотрудник")}
        {tab("service", "Служебная")}
      </div>

      <p className="text-sm text-ink-muted">
        {kind === "employee"
          ? "Карточка сотрудника (ФИО, должность, подразделение). При необходимости сразу создайте вход на платформу с нужными ролями."
          : "Учётная запись для роли без карточки сотрудника: C&B, подрядчик и т.п. Нужны только логин и роль."}
      </p>

      <div hidden={kind !== "employee"}>
        <EmployeeForm action={createEmployee} submitLabel="Добавить" withAccount />
      </div>
      <div hidden={kind !== "service"}>
        <NewServiceAccount partners={partners} embedded />
      </div>
    </div>
  );
}
