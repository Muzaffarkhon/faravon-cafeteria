import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader, RowId, Table, buttonClass } from "@/components/ui";
import { fmtDateTimeShort } from "@/lib/dushanbe-date";

const fmt = (d: Date) => fmtDateTimeShort(d);

export default async function SurveysPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "satisfaction.manage")) redirect("/");

  const now = new Date();
  const surveys = await db.survey.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true, responses: true } } },
  });

  const statusOf = (s: (typeof surveys)[number]) =>
    !s.isActive
      ? { label: "выключен", tone: "muted" as const }
      : s.startsAt && s.startsAt > now
        ? { label: `с ${fmt(s.startsAt)}`, tone: "brand" as const }
        : s.endsAt && s.endsAt <= now
          ? { label: "завершён", tone: "neutral" as const }
          : { label: "идёт", tone: "success" as const };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Опросы"
        description="Опрос появляется окном, когда сотрудник заходит на сайт. Каждый проходит его один раз и получает Farovon Coins."
        action={
          <Link href="/admin/surveys/new" className={buttonClass({ size: "sm" })}>
            Новый опрос
          </Link>
        }
      />
      {surveys.length === 0 ? (
        <EmptyState
          action={
            <Link href="/admin/surveys/new" className={buttonClass({ size: "sm" })}>
              Создать первый опрос
            </Link>
          }
        >
          Опросов пока нет.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>№</th>
                <th>Опрос</th>
                <th>Статус</th>
                <th>Вопросов</th>
                <th>Награда</th>
                <th>Прошли</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((s) => {
                const st = statusOf(s);
                return (
                  <tr key={s.id}>
                    <td>
                      <RowId id={s.id} seq={s.seq} />
                    </td>
                    <td>
                      <Link href={`/admin/surveys/${s.id}`} className="font-semibold text-ink hover:text-primary">
                        {s.title}
                      </Link>
                    </td>
                    <td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td data-numeric>{s._count.questions}</td>
                    <td data-numeric>{s.coins > 0 ? `${s.coins} мон.` : "—"}</td>
                    <td data-numeric>{s._count.responses}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
