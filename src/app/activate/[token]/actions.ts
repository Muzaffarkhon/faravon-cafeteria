"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { clientMeta } from "@/lib/client-meta";
import { consumeCashierLink } from "@/lib/cashier-link";

/**
 * Явное нажатие «Привязать этот телефон»: списывает одноразовую ссылку и создаёт обычную сессию
 * подрядчика (та же, что даёт вход по PIN, — долгая, отзывается сменой PIN). Открытие самой
 * страницы ничего не списывает.
 */
export async function activateCashierPhone(token: string): Promise<void> {
  const meta = await clientMeta();
  const r = await consumeCashierLink(token, meta);
  // Ссылка недействительна (или её только что использовали) — страница сама покажет причину.
  if (!r.ok) redirect(`/activate/${encodeURIComponent(token)}`);

  await db.user.update({ where: { id: r.user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
  await createSession({
    sub: r.user.id,
    login: r.user.login,
    roles: r.user.roles,
    employeeId: r.user.employeeId,
    mustChangePassword: false, // как у подрядчика по PIN: постоянный код, смены не требуется
    epoch: r.user.sessionEpoch,
  });
  await audit({ actorId: r.user.id, action: "CASHIER_DEVICE_LINKED", entityType: "User", entityId: r.user.id, newValue: { via: "link" } });
  redirect("/provider");
}
