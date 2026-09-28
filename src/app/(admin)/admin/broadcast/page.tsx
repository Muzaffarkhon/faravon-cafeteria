import { redirect } from "next/navigation";
import { MessagesTabs } from "@/components/messages-tabs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/shared";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from "@/components/ui";
import { PREVIEW_LIMIT, parseFilters, resolveAudience } from "@/lib/broadcast-audience";
import { SEGMENTS, CARD_AUDIENCES, CARD_AUDIENCE_LABELS } from "@/lib/broadcast-segments";
import Link from "next/link";
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
  const byCard = filters.segment === "BY_CARD";

  const [periods, cards, campaigns] = await Promise.all([
    db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true }, take: 24 }),
    byCard
      ? db.benefitCard.findMany({ where: { archivedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true } })
      : Promise.resolve([]),
    db.broadcastCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { recipients: { select: { answer: true } } },
    }),
  ]);
  // По умолчанию — открытый период: рассылка «пойдёте ли» почти всегда про текущий.
  if (byCard && !filters.periodId) filters.periodId = periods.find((p) => p.status === "OPEN")?.id ?? periods[0]?.id ?? "";

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
  const recipients = audience.users.length + audience.guests.length;

  return (
    <div className="space-y-5">
      <MessagesTabs active="broadcast" />
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t("broadcast.title")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("broadcast.hint")}</p>
      </div>

      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("broadcast.to")} htmlFor="segment">
            <Select id="segment" name="segment" defaultValue={filters.segment}>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {t(`broadcast.segment.${s}` as const)}
                </option>
              ))}
            </Select>
          </Field>
          {byCard && (
            <>
              <Field label="Льгота" htmlFor="cardId">
                <Select id="cardId" name="cardId" defaultValue={filters.cardId} required>
                  <option value="" disabled>
                    Выберите льготу
                  </option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Период" htmlFor="periodId">
                <Select id="periodId" name="periodId" defaultValue={filters.periodId}>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Кому" htmlFor="cardAudience">
                <Select id="cardAudience" name="cardAudience" defaultValue={filters.cardAudience}>
                  {CARD_AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {CARD_AUDIENCE_LABELS[a]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {!guests && (
            <>
              <Field label={t("broadcast.department")} htmlFor="department">
                <Select id="department" name="department" defaultValue={filters.department}>
                  <option value="">{t("broadcast.allDepartments")}</option>
                  {departments.map((d) => (
                    <option key={d.department} value={d.department}>
                      {d.department}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("broadcast.position")} htmlFor="position">
                <Select id="position" name="position" defaultValue={filters.position}>
                  <option value="">{t("broadcast.allPositions")}</option>
                  {positions.map((p) => (
                    <option key={p.position} value={p.position}>
                      {p.position}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("broadcast.search")} htmlFor="q">
                <Input
                  id="q"
                  name="q"
                  defaultValue={filters.q}
                  placeholder={t("broadcast.searchPlaceholder")}
                  autoComplete="off"
                />
              </Field>
            </>
          )}
          <div className="flex items-end">
            <Button type="submit">{t("broadcast.showRecipients")}</Button>
          </div>
        </form>
        {guests && <p className="mt-3 text-sm text-ink-muted">{t("broadcast.guestsNote")}</p>}
        {filters.segment !== "BY_CARD" && (
          <p className="mt-3 text-xs text-ink-subtle">Чтобы написать выбравшим определённую льготу — выберите «{t("broadcast.segment.BY_CARD")}» и нажмите «{t("broadcast.showRecipients")}».</p>
        )}
      </Card>

      {audience.error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {audience.error}
        </p>
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="brand">
              {t("broadcast.found")}: {audience.total}
            </Badge>
            <Badge tone="success">
              {t("broadcast.willReceive")}: {recipients}
            </Badge>
            {audience.withoutTelegram > 0 && (
              <Badge tone="warning">
                {t("broadcast.noTelegram")}: {audience.withoutTelegram}
              </Badge>
            )}
            {recipients > 0 && (
              <Badge tone="neutral">
                {t("broadcast.byLanguage")}: {LOCALES.map((l) => `${LOCALE_LABELS[l]} ${audience.byLocale[l]}`).join(" · ")}
              </Badge>
            )}
          </div>
          {audience.rows.length === 0 ? (
            <EmptyState>{t("broadcast.nobody")}</EmptyState>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <th>{t("broadcast.colWho")}</th>
                    <th>{t("broadcast.colUnit")}</th>
                    <th>{t("broadcast.colTelegram")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audience.rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.name}</td>
                      <td>{r.sub}</td>
                      <td>{r.telegram ? t("broadcast.yes") : t("broadcast.no")}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {audience.total > PREVIEW_LIMIT && (
                <p className="mt-2 text-xs text-ink-subtle">
                  {t("broadcast.shownFirst")} {PREVIEW_LIMIT} {t("broadcast.of")} {audience.total}.
                </p>
              )}
            </>
          )}
        </Card>
      )}

      <BroadcastForm filters={filters} recipients={recipients} byLocale={audience.byLocale} locale={locale} />

      {campaigns.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-ink">Ответы на рассылки с подтверждением</h2>
          <Card className="overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Рассылка</th>
                  <th>Да</th>
                  <th>Нет</th>
                  <th>Не ответили</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const yes = c.recipients.filter((r) => r.answer === "YES").length;
                  const no = c.recipients.filter((r) => r.answer === "NO").length;
                  return (
                    <tr key={c.id}>
                      <td data-numeric className="text-ink-muted">
                        {c.createdAt.toLocaleString("ru-RU", { timeZone: "Asia/Dushanbe", dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="text-ink">{c.title}</td>
                      <td data-numeric className="text-success-strong">{yes}</td>
                      <td data-numeric className="text-danger">{no}</td>
                      <td data-numeric>{c.recipients.length - yes - no}</td>
                      <td className="text-right">
                        <Link href={`/admin/broadcast/${c.id}`} className="text-sm font-semibold text-primary hover:underline">
                          Подробнее
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </section>
      )}
    </div>
  );
}
