import { BrandMark } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { getTranslator } from "@/lib/i18n";
import { ChangePasswordForm } from "./_form";

export default async function ChangePasswordPage() {
  const t = await getTranslator();
  return (
    <main
      className="petal-field relative grid min-h-dvh place-items-center overflow-hidden p-4"
      style={{ paddingTop: "max(1rem, var(--tg-top))" }}
    >
      <PetalDrift />
      <div className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-[28px] shadow-[0_20px_60px_oklch(0.22_0.03_30_/_0.15)]">
        <div className="bg-primary px-7 pb-8 pt-10 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface shadow-md">
            <BrandMark size={40} priority />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-on-brand">{t("changePassword.title")}</h1>
          <p className="mt-1.5 text-sm text-on-brand/80">
            {t("changePassword.hint")}
          </p>
        </div>
        <div className="bg-surface p-7">
          <ChangePasswordForm
            newPasswordLabel={t("changePassword.newPassword")}
            newPasswordHint={t("changePassword.newPasswordHint")}
            repeatPasswordLabel={t("changePassword.repeatPassword")}
            saveLabel={t("changePassword.save")}
          />
        </div>
      </div>
    </main>
  );
}
