"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { FEEDBACK_TOPICS } from "@/lib/feedback";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { submitFeedback, type FeedbackState } from "./actions";

export function FeedbackForm({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [state, formAction, pending] = useActionState<FeedbackState, FormData>(submitFeedback, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="max-w-lg space-y-4">
      <Field label={t("feedback.topicLabel")} htmlFor="topic" required>
        <Select id="topic" name="topic" defaultValue="" required>
          <option value="" disabled>
            {t("feedback.topicPlaceholder")}
          </option>
          {FEEDBACK_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("feedback.messageLabel")} htmlFor="message" required>
        <Textarea id="message" name="message" rows={5} required maxLength={4000} />
      </Field>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          {t("feedback.sent")}
        </p>
      )}

      <Button type="submit" loading={pending}>
        {t("feedback.submit")}
      </Button>
    </form>
  );
}
