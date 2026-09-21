import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card } from "@/components/ui";
import { isSandbox, sandboxUrl } from "@/lib/app-env";
import { ResetSandboxButton } from "./_reset-button";

export const dynamic = "force-dynamic";

export default async function SandboxPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "periods.manage")) redirect("/admin");

  const sandbox = isSandbox();
  const url = sandboxUrl();

  // В песочнице показываем, сколько данных накопил текущий прогон.
  const counts = sandbox
    ? await Promise.all([
        db.employee.count(),
        db.application.count(),
        db.coupon.count(),
        db.benefitCard.count(),
      ])
    : null;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Тестовая среда</h1>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          Песочница — отдельный деплой того же приложения со своей схемой базы. Сотрудники,
          льготы, заявки и купоны там свои: что угодно можно ломать, боевых данных это не
          касается.
        </p>
      </div>

      {sandbox ? (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              Вы сейчас в тестовой среде
            </div>
            {counts && (
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Сотрудников", counts[0]],
                  ["Заявок", counts[1]],
                  ["Купонов", counts[2]],
                  ["Льгот", counts[3]],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl bg-surface-sunken px-3 py-2.5">
                    <dt className="text-xs text-ink-muted">{label}</dt>
                    <dd className="font-display text-xl font-bold text-ink" data-numeric>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">Прогнать сценарий заново</h2>
            <p className="mt-1 mb-4 text-sm leading-6 text-ink-muted">
              Удаляет заявки, позиции, купоны и кешбек, оставляя справочники и сотрудников.
              Кнопка работает только здесь: на боевом деплое это действие отключено на уровне
              среды.
            </p>
            <ResetSandboxButton />
          </Card>
        </>
      ) : (
        <Card className="p-5">
          <h2 className="text-base font-bold text-ink">Вы на боевом сайте</h2>
          {url ? (
            <>
              <p className="mt-1 mb-4 text-sm leading-6 text-ink-muted">
                Тестовая среда живёт по отдельному адресу и со своим входом. В ней наверху
                висит жёлтая полоса — перепутать с боевым сайтом не получится.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong underline underline-offset-2"
              >
                Открыть тестовую среду
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </>
          ) : (
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Песочница ещё не развёрнута. Порядок настройки — в{" "}
              <code className="rounded bg-surface-muted px-1 font-mono text-[13px]">docs/SANDBOX.md</code>{" "}
              в репозитории. Когда развернёте, пропишите её адрес в переменной{" "}
              <code className="rounded bg-surface-muted px-1 font-mono text-[13px]">SANDBOX_URL</code>{" "}
              — здесь появится ссылка.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
