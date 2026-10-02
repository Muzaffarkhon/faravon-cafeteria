"use client";

import { useState, useTransition } from "react";
import type { SurveyQuestionKind } from "@prisma/client";
import { Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteSurveyAction, saveSurveyAction, type SurveyPayload } from "../actions";

type Q = { key: string; text: string; kind: SurveyQuestionKind; required: boolean; options: string[] };

const KIND_LABEL: Record<SurveyQuestionKind, string> = {
  SINGLE: "Один вариант",
  MULTI: "Несколько вариантов",
  TEXT: "Свой ответ (текст)",
};
let seq = 0;
const newQuestion = (): Q => ({ key: `n${++seq}`, text: "", kind: "SINGLE", required: true, options: ["", ""] });

/** Редактор опроса: шапка (название, награда, окно показа) и список вопросов с вариантами. */
export function SurveyEditor({
  id,
  initial,
  locked,
}: {
  id: string | null;
  initial: Omit<SurveyPayload, "questions"> & { questions: Omit<Q, "key">[] };
  /** У опроса уже есть ответы — вопросы менять нельзя. */
  locked: boolean;
}) {
  const [head, setHead] = useState({ ...initial, questions: undefined });
  const [questions, setQuestions] = useState<Q[]>(() =>
    initial.questions.length ? initial.questions.map((q) => ({ ...q, key: `n${++seq}` })) : [newQuestion()],
  );
  const [msg, setMsg] = useState<{ error?: string; notice?: string }>({});
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState(false);

  const patch = (key: string, p: Partial<Q>) => setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...p } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const next = [...qs];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  function save() {
    setMsg({});
    start(async () => {
      const r = await saveSurveyAction(id, {
        title: head.title,
        description: head.description,
        coins: head.coins,
        isActive: head.isActive,
        startsAt: head.startsAt,
        endsAt: head.endsAt,
        questions: questions.map(({ text, kind, required, options }) => ({ text, kind, required, options })),
      });
      setMsg(r);
    });
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <Field label="Название" htmlFor="title" required>
          <Input id="title" value={head.title} onChange={(e) => setHead({ ...head, title: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Описание" htmlFor="description" hint="Показывается на первом экране опроса — зачем он и сколько займёт.">
          <Textarea
            id="description"
            rows={3}
            value={head.description}
            onChange={(e) => setHead({ ...head, description: e.target.value })}
            maxLength={1000}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Награда, монет" htmlFor="coins" hint="0 — без награды.">
            <Input
              id="coins"
              type="number"
              min={0}
              max={10000}
              value={head.coins}
              onChange={(e) => setHead({ ...head, coins: Number(e.target.value) })}
            />
          </Field>
          <Field label="Показывать с" htmlFor="startsAt" hint="Пусто — сразу. Время — Душанбе.">
            <Input
              id="startsAt"
              type="datetime-local"
              value={head.startsAt}
              onChange={(e) => setHead({ ...head, startsAt: e.target.value })}
            />
          </Field>
          <Field label="Показывать до" htmlFor="endsAt" hint="Пусто — без срока.">
            <Input id="endsAt" type="datetime-local" value={head.endsAt} onChange={(e) => setHead({ ...head, endsAt: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={head.isActive}
            onChange={(e) => setHead({ ...head, isActive: e.target.checked })}
            className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
          />
          Опрос включён — показывать сотрудникам
        </label>
      </Card>

      {locked && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm font-medium text-warning-strong">
          Опрос уже проходили — вопросы заблокированы, чтобы не перепутать результаты. Название, описание, награду и сроки
          менять можно.
        </p>
      )}

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.key}>
            <Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">Вопрос {i + 1}</span>
                {!locked && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                      ↓
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={questions.length === 1}
                      onClick={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
                    >
                      Удалить
                    </Button>
                  </div>
                )}
              </div>
              <Input
                value={q.text}
                disabled={locked}
                onChange={(e) => patch(q.key, { text: e.target.value })}
                placeholder="Текст вопроса"
                aria-label={`Текст вопроса ${i + 1}`}
                maxLength={300}
              />
              <div className="flex flex-wrap items-center gap-4">
                <Select
                  value={q.kind}
                  disabled={locked}
                  onChange={(e) => {
                    const kind = e.target.value as SurveyQuestionKind;
                    patch(q.key, { kind, options: kind === "TEXT" ? [] : q.options.length ? q.options : ["", ""] });
                  }}
                  aria-label="Тип вопроса"
                  className="w-auto"
                >
                  {(Object.keys(KIND_LABEL) as SurveyQuestionKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={q.required}
                    disabled={locked}
                    onChange={(e) => patch(q.key, { required: e.target.checked })}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  Обязательный
                </label>
              </div>
              {q.kind !== "TEXT" && (
                <div className="space-y-2">
                  {q.options.map((o, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <span className={cx("h-4 w-4 shrink-0 border-2 border-line-strong", q.kind === "SINGLE" ? "rounded-full" : "rounded")} />
                      <Input
                        value={o}
                        disabled={locked}
                        onChange={(e) => patch(q.key, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                        placeholder={`Вариант ${j + 1}`}
                        aria-label={`Вариант ${j + 1}`}
                        maxLength={150}
                      />
                      {!locked && q.options.length > 2 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => patch(q.key, { options: q.options.filter((_, k) => k !== j) })}
                          aria-label={`Удалить вариант ${j + 1}`}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  ))}
                  {!locked && q.options.length < 12 && (
                    <Button size="sm" variant="secondary" onClick={() => patch(q.key, { options: [...q.options, ""] })}>
                      + Вариант
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ol>

      {!locked && questions.length < 20 && (
        <Button variant="secondary" onClick={() => setQuestions((qs) => [...qs, newQuestion()])}>
          + Добавить вопрос
        </Button>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 py-3 backdrop-blur">
        <Button onClick={save} loading={pending}>
          {id ? "Сохранить" : "Создать опрос"}
        </Button>
        {id && !locked && (
          <Button variant="ghost" onClick={() => setDeleting(true)}>
            Удалить опрос
          </Button>
        )}
        {msg.error && (
          <span className="text-sm font-medium text-danger" role="alert">
            {msg.error}
          </span>
        )}
        {msg.notice && (
          <span className="text-sm font-medium text-success-strong" role="status">
            {msg.notice}
          </span>
        )}
      </div>

      {id && (
        <ConfirmDialog
          open={deleting}
          tone="danger"
          title="Удалить опрос?"
          message="Опрос и его вопросы удалятся. Ответов у него пока нет."
          confirmLabel="Удалить"
          busy={pending}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            start(async () => {
              const r = await deleteSurveyAction(id);
              if (r?.error) setMsg(r);
              setDeleting(false);
            })
          }
        />
      )}
    </div>
  );
}
