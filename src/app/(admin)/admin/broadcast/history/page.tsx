import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { MessagesTabs } from "@/components/messages-tabs";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getTranslator } from "@/lib/i18n";
import { Badge, Card, EmptyState, PageHeader, RowId, Table } from "@/components/ui";
import { fmtDushanbe, loadCampaignList } from "@/lib/broadcast-report";
import { dispatchDueBroadcasts } from "@/lib/broadcast-send";
import { SEGMENT_LABELS, type Segment } from "@/lib/broadcast-segments";
import { AnswersBar, BroadcastSubnav, followUpHref } from "../_parts";
import { CancelScheduledButton } from "../_cancel-button";

// after() может отправить просроченную отложенную рассылку (гостям — напрямую, ~25 с).
export const maxDuration = 60;

export default async function BroadcastHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const t = await getTranslator();
  // Подстраховка крона: просроченная отложенная рассылка уйдёт, как только кто-то откроет историю.
  after(() => dispatchDueBroadcasts());
  const campaigns = await loadCampaignList();
  const scheduled = campaigns.filter((c) => c.status === "SCHEDULED");
  const done = campaigns.filter((c) => c.status !== "SCHEDULED");

  return (
    <div className="space-y-5">
      <MessagesTabs active="broadcast" />
      <PageHeader title={t("broadcast.title")} description={t("broadcast.hint")} />
      <BroadcastSubnav active="history" historyCount={campaigns.length} />

      {scheduled.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-ink">Запланированы</h2>
          <Card className="divide-y divide-line-subtle">
            {scheduled.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <RowId id={c.id} seq={c.seq} />
                <Badge tone="brand">{c.scheduledAt ? fmtDushanbe(c.scheduledAt) : "—"}</Badge>
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/broadcast/${c.id}`} className="font-semibold text-ink hover:text-primary">
                    {c.title}
                  </Link>
                  <span className="block text-xs text-ink-subtle">
                    {SEGMENT_LABELS[c.segment as Segment] ?? ""} · {c.author}
                  </span>
                </span>
                <CancelScheduledButton id={c.id} title={c.title} />
              </div>
            ))}
          </Card>
        </section>
      )}

      <p className="text-sm text-ink-muted">
        У рассылок с кнопками «Да / Нет» нажмите на число, чтобы написать только этим людям — например, напомнить
        промолчавшим или уточнить у ответивших «Нет».
      </p>

      {done.length === 0 ? (
        <EmptyState
          action={
            <Link href="/admin/broadcast" className="text-sm font-semibold text-primary hover:underline">
              Создать рассылку
            </Link>
          }
        >
          Рассылок пока не было.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <Table stickyHeader>
            <thead>
              <tr>
                <th>№</th>
                <th>Когда</th>
                <th>Рассылка</th>
                <th>Доставка</th>
                <th>Ответы</th>
                <th>Да</th>
                <th>Нет</th>
                <th>Молчат</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {done.map((c) => {
                const answered = c.total ? Math.round(((c.yes + c.no) / c.total) * 100) : 0;
                const count = (n: number, answer: "YES" | "NO" | "NONE", tone: string) =>
                  !c.askConfirm ? (
                    <span className="text-ink-subtle">—</span>
                  ) : n > 0 ? (
                    <Link
                      href={followUpHref(c.id, answer)}
                      title="Написать только им"
                      className={`font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid ${tone}`}
                    >
                      {n}
                    </Link>
                  ) : (
                    <span className="text-ink-subtle">0</span>
                  );
                return (
                  <tr key={c.id} className={c.status === "CANCELLED" ? "opacity-60" : undefined}>
                    <td>
                      <RowId id={c.id} seq={c.seq} />
                    </td>
                    <td data-numeric className="whitespace-nowrap text-ink-muted">
                      {fmtDushanbe(c.sentAt ?? c.createdAt)}
                    </td>
                    <td className="min-w-[14rem]">
                      <Link href={`/admin/broadcast/${c.id}`} className="font-semibold text-ink hover:text-primary">
                        {c.title}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
                        {c.status === "CANCELLED" && <Badge tone="muted">отменена</Badge>}
                        {c.status === "SENDING" && <Badge tone="warning">отправляется</Badge>}
                        {c.askConfirm && <Badge tone="brand">Да / Нет</Badge>}
                        {c.segment === "NOT_REGISTERED" && <Badge tone="accent">гости бота</Badge>}
                        <span>
                          {c.author} · {c.total} получ.
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      <span className="tabular-nums text-ink">
                        {c.delivered} / {c.total}
                      </span>
                      {(c.blocked > 0 || c.guestFailed > 0) && (
                        <span className="block text-xs text-warning-strong">
                          не дошло: {c.blocked + c.guestFailed}
                        </span>
                      )}
                    </td>
                    <td className="min-w-[8rem]">
                      {c.askConfirm ? (
                        <>
                          <AnswersBar yes={c.yes} no={c.no} none={c.none} />
                          <span className="mt-1 block text-xs text-ink-muted tabular-nums">{answered}% ответили</span>
                        </>
                      ) : (
                        <span className="text-xs text-ink-subtle">без кнопок</span>
                      )}
                    </td>
                    <td data-numeric>{count(c.yes, "YES", "text-success-strong")}</td>
                    <td data-numeric>{count(c.no, "NO", "text-warning-strong")}</td>
                    <td data-numeric>{count(c.none, "NONE", "text-ink")}</td>
                    <td className="text-right">
                      <Link
                        href={`/admin/broadcast/${c.id}`}
                        className="whitespace-nowrap text-sm font-semibold text-primary hover:underline"
                      >
                        Подробнее →
                      </Link>
                    </td>
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
