import { BrandMark } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { buttonClass, cx } from "@/components/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { getLocale, getTranslator } from "@/lib/i18n";
import { LoginForm } from "./_login-form";

// Логин бота (@BotFather) — та же ссылка, что открывается по кнопке
// «Поделиться контактом» внутри самого Telegram. `?start=support` заводит
// диалог напрямую в чат поддержки (см. src/app/api/telegram/route.ts) —
// не нужно самому искать бота и нажимать кнопку внутри переписки.
const BOT_URL = "https://t.me/cafeteria_farovon_bot";

export default async function LoginPage() {
  const locale = await getLocale();
  const t = await getTranslator();

  return (
    <main
      className="petal-field relative grid min-h-dvh place-items-center overflow-hidden p-4"
      style={{ paddingTop: "max(1rem, var(--tg-top))" }}
    >
      <PetalDrift />

      <div className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-[28px] shadow-[0_20px_60px_oklch(0.22_0.03_30_/_0.15)]">
        {/* Красная шапка */}
        <div className="bg-primary px-7 pb-8 pt-10 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface shadow-md">
            <BrandMark size={40} priority />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-on-brand">
            {t("login.title")}
          </h1>
          <p className="mt-1.5 text-sm text-on-brand/80">{t("login.tagline")}</p>
        </div>

        {/* Белое тело */}
        <div className="bg-surface p-7">
          <div className="mb-4 flex justify-center gap-2">
            <ThemeToggle compact />
            <LanguageSwitcher locale={locale} />
          </div>

          <LoginForm
            loginLabel={t("login.loginLabel")}
            passwordLabel={t("login.passwordLabel")}
            submitLabel={t("login.submit")}
          />

          <div className="my-5 flex items-center gap-2.5">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs text-ink-subtle">{t("login.accessHint")}</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <p className="text-center text-xs leading-relaxed text-ink-subtle">
            {t("login.helpText")}
            {process.env.NODE_ENV !== "production" && (
              <>
                <br />
                Демо: c_and_b / contractor / ivanov · пароль Password1
              </>
            )}
          </p>

          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(buttonClass({ variant: "primary", size: "sm" }), "mt-3 w-full")}
          >
            {t("login.openBot")}
          </a>

          <a
            href={`${BOT_URL}?start=support`}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(buttonClass({ variant: "secondary", size: "sm" }), "mt-2 w-full")}
          >
            {t("login.cantLogin")}
          </a>
        </div>
      </div>
    </main>
  );
}
