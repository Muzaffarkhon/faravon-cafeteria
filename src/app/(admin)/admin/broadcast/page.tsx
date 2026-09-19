import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getLocale, getTranslator } from "@/lib/i18n";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/shared";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from "@/components/ui";
import { PREVIEW_LIMIT, parseFilters, resolveAudience } from "@/lib/broadcast-audience";
import { SEGMENTS } from "@/lib/broadcast-segments";
import { BroadcastForm } from "./_form";

// Рассылка «гостям» идёт напрямую (до ~600 сообщений, ~25 с) — запас по времени функции.
export const maxDuration = 60;

export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "cards.manage")) redirect("/");
  const locale = await getLocale();
  const t = await getTranslator();

  const filters = parseFilters(await searchParams);
  const guests = filters.segment === "NOT_REGISTERED";

  const [departments, positions, audience] = await Promise.all([
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    db.employee.findMany({
      where: { isActive: true, archivedAt: null },
      select: { position: true },
      distinct: ["position"],
      orderBy: { position: "asc" },
    }),
    resolveAudience(filters),
  ]);
  const recipients = audience.users.length + audience.guests.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t("broadcast.title")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("broadcast.hint")}</p>
      </div>

      <Card className="p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("broadcast.to")} htmlFor="segment">
            <Select id="segment" name="segment" defaultValue={filters.segment}>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {t(`broadcast.segment.${s}` as const)}
                </option>
              ))}
            </Select>
          </Field>
          {!guests && (
            <>
              <Field label={t("broadcast.department")} htmlFor="department">
                <Select id="department" name="department" defaultValue={filters.department}>
                  <option value="">{t("broadcast.allDepartments")}</option>
                  {departments.map((d) => (
                    <option key={d.department} value={d.department}>
                      {d.department}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("broadcast.position")} htmlFor="position">
                <Select id="position" name="position" defaultValue={filters.position}>
                  <option value="">{t("broadcast.allPositions")}</option>
                  {positions.map((p) => (
                    <option key={p.position} value={p.position}>
                      {p.position}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("broadcast.search")} htmlFor="q">
                <Input
                  id="q"
                  name="q"
                  defaultValue={filters.q}
                  placeholder={t("broadcast.searchPlaceholder")}
                  autoComplete="off"
                />
              </Field>
            </>
          )}
          <div className="flex items-end">
            <Button type="submit">{t("broadcast.showRecipients")}</Button>
          </div>
        </form>
        {guests && <p className="mt-3 text-sm text-ink-muted">{t("broadcast.guestsNote")}</p>}
      </Card>

      {audience.error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
          {audience.error}
        </p>
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="brand">
              {t("broadcast.found")}: {audience.total}
            </Badge>
            <Badge tone="success">
              {t("broadcast.willReceive")}: {recipients}
            </Badge>
            {audience.withoutTelegram > 0 && (
              <Badge tone="warning">
                {t("broadcast.noTelegram")}: {audience.withoutTelegram}
              </Badge>
            )}
            {recipients > 0 && (
              <Badge tone="neutral">
                {t("broadcast.byLanguage")}: {LOCALES.map((l) => `${LOCALE_LABELS[l]} ${audience.byLocale[l]}`).join(" · ")}
              </Badge>
            )}
          </div>
          {audience.rows.length === 0 ? (
            <EmptyState>{t("broadcast.nobody")}</EmptyState>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <th>{t("broadcast.colWho")}</th>
                    <th>{t("broadcast.colUnit")}</th>
                    <th>{t("broadcast.colTelegram")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audience.rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.name}</td>
                      <td>{r.sub}</td>
                      <td>{r.telegram ? t("broadcast.yes") : t("broadcast.no")}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {audience.total > PREVIEW_LIMIT && (
                <p className="mt-2 text-xs text-ink-subtle">
                  {t("broadcast.shownFirst")} {PREVIEW_LIMIT} {t("broadcast.of")} {audience.total}.
                </p>
              )}
            </>
          )}
        </Card>
      )}

      <BroadcastForm filters={filters} recipients={recipients} byLocale={audience.byLocale} locale={locale} />
    </div>
  );
}
