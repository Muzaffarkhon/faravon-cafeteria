import { redirect } from "next/navigation";
import { MessagesTabs } from "@/components/messages-tabs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from "@/components/ui";
import { PREVIEW_LIMIT, parseFilters, resolveAudience } from "@/lib/broadcast-audience";
import { SEGMENTS, SEGMENT_LABELS } from "@/lib/broadcast-segments";
import { BroadcastForm } from "./_form";

// Рассылка «гостям» идёт напрямую (до ~600 сообщений, ~25 с) — запас по времени функции.
export const maxDuration = 60;

export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const filters = parseFilters(await searchParams);
  const guests = filters.segment === "NOT_REGISTERED";

  const [departments, positions, audience] = await Promise.all([
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { position: true },
      distinct: ["position"],
      orderBy: { position: "asc" },
    }),
    resolveAudience(filters),
  ]);
  const recipients = audience.userIds.length + audience.guestChatIds.length;

  return (
    <div className="space-y-5">
      <MessagesTabs active="broadcast" />
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t("broadcast.title")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("broadcast.hint")}</p>
      </div>

      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Кому" htmlFor="segment">
            <Select id="segment" name="segment" defaultValue={filters.segment}>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {SEGMENT_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          {!guests && (
            <>
              <Field label="Отдел" htmlFor="department">
                <Select id="department" name="department" defaultValue={filters.department}>
                  <option value="">Все отделы</option>
                  {departments.map((d) => (
                    <option key={d.department} value={d.department}>
                      {d.department}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Должность" htmlFor="position">
                <Select id="position" name="position" defaultValue={filters.position}>
                  <option value="">Все должности</option>
                  {positions.map((p) => (
                    <option key={p.position} value={p.position}>
                      {p.position}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Поиск по ФИО или телефону" htmlFor="q">
                <Input id="q" name="q" defaultValue={filters.q} placeholder="Иванов или 92 630..." autoComplete="off" />
              </Field>
            </>
          )}
          <div className="flex items-end">
            <Button type="submit">Показать получателей</Button>
          </div>
        </form>
        {guests && (
          <p className="mt-3 text-sm text-ink-muted">
            Это люди, запустившие бота, но не привязавшие номер. Отдела и ФИО у них нет, поэтому фильтры недоступны.
            Список копится с момента выхода этой функции; раньше нажавшие «Старт» известны только тем, кто пытался
            привязаться или писал в поддержку.
          </p>
        )}
      </Card>

      {audience.error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {audience.error}
        </p>
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="brand">Найдено: {audience.total}</Badge>
            <Badge tone="success">Получат сообщение: {recipients}</Badge>
            {audience.withoutTelegram > 0 && (
              <Badge tone="warning">Без Telegram (не получат): {audience.withoutTelegram}</Badge>
            )}
          </div>
          {audience.rows.length === 0 ? (
            <EmptyState>Никого не найдено</EmptyState>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <th>Кто</th>
                    <th>Подразделение</th>
                    <th>Telegram</th>
                  </tr>
                </thead>
                <tbody>
                  {audience.rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.name}</td>
                      <td>{r.sub}</td>
                      <td>{r.telegram ? "есть" : "нет"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {audience.total > PREVIEW_LIMIT && (
                <p className="mt-2 text-xs text-ink-subtle">Показаны первые {PREVIEW_LIMIT} из {audience.total}.</p>
              )}
            </>
          )}
        </Card>
      )}

      <BroadcastForm filters={filters} recipients={recipients} locale={locale} />
    </div>
  );
}
