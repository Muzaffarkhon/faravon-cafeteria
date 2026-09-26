"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import type { TaskFormState } from "./actions";

export function TaskForm({
  action,
  locale,
}: {
  action: (s: TaskFormState, fd: FormData) => Promise<TaskFormState>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState(action, {});
  const [verification, setVerification] = useState("MANUAL");
  const [scope, setScope] = useState("ALL");

  return (
    <form action={formAction} className="space-y-4">
      <Field label={t("gamificationAdmin.form.title")} htmlFor="title" required>
        <Input id="title" name="title" required />
      </Field>
      <Field label={t("gamificationAdmin.form.description")} htmlFor="description" required>
        <Textarea id="description" name="description" rows={2} required />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("gamificationAdmin.form.coinReward")} htmlFor="coinReward" required>
          <Input id="coinReward" name="coinReward" type="number" min={1} required />
        </Field>
        <Field label={t("gamificationAdmin.form.verification")} htmlFor="verification">
          <Select id="verification" name="verification" value={verification} onChange={(e) => setVerification(e.target.value)}>
            <option value="MANUAL">{t("gamificationAdmin.form.verificationManual")}</option>
            <option value="AUTO">{t("gamificationAdmin.form.verificationAuto")}</option>
          </Select>
        </Field>
      </div>
      {verification === "AUTO" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("gamificationAdmin.form.metric")} htmlFor="autoMetric">
            <Select id="autoMetric" name="autoMetric">
              <option value="APPLICATIONS_SUBMITTED">{t("gamificationAdmin.form.metricApplications")}</option>
              <option value="COUPONS_USED">{t("gamificationAdmin.form.metricCoupons")}</option>
              <option value="FEEDBACK_GIVEN">{t("gamificationAdmin.form.metricFeedback")}</option>
            </Select>
          </Field>
          <Field label={t("gamificationAdmin.form.targetValue")} htmlFor="targetValue" required>
            <Input id="targetValue" name="targetValue" type="number" min={1} required />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("gamificationAdmin.form.scope")} htmlFor="scope">
          <Select id="scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="ALL">{t("gamificationAdmin.form.scopeAllOption")}</option>
            <option value="DEPARTMENT">{t("gamificationAdmin.form.department")}</option>
          </Select>
        </Field>
        {scope === "DEPARTMENT" && (
          <Field label={t("gamificationAdmin.form.department")} htmlFor="department" required>
            <Input id="department" name="department" required />
          </Field>
        )}
        <Field label={t("gamificationAdmin.form.endsAt")} htmlFor="endsAt">
          <Input id="endsAt" name="endsAt" type="date" />
        </Field>
      </div>
      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" loading={pending}>
        {t("gamificationAdmin.form.submit")}
      </Button>
    </form>
  );
}
