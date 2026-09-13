"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
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
export function NewAccount({ partners, locale }: { partners: { id: string; name: string }[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [kind, setKind] = useState<Kind>("employee");

  const tab = (key: Kind, label: string, sub: string) => (
    <button
      type="button"
      onClick={() => setKind(key)}
      aria-current={kind === key ? "page" : undefined}
      className={cx(
        "flex-1 rounded-lg px-4 py-2.5 text-left transition-colors",
        kind === key ? "bg-primary text-on-brand" : "text-ink hover:bg-surface-muted",
      )}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span
        className={cx(
          "block text-xs",
          kind === key ? "text-on-brand/80" : "text-ink-muted",
        )}
      >
        {sub}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
        {tab("employee", t("users.new.employeeTab"), t("users.new.employeeTabSub"))}
        {tab("service", t("users.new.serviceTab"), t("users.new.serviceTabSub"))}
      </div>

      <p className="text-sm text-ink-muted">
        {kind === "employee" ? t("users.new.employeeHint") : t("users.new.serviceHint")}
      </p>

      <div hidden={kind !== "employee"}>
        <EmployeeForm action={createEmployee} submitLabel={t("users.add")} withAccount locale={locale} />
      </div>
      <div hidden={kind !== "service"}>
        <NewServiceAccount partners={partners} embedded locale={locale} />
      </div>
    </div>
  );
}
