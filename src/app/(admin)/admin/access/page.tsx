import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, can, type Permission } from "@/lib/rbac";
import { SectionTitle, buttonClass } from "@/components/ui";
import { MatrixForm } from "./_matrix-form";
import { getLocale, getTranslator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "access.manage")) redirect("/");
  const t = await getTranslator();
  const locale = await getLocale();

  const permRows = await db.rolePermission.findMany({ select: { role: true, permission: true, allowed: true } });

  // Матрица из БД + дефолты из кода для прав, по которым строк нет.
  const seen = new Set(permRows.map((r) => r.permission));
  const allowed = {} as Record<Permission, Role[]>;
  for (const p of ALL_PERMISSIONS) {
    allowed[p] = seen.has(p)
      ? permRows.filter((r) => r.permission === p && r.allowed).map((r) => r.role)
      : [...DEFAULT_PERMISSIONS[p]];
  }

  return (
    <div data-wide className="space-y-5">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle className="text-lg">{t("access.matrixTitle")}</SectionTitle>
          <Link href="/admin/access/employees" className={buttonClass({ variant: "secondary", size: "sm" })}>
            {t("access.identificationTitle")} →
          </Link>
        </div>
        <p className="text-sm text-ink-muted">
          {t("access.matrixHint")}
        </p>
        <MatrixForm allowed={allowed} locale={locale} />
      </section>
    </div>
  );
}
