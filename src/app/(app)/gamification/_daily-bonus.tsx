"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { claimDailyBonusAction } from "./_actions";

/**
 * Кнопка сбора ежедневного бонуса. После успешной отправки сервер-экшен
 * делает revalidatePath("/gamification") — страница перечитывает
 * claimedToday из БД и передаёт сюда уже обновлённый пропс, поэтому кнопка
 * сама превращается в «получено» без отдельного клиентского состояния.
 * Появление новой монеты в балансе анимирует CoinBalance в шапке страницы.
 */
export function DailyBonusCard({
  amount,
  claimedToday,
  coinUnit,
  labels,
}: {
  amount: number;
  claimedToday: boolean;
  coinUnit: string;
  labels: { title: string; claim: string; claimed: string };
}) {
  const [state, formAction] = useActionState(claimDailyBonusAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-on-brand/10 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-on-brand">{labels.title}</p>
        <p className="text-xs text-on-brand/75">
          +{amount} {coinUnit}
        </p>
      </div>
      {claimedToday ? (
        <span className="rounded-full bg-on-brand/15 px-3.5 py-2 text-sm font-semibold text-on-brand/90">{labels.claimed}</span>
      ) : (
        <SubmitButton
          variant="secondary"
          size="md"
          className="!border-transparent !bg-on-brand !text-primary hover:!bg-on-brand/90"
        >
          {labels.claim}
        </SubmitButton>
      )}
      {state.error && <p className="w-full text-xs font-semibold text-on-brand">{state.error}</p>}
    </form>
  );
}
