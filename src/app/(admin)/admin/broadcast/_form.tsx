"use client";

import { useActionState, useState } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { sendBroadcast, type BroadcastState } from "./actions";

export function BroadcastForm({
  departments,
  totalRecipients,
  locale,
}: {
  departments: string[];
  totalRecipients: number;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<BroadcastState, FormData>(sendBroadcast, {});
  const [department, setDepartment] = useState("");

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <Field label={t("broadcast.audienceLabel")} htmlFor="department">
        <Select
          id="department"
          name="department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">
            {t("broadcast.audienceAll")} ({totalRecipients})
          </option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("broadcast.textLabel")} htmlFor="text">
        <Textarea
          id="text"
          name="text"
          required
          rows={6}
          maxLength={3500}
          placeholder={t("broadcast.textPlaceholder")}
        />
      </Field>

      <Button type="submit" loading={pending}>
        {t("broadcast.send")}
      </Button>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.sent != null && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          {t("broadcast.sentPrefix")} {state.sent} {t("broadcast.sentSuffix")}
        </p>
      )}
    </form>
  );
}
