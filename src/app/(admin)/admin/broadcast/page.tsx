import { redirect } from "next/navigation";
import { after } from "next/server";
import { MessagesTabs } from "@/components/messages-tabs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/shared";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { PREVIEW_LIMIT, parseFilters, resolveAudience } from "@/lib/broadcast-audience";
import {
  SEGMENTS,
  CARD_AUDIENCES,
  CARD_AUDIENCE_LABELS,
  CAMPAIGN_ANSWERS,
  CAMPAIGN_ANSWER_LABELS,
} from "@/lib/broadcast-segments";
import { fmtDushanbe, loadCampaignList } from "@/lib/broadcast-report";
import { dispatchDueBroadcasts } from "@/lib/broadcast-send";
import { BroadcastForm } from "./_form";
import { FilterForm } from "./_filter-form";
import { BroadcastSubnav, StepHeader } from "./_parts";

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
  const byCampaign = filters.segment === "BY_CAMPAIGN";

  // Подстраховка крона: просроченная отложенная рассылка уйдёт, как только кто-то откроет раздел.
  after(() => dispatchDueBroadcasts());
  const [periods, cards, history] = await Promise.all([
    db.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true }, take: 24 }),
    byCard
      ? db.benefitCard.findMany({ where: { archivedAt: null }, orderBy: { title: "asc" }, select: { id: true, title: true } })
      : Promise.resolve([]),
    loadCampaignList(),
  ]);
  // По умолчанию — открытый период: рассылка «пойдёте ли» почти всегда про текущий.
  if (byCard && !filters.periodId) filters.periodId = periods.find((p) => p.status === "OPEN")?.id ?? periods[0]?.id ?? "";
  // Написать повторно можно только по уже отправленной рассылке сотрудникам (у гостей нет списка получателей).
  const campaigns = history.filter((c) => c.status === "SENT" && c.segment !== "NOT_REGISTERED" && c.total > 0);
  // По умолчанию — последняя рассылка: обычно добивают именно её.
  if (byCampaign && !filters.campaignId) filters.campaignId = campaigns[0]?.id ?? "";
  const campaign = campaigns.find((c) => c.id === filters.campaignId);
  // Без кнопок «Да / Нет» ответов нет — только «все получатели».
  if (byCampaign && campaign && !campaign.askConfirm) filters.campaignAnswer = "ALL";

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

  // Полное описание аудитории — для окна подтверждения: админ видит, кому именно уходит.
  const audienceLabel = [
    t(`broadcast.segment.${filters.segment}` as const),
    byCard && cards.find((c) => c.id === filters.cardId)?.title,
    byCard && periods.find((p) => p.id === filters.periodId)?.name,
    byCard && CARD_AUDIENCE_LABELS[filters.cardAudience],
    byCampaign && campaign && `«${campaign.title}» от ${fmtDushanbe(campaign.sentAt ?? campaign.createdAt)}`,
    byCampaign && CAMPAIGN_ANSWER_LABELS[filters.campaignAnswer],
    !guests && filters.department,
    !guests && filters.position,
    !guests && filters.q && `поиск «${filters.q}»`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <MessagesTabs active="broadcast" />
      <PageHeader title={t("broadcast.title")} description={t("broadcast.hint")} />
      <BroadcastSubnav active="new" historyCount={history.length} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <div className="space-y-5">
          <Card>
            <StepHeader n={1} title="Кому отправить" hint="Список обновляется сразу при выборе." />
            <FilterForm className="space-y-3 p-5">
              <Field label={t("broadcast.to")} htmlFor="segment">
                <Select id="segment" name="segment" defaultValue={filters.segment}>
                  {SEGMENTS.map((s) => (
                    <option key={s} value={s} disabled={s === "BY_CAMPAIGN" && campaigns.length === 0}>
                      {t(`broadcast.segment.${s}` as const)}
                    </option>
                  ))}
                </Select>
              </Field>

              {byCard && (
                <div className="grid gap-3 rounded-xl bg-surface-muted p-3 sm:grid-cols-2">
                  <Field label="Льгота" htmlFor="cardId" className="sm:col-span-2">
                    <Select id="cardId" name="cardId" defaultValue={filters.cardId}>
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
                  <Field label="Кому из выбравших" htmlFor="cardAudience">
                    <Select id="cardAudience" name="cardAudience" defaultValue={filters.cardAudience}>
                      {CARD_AUDIENCES.map((a) => (
                        <option key={a} value={a}>
                          {CARD_AUDIENCE_LABELS[a]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              {byCampaign && (
                <div className="grid gap-3 rounded-xl bg-surface-muted p-3">
                  <Field label="Рассылка" htmlFor="campaignId">
                    <Select id="campaignId" name="campaignId" defaultValue={filters.campaignId}>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.seq} · {c.title} · {fmtDushanbe(c.sentAt ?? c.createdAt)}
                          {c.askConfirm ? " · Да/Нет" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Кому из получателей" htmlFor="campaignAnswer">
                    <Select id="campaignAnswer" name="campaignAnswer" defaultValue={filters.campaignAnswer}>
                      {CAMPAIGN_ANSWERS.filter((a) => campaign?.askConfirm !== false || a === "ALL").map((a) => (
                        <option key={a} value={a}>
                          {CAMPAIGN_ANSWER_LABELS[a]}
                          {campaign && a !== "ANSWERED" && a !== "ALL"
                            ? ` — ${{ YES: campaign.yes, NO: campaign.no, NONE: campaign.none }[a]}`
                            : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              {guests ? (
                <p className="text-xs text-ink-muted">{t("broadcast.guestsNote")}</p>
              ) : (
                <details className="group" open={!!(filters.department || filters.position || filters.q)}>
                  <summary className="cursor-pointer text-sm font-semibold text-primary">
                    Уточнить: отдел, должность, поиск
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                    <Field label={t("broadcast.search")} htmlFor="q" className="sm:col-span-2">
                      <div className="flex gap-2">
                        <Input
                          id="q"
                          name="q"
                          type="search"
                          defaultValue={filters.q}
                          placeholder={t("broadcast.searchPlaceholder")}
                          autoComplete="off"
                        />
                        <Button type="submit" variant="secondary">
                          Найти
                        </Button>
                      </div>
                    </Field>
                  </div>
                </details>
              )}
            </FilterForm>
          </Card>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-subtle px-5 py-3.5">
              <h2 className="font-bold text-ink">Получатели</h2>
              {!audience.error && (
                <p className="text-sm text-ink-muted">
                  <b className="font-display text-2xl text-ink tabular-nums">{recipients}</b> получат
                  {audience.total !== recipients && <> из {audience.total} найденных</>}
                </p>
              )}
            </div>
            <div className="space-y-3 p-5">
              {audience.error ? (
                <p className="rounded-md bg-warning-soft px-3 py-2 text-sm font-medium text-warning-strong" role="status">
                  {audience.error}
                </p>
              ) : audience.rows.length === 0 ? (
                <EmptyState>{t("broadcast.nobody")}</EmptyState>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {audience.withoutTelegram > 0 && (
                      <Badge tone="warning">
                        {t("broadcast.noTelegram")}: {audience.withoutTelegram}
                      </Badge>
                    )}
                    {recipients > 0 &&
                      LOCALES.map((l) => (
                        <Badge key={l} tone={audience.byLocale[l] > 0 ? "neutral" : "muted"}>
                          {LOCALE_LABELS[l]}: {audience.byLocale[l]}
                        </Badge>
                      ))}
                  </div>
                  <details open={audience.total <= 15}>
                    <summary className="cursor-pointer text-sm font-semibold text-primary">
                      Список ({audience.total})
                    </summary>
                    <div className="mt-3 overflow-hidden rounded-xl border border-line-subtle">
                      <Table stickyHeader>
                        <thead>
                          <tr>
                            <th>{t("broadcast.colWho")}</th>
                            <th>{t("broadcast.colUnit")}</th>
                            <th>{t("broadcast.colTelegram")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audience.rows.map((r) => (
                            <tr key={r.key} className={r.telegram ? undefined : "text-ink-subtle"}>
                              <td>{r.name}</td>
                              <td className="text-ink-muted">{r.sub}</td>
                              <td>
                                {r.telegram ? (
                                  <Badge tone="success">{t("broadcast.yes")}</Badge>
                                ) : (
                                  <Badge tone="warning">{t("broadcast.no")}</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                    {audience.total > PREVIEW_LIMIT && (
                      <p className="mt-2 text-xs text-ink-subtle">
                        {t("broadcast.shownFirst")} {PREVIEW_LIMIT} {t("broadcast.of")} {audience.total}.
                      </p>
                    )}
                  </details>
                </>
              )}
            </div>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4">
          <StepHeader n={2} title="Сообщение" hint="Каждый получит текст на своём языке." />
          <div className="p-5">
            <BroadcastForm
              filters={filters}
              recipients={recipients}
              byLocale={audience.byLocale}
              locale={locale}
              audienceLabel={audienceLabel}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
