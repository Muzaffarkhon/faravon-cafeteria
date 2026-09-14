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

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M21.05 3.35 2.9 10.4c-1.22.48-1.21 1.15-.22 1.45l4.65 1.45 1.8 5.47c.22.6.4.85.87.85.34 0 .53-.15.77-.37l1.85-1.8 3.87 2.86c.71.4 1.22.19 1.4-.66l2.55-12.03c.27-1.16-.37-1.7-1.24-1.27Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HelpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.6 9.3a2.4 2.4 0 1 1 3.6 2.08c-.7.42-1.2.8-1.2 1.62"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.3" r="0.15" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

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
            className={cx(buttonClass({ variant: "soft", size: "sm" }), "mt-3 w-full gap-1.5")}
          >
            <TelegramIcon className="h-3.5 w-3.5 shrink-0" />
            {t("login.openBot")}
          </a>

          <a
            href={`${BOT_URL}?start=support`}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(buttonClass({ variant: "ghost", size: "sm" }), "mt-1 w-full gap-1.5")}
          >
            <HelpIcon className="h-3.5 w-3.5 shrink-0" />
            {t("login.cantLogin")}
          </a>
        </div>
      </div>
    </main>
  );
}
