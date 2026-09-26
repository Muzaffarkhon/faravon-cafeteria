"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, cx } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { EmployeeForm } from "./_form";
import { AccountPanel, EmployeeActiveToggle } from "./_account";
import { getEmployeeEditData, updateEmployee, type EmployeeEditData } from "./actions";

/**
 * Карточка редактирования сотрудника в модалке — вместо перехода на
 * `/admin/users/[id]`. Данные грузятся лениво при открытии; переиспользует
 * те же формы, что и отдельная страница (EmployeeForm/AccountPanel), просто
 * рендерит их поверх таблицы. Архив сотрудника — только в строке таблицы,
 * здесь не дублируется.
 */
export function EmployeeEditButton({
  id,
  label,
  locale,
}: {
  id: string;
  label: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EmployeeEditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function openModal() {
    setOpen(true);
    setError(null);
    setLoading(true);
    getEmployeeEditData(id)
      .then((d) => {
        if (!d) setError(t("users.acc.actionFailed"));
        setData(d);
      })
      .catch(() => setError(t("users.acc.actionFailed")))
      .finally(() => setLoading(false));
  }

  function close() {
    setOpen(false);
    setData(null);
    // Строка таблицы (роли/логин/статус/последняя правка) могла измениться.
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openModal}>
        {label}
      </Button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4"
            role="presentation"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={data?.fullName ?? label}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            >
              <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
                <div>
                  <div className="font-display text-[17px] font-bold text-ink">
                    {data?.fullName ?? "…"}
                  </div>
                  {data && (
                    <div className="text-xs text-ink-muted">
                      {data.position} · {data.department}
                      {data.archivedAt && ` · ${t("users.edit.inArchive")}`}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t("users.acc.close")}
                  className="rounded-md px-2 py-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto p-5">
                {loading && <p className="text-sm text-ink-muted">…</p>}
                {error && (
                  <p className="text-sm font-medium text-danger" role="alert">
                    {error}
                  </p>
                )}
                {data && (
                  <div className="space-y-6">
                    <EmployeeForm
                      action={updateEmployee.bind(null, id)}
                      initial={{
                        fullName: data.fullName,
                        position: data.position,
                        department: data.department,
                        phone: data.phone,
                        phoneSecondary: data.phoneSecondary,
                        telegramId: data.telegramId,
                      }}
                      submitLabel={t("users.edit.save")}
                      onCancel={close}
                      locale={locale}
                    />

                    <div className={cx("border-t border-line-subtle pt-5")}>
                      <p className="mb-3 text-sm font-semibold text-ink">
                        {t("users.edit.accountAndRoles")}
                      </p>
                      <AccountPanel employeeId={id} user={data.user} locale={locale} />
                    </div>

                    <div className="border-t border-line-subtle pt-5">
                      <p className="mb-2 text-sm text-ink-muted">
                        {data.isActive
                          ? t("users.edit.activeHint")
                          : `${t("users.edit.deactivatedPrefix")}${
                              data.terminatedAt
                                ? ` ${new Date(data.terminatedAt).toLocaleDateString("ru-RU")}`
                                : ""
                            }.`}
                      </p>
                      <EmployeeActiveToggle employeeId={id} isActive={data.isActive} locale={locale} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
