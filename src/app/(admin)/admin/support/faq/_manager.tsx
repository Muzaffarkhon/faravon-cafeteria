"use client";

import { useState, useTransition } from "react";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { createFaq, deleteFaq, updateFaq } from "./actions";

type Faq = { id: string; question: string; answer: string; lastEdit?: string };

function FaqRow({ faq, locale }: { faq: Faq; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    start(async () => {
      const r = await updateFaq(faq.id, question, answer);
      if (r.error) setErr(r.error);
      else setEditing(false);
    });
  }

  function remove() {
    if (!confirm(t("faq.deleteConfirm"))) return;
    start(async () => {
      await deleteFaq(faq.id);
    });
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-line p-3">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} disabled={pending} maxLength={64} />
        <Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={pending} />
        {err && (
          <p className="text-sm font-medium text-danger" role="alert">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} loading={pending} disabled={!question.trim() || !answer.trim()}>
            {t("faq.save")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setQuestion(faq.question);
              setAnswer(faq.answer);
              setEditing(false);
            }}
          >
            {t("faq.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{faq.question}</p>
        <p className="mt-0.5 whitespace-pre-line text-xs text-ink-muted">{faq.answer}</p>
        {faq.lastEdit && (
          <p className="mt-1 text-xs text-ink-subtle" data-numeric>
            {t("faq.editedLabel")}: {faq.lastEdit}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
          {t("faq.edit")}
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={remove}>
          {t("faq.delete")}
        </Button>
      </div>
    </div>
  );
}

export function FaqManager({ faqs, locale }: { faqs: Faq[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    setErr(null);
    start(async () => {
      const r = await createFaq(question, answer);
      if (r.error) setErr(r.error);
      else {
        setQuestion("");
        setAnswer("");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("faq.questionPlaceholder")}
          disabled={pending}
          maxLength={64}
        />
        <Textarea
          rows={2}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={t("faq.answerPlaceholder")}
          disabled={pending}
        />
        {err && (
          <p className="text-sm font-medium text-danger" role="alert">
            {err}
          </p>
        )}
        <Button onClick={add} loading={pending} disabled={!question.trim() || !answer.trim()}>
          {t("faq.add")}
        </Button>
      </Card>

      {faqs.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("faq.empty")}</p>
      ) : (
        <div className="space-y-2">
          {faqs.map((f) => (
            <FaqRow key={f.id} faq={f} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
