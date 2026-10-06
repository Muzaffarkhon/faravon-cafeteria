import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale, getTranslator } from "@/lib/i18n";
import { localize } from "@/lib/localize";
import { safeImageSrc } from "@/lib/safe-url";
import { getCoinBalance } from "@/lib/coin-wallet";
import { getGamificationEnabled } from "@/lib/gamification-settings";
import { getDailyBonusStatus } from "@/lib/daily-bonus";
import { getWheelState, listWheelSpins } from "@/lib/wheel";
import { Card, EmptyState } from "@/components/ui";
import { CoinBalance } from "../_coin-balance";
import { GiftWheel, type WheelSectorView } from "./_gift-wheel";

export const dynamic = "force-dynamic";

export default async function GiftWheelPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.employee) redirect("/");
  const employeeId = session.employee.id;

  const [state, balance, spins, dailyBonus, gamificationOn, t, locale] = await Promise.all([
    getWheelState(employeeId),
    getCoinBalance(employeeId),
    listWheelSpins(employeeId, 20),
    getDailyBonusStatus(employeeId),
    getGamificationEnabled(),
    getTranslator(),
    getLocale(),
  ]);
  if (!state.enabled) redirect("/");
  const backHref = gamificationOn ? "/gamification" : "/";

  const sectors: WheelSectorView[] = state.sectors.map((s) => {
    const card = s.kind === "COUPON" ? s.card : null;
    const partner = card?.partner ?? null;
    const cardTitle = card ? localize(card.title, card.translations, locale, "title") : null;
    return {
      id: s.id,
      kind: s.kind,
      label: s.label?.trim() || (s.kind === "COINS" ? `+${s.coins ?? 0}` : (cardTitle ?? "")),
      coins: s.coins,
      imageUrl: safeImageSrc(card?.imageUrl) ?? null,
      block: s.block,
      card: card
        ? {
            title: cardTitle!,
            description: localize(card.description, card.translations, locale, "description"),
            condition: localize(card.condition, card.translations, locale, "condition"),
            partnerName: partner ? localize(partner.name, partner.translations, locale, "name") : null,
            address: partner?.address ?? null,
            workingHours: partner?.workingHours ?? null,
            discountType: partner ? localize(partner.discountType, partner.translations, locale, "discountType") : null,
            terms: partner ? localize(partner.terms, partner.translations, locale, "terms") : null,
            contactPerson: partner ? localize(partner.contactPerson, partner.translations, locale, "contactPerson") : null,
            contacts: partner?.contacts ?? null,
          }
        : null,
    };
  });
  const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Dushanbe" });
  const coinUnit = t("gamification.coinUnit");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="relative flex items-center justify-center py-1">
        <Link
          href={backHref}
          aria-label={t("wheel.back")}
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm hover:bg-surface-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="font-display text-lg font-bold text-ink sm:text-xl">{t("wheel.title")}</h1>
      </header>

      <GiftWheel
        sectors={sectors}
        cost={state.cost}
        balance={balance}
        spunToday={state.spunToday}
        spinsTodayCount={state.spinsTodayCount}
        dailyLimit={state.dailyLimit}
        spinsRemaining={state.spinsRemaining}
        bonusSpins={state.bonusSpins}
        locale={locale}
        coinUnit={coinUnit}
      />

      <Card className="divide-y divide-line-subtle overflow-hidden">
        {gamificationOn && (
          <div className="flex items-center justify-between gap-3 p-4">
            <CoinBalance balance={balance} coinUnit={coinUnit} />
          </div>
        )}
        {gamificationOn && dailyBonus.available && (
          <Link href="/gamification" className="flex items-center justify-between gap-3 p-4 hover:bg-surface-muted">
            <span>
              <span className="block font-semibold text-ink">{t("gamification.dailyBonusTitle")}</span>
              <span className="block text-sm text-ink-muted">
                {dailyBonus.claimedToday ? t("gamification.dailyBonusClaimed") : `+${dailyBonus.amount} ${coinUnit}`}
              </span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ink-subtle" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
        )}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
            <span className="font-semibold text-ink">{t("wheel.history")}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ink-subtle transition-transform group-open:rotate-90" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </summary>
          <div className="px-4 pb-4">
            {spins.length === 0 ? (
              <EmptyState>{t("wheel.historyEmpty")}</EmptyState>
            ) : (
              <ul className="space-y-2">
                {spins.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {s.kind === "NOTHING" ? t("wheel.nothing") : s.kind === "COINS" ? `+${s.coins} ${coinUnit}` : s.prizeLabel}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-subtle">{fmt.format(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </Card>
    </div>
  );
}
