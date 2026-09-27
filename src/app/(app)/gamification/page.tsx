import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocale, getTranslator } from "@/lib/i18n";
import { localize } from "@/lib/localize";
import { Badge, Card, EmptyState, SectionTitle, Table, Select, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ActionForm } from "@/components/action-form";
import { listAvailableTasksForEmployee, listEmployeeTasks, getRejoinCooldownRemaining } from "@/lib/gamification-tasks";
import { getCoinBalance, listCoinEntries } from "@/lib/coin-wallet";
import { getGamificationEnabled } from "@/lib/gamification-settings";
import { getDailyBonusStatus } from "@/lib/daily-bonus";
import { resolveSelectionContext, getApplicationWithItems } from "@/lib/selection";
import { safeImageSrc } from "@/lib/safe-url";
import { joinTaskAction, buyWithCoinsAction } from "./_actions";
import { CoinBalance } from "./_coin-balance";
import { CancelTaskButton } from "./_cancel-task-button";
import { DailyBonusCard } from "./_daily-bonus";
import { CardDetailsButton } from "../_components/card-details";

export const dynamic = "force-dynamic";

export default async function GamificationPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");
  if (!(await getGamificationEnabled())) redirect("/");
  const t = await getTranslator();
  const locale = await getLocale();
  const employeeId = session.employee.id;

  const [available, mine, balance, entries, shopCardsRaw, dailyBonus, cooldownRemaining] = await Promise.all([
    listAvailableTasksForEmployee(employeeId),
    listEmployeeTasks(employeeId),
    getCoinBalance(employeeId),
    listCoinEntries(employeeId, 10),
    db.benefitCard.findMany({
      where: { coinPrice: { not: null }, isActive: true, status: "PUBLISHED", archivedAt: null },
      orderBy: { coinPrice: "asc" },
      include: { partner: true },
    }),
    getDailyBonusStatus(employeeId),
    getRejoinCooldownRemaining(employeeId),
  ]);

  const shopCards = shopCardsRaw.map((c) => ({
    ...c,
    title: localize(c.title, c.translations, locale, "title"),
    description: localize(c.description, c.translations, locale, "description"),
    condition: localize(c.condition, c.translations, locale, "condition"),
    partner: c.partner
      ? {
          ...c.partner,
          name: localize(c.partner.name, c.partner.translations, locale, "name"),
          discountType: localize(c.partner.discountType, c.partner.translations, locale, "discountType"),
          terms: localize(c.partner.terms, c.partner.translations, locale, "terms"),
          contactPerson: localize(c.partner.contactPerson, c.partner.translations, locale, "contactPerson"),
        }
      : c.partner,
  }));

  // Карточки, уже выбранные обычным способом (не за монеты) в целевом периоде —
  // fulfillRedemption всё равно бы их отклонил (unique [applicationId, cardId]),
  // но раньше это выяснялось только ПОСЛЕ списания монет и отката (redemption
  // сразу уходил в REJECTED). Показываем это заранее, вместо кнопки.
  const targetPeriod = (await resolveSelectionContext()).targetPeriod;
  const normallySelectedCardIds = new Set<string>();
  if (targetPeriod) {
    const app = await getApplicationWithItems(employeeId, targetPeriod.id);
    for (const item of app?.items ?? []) {
      if (!item.viaCoins && !["CANCELLED", "REJECTED"].includes(item.status)) {
        normallySelectedCardIds.add(item.cardId);
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-[20px] bg-primary p-5 text-on-brand sm:rounded-[28px] sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-lg font-bold text-on-brand sm:text-2xl">{t("gamification.title")}</h1>
          <div className="shrink-0">
            <CoinBalance balance={balance} coinUnit={t("gamification.coinUnit")} />
          </div>
        </div>
        {dailyBonus.available && (
          <DailyBonusCard
            amount={dailyBonus.amount}
            claimedToday={dailyBonus.claimedToday}
            coinUnit={t("gamification.coinUnit")}
            labels={{
              title: t("gamification.dailyBonusTitle"),
              claim: t("gamification.dailyBonusClaim"),
              claimed: t("gamification.dailyBonusClaimed"),
            }}
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={available.length}>{t("gamification.availableTasks")}</SectionTitle>
        {cooldownRemaining != null && (
          <p className="rounded-[12px] bg-warning/10 px-3 py-2 text-xs font-semibold text-warning-strong">
            {t("gamification.cooldownNotice")} {Math.ceil(cooldownRemaining / 60_000)} {t("gamification.cooldownMinutes")}
          </p>
        )}
        {available.length === 0 ? (
          <EmptyState>{t("gamification.noAvailableTasks")}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {available.map((task) => (
              <Card key={task.id} className="space-y-2.5 p-4">
                <p className="font-semibold text-ink">{task.title}</p>
                <p className="text-sm text-ink-muted">{task.description}</p>
                <p className="text-sm font-bold text-primary-strong">
                  +{task.coinReward} {t("gamification.coinUnit")}
                </p>
                <ActionForm action={joinTaskAction.bind(null, task.id)} className="space-y-2.5">
                  {shopCards.length > 0 && (
                    <label className="block text-xs text-ink-muted">
                      {t("gamification.prizeCardLabel")}
                      <Select name="prizeCardId" defaultValue="" className="mt-1">
                        <option value="">{t("gamification.prizeCardNone")}</option>
                        {shopCards.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.title} — {card.coinPrice} {t("gamification.coinUnit")}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  <SubmitButton variant="soft" size="sm" fullWidth>
                    {t("gamification.joinTask")}
                  </SubmitButton>
                </ActionForm>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={mine.length}>{t("gamification.myTasks")}</SectionTitle>
        {mine.length === 0 ? (
          <EmptyState>{t("gamification.noMyTasks")}</EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table stickyHeader>
              <thead>
                <tr>
                  <th>{t("gamification.colTask")}</th>
                  <th>{t("gamification.colStatus")}</th>
                  <th>{t("gamification.colProgress")}</th>
                  <th className="text-right">{t("gamification.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((et) => (
                  <tr key={et.id}>
                    <td className="text-ink">{et.task.title}</td>
                    <td>
                      <Badge tone={et.status === "COMPLETED" ? "success" : "neutral"}>{et.status}</Badge>
                    </td>
                    <td data-numeric>
                      {et.task.verification === "AUTO" && et.task.targetValue ? `${et.progressValue} / ${et.task.targetValue}` : "—"}
                    </td>
                    <td className="text-right">
                      {et.status === "IN_PROGRESS" && (
                        <CancelTaskButton employeeTaskId={et.id} taskTitle={et.task.title} locale={locale} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle className="text-lg" count={shopCards.length}>{t("gamification.shop")}</SectionTitle>
        {shopCards.length === 0 ? (
          <EmptyState>{t("gamification.shopEmpty")}</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shopCards.map((card) => {
              const price = card.coinPrice ?? 0;
              const alreadySelected = normallySelectedCardIds.has(card.id);
              const affordable = !alreadySelected && balance >= price;
              const missing = price - balance;
              const image = safeImageSrc(card.imageUrl);
              return (
                <Card key={card.id} className={cx("flex flex-col overflow-hidden", !affordable && "opacity-80")}>
                  <div className="relative aspect-square w-full bg-surface-muted">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-subtle">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="m21 15-5-5-9 9" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-bold text-primary-strong shadow-sm backdrop-blur-sm">
                      <span aria-hidden="true">🪙</span>
                      {price}
                    </div>
                    {!affordable && (
                      <div className="absolute inset-0 flex items-center justify-center bg-ink/10 backdrop-blur-[1px]">
                        <span className="rounded-full bg-surface/95 p-2 text-ink-muted shadow-sm" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="5" y="11" width="14" height="9" rx="2" />
                            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                          </svg>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-ink">{card.title}</p>
                    <CardDetailsButton
                      card={{
                        title: card.title,
                        description: card.description,
                        condition: card.condition,
                        partnerName: card.partner?.name ?? null,
                        address: card.partner?.address ?? null,
                        workingHours: card.partner?.workingHours ?? null,
                        discountType: card.partner?.discountType ?? null,
                        terms: card.partner?.terms ?? null,
                        contactPerson: card.partner?.contactPerson ?? null,
                        contacts: card.partner?.contacts ?? null,
                      }}
                      locale={locale}
                    />
                    <div className="mt-auto">
                      {affordable ? (
                        <ActionForm action={buyWithCoinsAction.bind(null, card.id)}>
                          <SubmitButton variant="primary" size="sm" fullWidth>
                            {card.coinRedemptionMode === "REQUEST" ? t("gamification.buyRequest") : t("gamification.buyInstant")}
                          </SubmitButton>
                        </ActionForm>
                      ) : alreadySelected ? (
                        <p className="rounded-[10px] bg-surface-muted py-2 text-center text-xs font-semibold text-ink-muted">
                          {t("gamification.alreadySelectedNormally")}
                        </p>
                      ) : (
                        <p className="rounded-[10px] bg-surface-muted py-2 text-center text-xs font-semibold text-ink-muted">
                          {t("gamification.notEnough")} {missing} {t("gamification.coinUnit")}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-bold text-ink [&::-webkit-details-marker]:hidden">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="shrink-0 transition-transform group-open:rotate-90"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
            {t("gamification.history")}
          </summary>
          <div className="mt-3">
            {entries.length === 0 ? (
              <EmptyState>{t("gamification.historyEmpty")}</EmptyState>
            ) : (
              <Card className="overflow-hidden">
                <Table stickyHeader>
                  <thead>
                    <tr>
                      <th>{t("gamification.colWhen")}</th>
                      <th>{t("gamification.colReason")}</th>
                      <th>{t("gamification.colAmount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td className="text-ink-muted" data-numeric>
                          {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Dushanbe" }).format(e.createdAt)}
                        </td>
                        <td>{e.reason}</td>
                        <td data-numeric className={e.kind === "SPENT" ? "text-danger" : "text-success"}>
                          {e.kind === "SPENT" ? "-" : "+"}
                          {e.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
