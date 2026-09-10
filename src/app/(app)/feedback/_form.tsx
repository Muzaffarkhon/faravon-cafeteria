"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { submitFeedback, type FeedbackState } from "./actions";

export function FeedbackForm() {
  const [state, formAction, pending] = useActionState<FeedbackState, FormData>(submitFeedback, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="max-w-lg space-y-4">
      <Field label="Тема" htmlFor="topic" hint="Необязательно.">
        <Input id="topic" name="topic" placeholder="напр. льготы, работа сервиса, предложение" />
      </Field>

      <Field label="Сообщение" htmlFor="message" required>
        <Textarea id="message" name="message" rows={5} required maxLength={4000} />
      </Field>

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success-strong" role="status">
          Спасибо! Обращение отправлено — C&amp;B его рассмотрит.
        </p>
      )}

      <Button type="submit" loading={pending}>
        Отправить обращение
      </Button>
    </form>
  );
}
