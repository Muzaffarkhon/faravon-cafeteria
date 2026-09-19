"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BLOCKS, CARD_STATUSES, blockLabel, cardStatusLabel } from "@/lib/labels";
import { Button, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { TranslationFields } from "@/components/translation-fields";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { CardImageField } from "./_image-field";
import type { CardFormState } from "./actions";

export type CardValues = {
  block: string;
  title: string;
  status: string;
  description: string | null;
  condition: string | null;
  imageUrl: string | null;
  category: string | null;
  isActive: boolean;
  sortOrder: number;
  minParticipants: number;
  mode: string;
  cashbackPercent: number;
  groupWaves: boolean;
  partnerId: string | null;
  translations?: Partial<Record<"tg" | "uz", Record<string, string>>> | null;
};

const CARD_TRANSLATION_FIELDS = [
  { name: "title", label: "Название" },
  { name: "description", label: "Описание", multiline: true },
  { name: "condition", label: "Условие / скидка" },
];

const NEW_CATEGORY = "__new__";

export function CardForm({
  action,
  partners,
  categories,
  initial,
  submitLabel,
  locale,
}: {
  action: (s: CardFormState, fd: FormData) => Promise<CardFormState>;
  partners: { id: string; name: string }[];
  /** Существующие категории — выбор из списка, чтобы не плодить дубликаты вида «Транспорт»/«транспорт». */
  categories: string[];
  initial?: Partial<CardValues>;
  submitLabel: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState(action, {});
  const [block, setBlock] = useState(initial?.block ?? "FLEX");
  const [mode, setMode] = useState(initial?.mode ?? "ONE_TIME");
  const initialCategory = initial?.category ?? "";
  const [category, setCategory] = useState(
    initialCategory && !categories.includes(initialCategory) ? NEW_CATEGORY : initialCategory,
  );
  const [customCategory, setCustomCategory] = useState(
    initialCategory && !categories.includes(initialCategory) ? initialCategory : "",
  );

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("cards.form.block")} htmlFor="block" required>
          <Select id="block" name="block" value={block} onChange={(e) => setBlock(e.target.value)}>
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                {blockLabel(locale, b)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("cards.form.publication")} htmlFor="status">
          <Select id="status" name="status" defaultValue={initial?.status ?? "PUBLISHED"}>
            {CARD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {cardStatusLabel(locale, s)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t("cards.form.title")} htmlFor="title" required>
        <Input id="title" name="title" defaultValue={initial?.title ?? ""} required />
      </Field>

      <Field label={t("cards.form.description")} htmlFor="description">
        <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} rows={2} />
      </Field>

      {block === "FLEX" && (
        <>
          <Field label={t("cards.form.condition")} htmlFor="condition">
            <Input id="condition" name="condition" defaultValue={initial?.condition ?? ""} />
          </Field>
          <Field label={t("cards.form.partner")} htmlFor="partnerId">
            <Select id="partnerId" name="partnerId" defaultValue={initial?.partnerId ?? ""}>
              <option value="">{t("cards.form.partnerNone")}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("cards.form.minParticipants")}
            htmlFor="minParticipants"
            hint={t("cards.form.minParticipantsHint")}
          >
            <Input
              id="minParticipants"
              type="number"
              inputMode="numeric"
              min={1}
              name="minParticipants"
              defaultValue={initial?.minParticipants ?? 1}
            />
          </Field>
          <Field label={t("cards.form.mode")} htmlFor="mode" hint={t(`cards.form.modeHint.${mode}` as Parameters<typeof t>[0])}>
            <Select id="mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="ONE_TIME">{t("cards.form.mode.ONE_TIME")}</option>
              <option value="PERIOD">{t("cards.form.mode.PERIOD")}</option>
              <option value="CASHBACK">{t("cards.form.mode.CASHBACK")}</option>
            </Select>
          </Field>
          {mode === "CASHBACK" && (
            <Field label={t("cards.form.cashbackPercent")} htmlFor="cashbackPercent" hint={t("cards.form.cashbackPercentHint")}>
              <Input
                id="cashbackPercent"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                name="cashbackPercent"
                defaultValue={initial?.cashbackPercent || 10}
              />
            </Field>
          )}
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="groupWaves"
              defaultChecked={initial?.groupWaves ?? false}
              className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
            />
            <span>
              {t("cards.form.groupWaves")}
              <span className="block text-xs text-ink-muted">{t("cards.form.groupWavesHint")}</span>
            </span>
          </label>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("cards.form.category")} htmlFor="category">
          <Select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t("cards.form.noCategory")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={NEW_CATEGORY}>{t("cards.form.newCategory")}</option>
          </Select>
          {category === NEW_CATEGORY && (
            <Input
              className="mt-2"
              placeholder={t("cards.form.newCategoryPlaceholder")}
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
            />
          )}
          <input
            type="hidden"
            name="category"
            value={category === NEW_CATEGORY ? customCategory : category}
          />
        </Field>
        <Field label={t("cards.form.sortOrder")} htmlFor="sortOrder">
          <Input id="sortOrder" type="number" name="sortOrder" defaultValue={initial?.sortOrder ?? 0} />
        </Field>
      </div>

      <CardImageField initial={initial?.imageUrl} locale={locale} />

      <TranslationFields fields={CARD_TRANSLATION_FIELDS} initial={initial?.translations} />

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
        />
        {t("cards.form.active")}
      </label>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <Link href="/admin/cards" className={buttonClass({ variant: "secondary" })}>
          {t("cards.cancel")}
        </Link>
      </div>
    </form>
  );
}
