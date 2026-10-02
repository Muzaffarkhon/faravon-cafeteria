import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { loadCampaignReport, ANSWER_LABEL, DELIVERY_LABEL, fmtDushanbe, type Delivery } from "@/lib/broadcast-report";
import { SEGMENT_LABELS, type Segment } from "@/lib/broadcast-segments";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/shared";
import { Badge, Button, Card, EmptyState, Table, buttonClass, cx, type BadgeTone } from "@/components/ui";
import { openChatWithUser } from "../../support/actions";
import { AnswersBar, followUpHref } from "../_parts";
import { CancelScheduledButton } from "../_cancel-button";

const FILTERS = ["ALL", "YES", "NO", "NONE", "UNDELIVERED"] as const;
type RowFilter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<RowFilter, string> = {
  ALL: "Все",
  YES: "Да",
  NO: "Нет",
  NONE: "Не ответили",
  UNDELIVERED: "Не дошло",
};
const DELIVERY_TONE: Record<Delivery, BadgeTone> = {
  DELIVERED: "success",
  PENDING: "neutral",
  BLOCKED: "warning",
  FAILED: "warning",
  UNKNOWN: "muted",
};
const undelivered = (d: Delivery) => d === "BLOCKED" || d === "FAILED";

export default async function BroadcastCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ answer?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const canChat = can(session.roles, "support.manage");
  const { id } = await params;
  const raw = (await searchParams).answer;

  const report = await loadCampaignReport(id);
  if (!report) notFound();
  const { campaign, rows } = report;
  const confirm = campaign.askConfirm;
  const available = FILTERS.filter((f) => confirm || f === "ALL" || f === "UNDELIVERED");
  const filter: RowFilter = (available as readonly string[]).includes(raw ?? "") ? (raw as RowFilter) : "ALL";

  const yes = rows.filter((r) => r.answer === "YES").length;
  const no = rows.filter((r) => r.answer === "NO").length;
  const none = rows.length - yes - no;
  const delivered = rows.filter((r) => r.delivery === "DELIVERED").length;
  const notDelivered = rows.filter((r) => undelivered(r.delivery)).length;
  const counts: Record<RowFilter, number> = { ALL: rows.length, YES: yes, NO: no, NONE: none, UNDELIVERED: notDelivered };
  const shown = rows.filter((r) =>
    filter === "ALL"
      ? true
      : filter === "UNDELIVERED"
        ? undelivered(r.delivery)
        : filter === "NONE"
          ? !r.answer
          : r.answer === filter,
  );
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0);
  const texts = campaign.texts as Partial<Record<Locale, string>> | null;
  const guests = campaign.segment === "NOT_REGISTERED";
  const scheduled = campaign.status === "SCHEDULED";

  return (
    <div className="space-y-5">
      <Link href="/admin/broadcast/history" className="text-sm font-semibold text-primary hover:underline">
        ← История и ответы
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-display text-2xl font-bold text-ink">{campaign.title}</h1>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            <span>Рассылка #{campaign.seq}</span>
            {scheduled ? (
              <Badge tone="brand">запланирована на {campaign.scheduledAt ? fmtDushanbe(campaign.scheduledAt) : "—"}</Badge>
            ) : campaign.status === "CANCELLED" ? (
              <Badge tone="muted">отменена</Badge>
            ) : (
              <span>· отправлена {fmtDushanbe(campaign.sentAt ?? campaign.createdAt)}</span>
            )}
            {campaign.segment && <span>· {SEGMENT_LABELS[campaign.segment as Segment]}</span>}
          </p>
        </div>
        {scheduled ? (
          <CancelScheduledButton id={campaign.id} title={campaign.title} />
        ) : (
          rows.length > 0 && (
            <a
              href={`/admin/broadcast/${campaign.id}/export${filter === "ALL" ? "" : `?answer=${filter}`}`}
              className={buttonClass({ size: "sm", variant: "secondary" })}
            >
              Выгрузить в Excel{filter === "ALL" ? "" : ` (${FILTER_LABEL[filter]})`}
            </a>
          )
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="space-y-5">
          {!scheduled && (
            <Card className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="font-display text-3xl font-bold tabular-nums text-ink">
                    {guests ? campaign.guestSent : delivered}
                  </p>
                  <p className="text-xs text-ink-muted">
                    доставлено из {guests ? campaign.guestSent + campaign.guestFailed : rows.length}
                  </p>
                </div>
                <div>
                  <p className={cx("font-display text-3xl font-bold tabular-nums", "text-warning-strong")}>
                    {guests ? campaign.guestFailed : notDelivered}
                  </p>
                  <p className="text-xs text-ink-muted">не дошло (заблокировали бота и т. п.)</p>
                </div>
              </div>
              {confirm && rows.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-3 border-t border-line-subtle pt-4 text-center">
                    {(
                      [
                        ["YES", yes, "text-success-strong"],
                        ["NO", no, "text-warning-strong"],
                        ["NONE", none, "text-ink"],
                      ] as const
                    ).map(([k, n, tone]) => (
                      <div key={k}>
                        <p className={cx("font-display text-3xl font-bold tabular-nums", tone)}>{n}</p>
                        <p className="text-xs text-ink-muted">
                          {FILTER_LABEL[k]} · {pct(n)}%
                        </p>
                      </div>
                    ))}
                  </div>
                  <AnswersBar yes={yes} no={no} none={none} className="h-2.5" />
                </>
              )}
            </Card>
          )}

          {!scheduled && rows.length > 0 && (
            <Card className="space-y-3 p-5">
              <h2 className="font-bold text-ink">Написать повторно</h2>
              <p className="text-xs text-ink-muted">Откроется новая рассылка, где получателями уже выбраны только эти люди.</p>
              <div className="flex flex-wrap gap-2">
                {confirm ? (
                  (["NONE", "YES", "NO"] as const).map((a) =>
                    counts[a] > 0 ? (
                      <Link key={a} href={followUpHref(campaign.id, a)} className={buttonClass({ size: "sm", variant: "secondary" })}>
                        {a === "NONE" ? "Напомнить промолчавшим" : `Ответившим «${FILTER_LABEL[a]}»`} ({counts[a]})
                      </Link>
                    ) : null,
                  )
                ) : (
                  <Link
                    href={`/admin/broadcast?segment=BY_CAMPAIGN&campaignId=${campaign.id}&campaignAnswer=ALL`}
                    className={buttonClass({ size: "sm", variant: "secondary" })}
                  >
                    Тем же получателям ({rows.length})
                  </Link>
                )}
              </div>
            </Card>
          )}

          <Card className="space-y-3 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Текст рассылки</h2>
            {LOCALES.map((l) => {
              const text = l === "ru" ? (texts?.ru ?? campaign.text) : texts?.[l];
              return text ? (
                <details key={l} open={l === "ru"}>
                  <summary className="cursor-pointer text-sm font-semibold text-ink">{LOCALE_LABELS[l]}</summary>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink">{text}</p>
                </details>
              ) : null;
            })}
            {(campaign.askConfirm || campaign.couponHint) && (
              <p className="text-xs text-ink-muted">
                {[campaign.askConfirm && "С кнопками «Да / Нет»", campaign.couponHint && "с напоминанием о купоне"]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          {scheduled ? (
            <EmptyState>Получатели соберутся по фильтру в момент отправки.</EmptyState>
          ) : guests ? (
            <EmptyState>Гостям бота пишем напрямую — поимённого списка нет, только итог доставки.</EmptyState>
          ) : (
            <>
              <nav aria-label="Фильтр получателей" className="flex flex-wrap gap-1.5">
                {available.map((f) => (
                  <Link
                    key={f}
                    href={f === "ALL" ? `/admin/broadcast/${campaign.id}` : `/admin/broadcast/${campaign.id}?answer=${f}`}
                    scroll={false}
                    aria-current={f === filter ? "page" : undefined}
                    className={cx(
                      "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                      f === filter ? "bg-primary text-on-brand" : "bg-surface-muted text-ink-muted hover:text-ink",
                    )}
                  >
                    {FILTER_LABEL[f]} <span className="font-normal tabular-nums opacity-75">{counts[f]}</span>
                  </Link>
                ))}
              </nav>

              {shown.length === 0 ? (
                <EmptyState>Таких получателей нет.</EmptyState>
              ) : (
                <Card className="overflow-hidden">
                  <Table stickyHeader>
                    <thead>
                      <tr>
                        <th>Сотрудник</th>
                        <th>Доставка</th>
                        {confirm && <th>Ответ</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.id}>
                          <td className="min-w-[12rem]">
                            <span className="text-ink">{r.fullName}</span>
                            <span className="block text-xs text-ink-subtle">
                              {[r.department, r.position].filter(Boolean).join(" · ")}
                            </span>
                          </td>
                          <td>
                            <Badge tone={DELIVERY_TONE[r.delivery]}>{DELIVERY_LABEL[r.delivery]}</Badge>
                          </td>
                          {confirm && (
                            <td className="min-w-[10rem]">
                              {r.answer ? (
                                <>
                                  <Badge tone={r.answer === "YES" ? "success" : "warning"}>{ANSWER_LABEL[r.answer]}</Badge>
                                  <span className="ml-1.5 text-xs text-ink-subtle tabular-nums">
                                    {r.answeredAt ? fmtDushanbe(r.answeredAt) : ""}
                                  </span>
                                  {r.reason && (
                                    <span className="mt-1 block text-xs text-ink-muted" title="Причина — первое сообщение после ответа">
                                      «{r.reason.length > 140 ? `${r.reason.slice(0, 140)}…` : r.reason}»
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-ink-subtle">—</span>
                              )}
                            </td>
                          )}
                          <td className="text-right">
                            {canChat && r.hasTelegram && (
                              <form action={openChatWithUser.bind(null, r.userId)}>
                                <Button type="submit" size="sm" variant={r.threadId ? "secondary" : "ghost"}>
                                  {r.threadId ? "Чат" : "Написать"}
                                </Button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
