import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { loadSurveyResults } from "@/lib/surveys";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SurveyEditor } from "./_editor";

const toLocal = (d: Date | null) => (d ? new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 16) : "");
const optionsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "satisfaction.manage")) redirect("/");
  const { id } = await params;
  const isNew = id === "new";

  const survey = isNew
    ? null
    : await db.survey.findUnique({
        where: { id },
        include: { questions: { orderBy: { position: "asc" } }, _count: { select: { responses: true } } },
      });
  if (!isNew && !survey) notFound();
  const results = survey ? await loadSurveyResults(survey.id) : null;

  return (
    <div className="space-y-5">
      <Link href="/admin/surveys" className="text-sm font-semibold text-primary hover:underline">
        ← Все опросы
      </Link>
      <PageHeader
        title={survey ? survey.title : "Новый опрос"}
        description={survey ? `Опрос #${survey.seq} · прошли ${survey._count.responses}` : "Заполните вопросы и включите опрос — сотрудники увидят его при заходе на сайт."}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <SurveyEditor
          id={survey?.id ?? null}
          locked={(survey?._count.responses ?? 0) > 0}
          initial={{
            title: survey?.title ?? "",
            description: survey?.description ?? "",
            coins: survey?.coins ?? 10,
            giftSpin: survey?.giftSpin ?? false,
            isActive: survey?.isActive ?? false,
            startsAt: toLocal(survey?.startsAt ?? null),
            endsAt: toLocal(survey?.endsAt ?? null),
            questions: (survey?.questions ?? []).map((q) => ({
              text: q.text,
              kind: q.kind,
              required: q.required,
              options: optionsOf(q.options),
            })),
          }}
        />

        {results && (
          <section className="space-y-3">
            <h2 className="font-bold text-ink">Результаты · {results.total}</h2>
            {results.total === 0 ? (
              <EmptyState>Пока никто не прошёл опрос.</EmptyState>
            ) : (
              results.questions.map((q, i) => (
                <Card key={q.id} className="space-y-3 p-5">
                  <p className="text-sm font-bold text-ink">
                    {i + 1}. {q.text}
                    <span className="ml-1.5 font-normal text-ink-subtle">· ответили {q.answered}</span>
                  </p>
                  {q.kind === "TEXT" ? (
                    q.texts.length === 0 ? (
                      <p className="text-sm text-ink-subtle">Нет ответов.</p>
                    ) : (
                      <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm text-ink">
                        {q.texts.map((t, j) => (
                          <li key={j} className="rounded-lg bg-surface-muted px-3 py-2">
                            {t}
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <ul className="space-y-2">
                      {q.counts.map((c) => {
                        const pct = q.answered ? Math.round((c.count / q.answered) * 100) : 0;
                        return (
                          <li key={c.option} className="text-sm">
                            <div className="flex justify-between gap-3">
                              <span className="text-ink">{c.option}</span>
                              <span className="shrink-0 tabular-nums text-ink-muted">
                                {c.count} · {pct}%
                              </span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}
