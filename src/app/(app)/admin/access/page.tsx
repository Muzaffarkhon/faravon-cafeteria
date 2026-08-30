import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AccessRowActions } from "./_row-actions";

const fmt = (d: Date) => d.toLocaleDateString("ru-RU");

export default async function AccessPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "access.manage")) redirect("/");

  const employees = await db.employee.findMany({
    include: {
      user: { select: { lastLoginAt: true, mustChangePassword: true, otpExpiresAt: true } },
    },
    orderBy: { fullName: "asc" },
  });
  const activeCodes = await db.identificationCode.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
  });
  const codeByEmp = new Map(activeCodes.map((c) => [c.employeeId, c]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Доступ сотрудников (Telegram / OTP)</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Сотрудник идентифицируется в Telegram-боте по номеру телефона или по коду, выданному здесь
          (§5.1). Бот выдаёт одноразовый пароль на 24 часа; при первом входе требуется смена пароля.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Сотрудник</th>
              <th className="px-4 py-2 font-medium">Подразделение</th>
              <th className="px-4 py-2 font-medium">Телефон</th>
              <th className="px-4 py-2 font-medium">Telegram</th>
              <th className="px-4 py-2 font-medium">Вход</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {employees.map((e) => {
              const code = codeByEmp.get(e.id);
              const loggedIn = !!e.user?.lastLoginAt;
              return (
                <tr key={e.id}>
                  <td className="px-4 py-2 font-medium">{e.fullName}</td>
                  <td className="px-4 py-2 text-neutral-500">{e.department}</td>
                  <td className="px-4 py-2 text-neutral-500">{e.phone ?? "—"}</td>
                  <td className="px-4 py-2">
                    {e.telegramId ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        привязан
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        нет
                      </span>
                    )}
                    {code && (
                      <span className="ml-2 font-mono text-xs text-amber-700">
                        код {code.code} до {fmt(code.expiresAt)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500">
                    {loggedIn
                      ? e.user?.mustChangePassword
                        ? "ожидает смены пароля"
                        : `входил ${fmt(e.user!.lastLoginAt!)}`
                      : "не входил"}
                  </td>
                  <td className="px-4 py-2">
                    <AccessRowActions employeeId={e.id} linked={!!e.telegramId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
