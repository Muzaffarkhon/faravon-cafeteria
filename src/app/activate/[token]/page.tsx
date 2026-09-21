import type { Metadata } from "next";
import { BrandMark } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { Button } from "@/components/ui";
import { getTranslator } from "@/lib/i18n";
import { peekCashierLink } from "@/lib/cashier-link";
import { activateCashierPhone } from "./actions";

// Ссылка содержит секрет: не индексировать, не кэшировать.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslator();
  // Только проверка — токен тратится лишь по нажатию кнопки (иначе предпросмотр ссылки в мессенджере «съел» бы её).
  const link = await peekCashierLink(token);

  return (
    <main className="petal-field relative flex min-h-dvh flex-col overflow-hidden p-4">
      <PetalDrift />
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <div className="w-full max-w-[400px] overflow-hidden rounded-[28px] shadow-[0_20px_60px_oklch(0.22_0.03_30_/_0.15)]">
          <div className="bg-primary px-7 pb-8 pt-10 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface shadow-md">
              <BrandMark size={40} priority />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold text-on-brand">
              {link ? t("activate.title") : t("activate.invalidTitle")}
            </h1>
            {link?.partnerName && (
              <p className="mt-1.5 text-sm text-on-brand/80">
                {t("activate.forPartner")} «{link.partnerName}»
              </p>
            )}
          </div>
          <div className="space-y-4 bg-surface p-7 text-center">
            {link ? (
              <>
                <p className="text-sm leading-relaxed text-ink">{t("activate.text")}</p>
                <form action={activateCashierPhone.bind(null, token)}>
                  <Button type="submit" fullWidth size="lg">
                    {t("activate.button")}
                  </Button>
                </form>
                <p className="text-xs leading-relaxed text-ink-subtle">{t("activate.tip")}</p>
              </>
            ) : (
              <p className="text-sm leading-relaxed text-ink-muted">{t("activate.invalidText")}</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
