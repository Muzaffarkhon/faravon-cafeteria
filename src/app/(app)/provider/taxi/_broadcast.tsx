"use client";

import { useState, useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import {
  sendTaxiPromo,
  uploadTaxiPromosExcel,
  type TaxiPromoState,
  type UploadTaxiPromosState,
} from "./actions";

export function PromoBroadcast({
  recipients,
  locale,
  exportHref,
}: {
  recipients: number;
  locale: Locale;
  exportHref: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [activeTab, setActiveTab] = useState<"individual" | "common">("individual");

  // Common broadcast action
  const [commonState, commonFormAction, commonPending] = useActionState<TaxiPromoState, FormData>(
    sendTaxiPromo,
    {},
  );

  // Individual Excel upload action
  const [excelState, excelFormAction, excelPending] = useActionState<UploadTaxiPromosState, FormData>(
    uploadTaxiPromosExcel,
    {},
  );

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-line-subtle gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("individual")}
          className={`pb-2.5 px-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "individual"
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {t("providerTaxi.tabIndividual")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("common")}
          className={`pb-2.5 px-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "common"
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {t("providerTaxi.tabCommon")}
        </button>
      </div>

      {/* Tab 1: Individual promo codes via Excel upload */}
      {activeTab === "individual" && (
        <div className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-3.5 flex flex-col justify-between">
              <div>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-strong mb-2">
                  1
                </span>
                <p className="text-xs font-semibold text-ink">{t("providerTaxi.uploadStep1")}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Выгрузка со списком одобренных сотрудников ({recipients} чел.).
                </p>
              </div>
              <div className="mt-3">
                <a
                  href={exportHref}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-xs hover:bg-surface-muted transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {t("providerTaxi.downloadList")}
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-3.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-strong mb-2">
                2
              </span>
              <p className="text-xs font-semibold text-ink">{t("providerTaxi.uploadStep2")}</p>
              <p className="mt-1 text-xs text-ink-muted">
                Колонка «Промокод» подсвечена зеленым. Скопируйте туда уникальные коды напротив каждого номера.
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-surface-muted/50 p-3.5 flex flex-col justify-between">
              <div>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-strong mb-2">
                  3
                </span>
                <p className="text-xs font-semibold text-ink">{t("providerTaxi.uploadStep3")}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Система распределит коды по номерам и разошлет их в Telegram.
                </p>
              </div>
            </div>
          </div>

          <form action={excelFormAction} className="rounded-xl border border-line-subtle bg-surface p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-64">
                <input
                  type="file"
                  id="excel-file"
                  name="file"
                  accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  className="block w-full text-xs text-ink-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary-soft file:text-primary-strong hover:file:bg-primary-soft/80 cursor-pointer"
                />
              </div>
              <Button type="submit" loading={excelPending} disabled={recipients === 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {t("providerTaxi.sendIndividualBtn")}
              </Button>
            </div>

            {excelState.error && (
              <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
                {excelState.error}
              </p>
            )}

            {excelState.sent != null && (
              <div className="rounded-md bg-success-soft p-3 text-sm text-success-strong space-y-1">
                <p className="font-semibold">
                  ✓ {t("providerTaxi.uploadSuccess")} <b>{excelState.sent}</b>
                </p>
                <div className="flex flex-wrap gap-x-4 text-xs opacity-90">
                  <span>{t("providerTaxi.matchedCount")} <b>{excelState.matched}</b></span>
                  {!!excelState.notFound && (
                    <span className="text-amber-700 dark:text-amber-300">
                      ⚠️ {t("providerTaxi.notFoundWarn")} <b>{excelState.notFound}</b>
                    </span>
                  )}
                  {!!excelState.emptyCode && (
                    <span>{t("providerTaxi.emptyPromoWarn")} <b>{excelState.emptyCode}</b></span>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Tab 2: Common single promo code */}
      {activeTab === "common" && (
        <form action={commonFormAction} className="space-y-3 pt-1">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("providerTaxi.promoLabel")} htmlFor="promo" className="min-w-56 flex-1">
              <Input id="promo" name="promo" required autoComplete="off" placeholder={t("providerTaxi.promoPlaceholder")} />
            </Field>
            <Button type="submit" loading={commonPending} disabled={recipients === 0}>
              {t("providerTaxi.sendToAll")}
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            {t("providerTaxi.promoHintPrefix")} {recipients} {t("providerTaxi.promoHintSuffix")}
          </p>

          {commonState.error && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
              {commonState.error}
            </p>
          )}
          {commonState.sent != null && (
            <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
              {t("providerTaxi.sentPrefix")} {commonState.sent} {t("providerTaxi.sentSuffix")}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
