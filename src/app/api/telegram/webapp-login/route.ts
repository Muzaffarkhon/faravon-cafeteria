import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { verifyTelegramWebAppInitData } from "@/lib/telegram-webapp-auth";

/** Авто-вход в Mini App: initData подписан Telegram, пароль/OTP не нужен — только для уже привязанных сотрудников. */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ ok: false }, { status: 503 });

  const body = await req.json().catch(() => null) as { initData?: string } | null;
  const tgUser = verifyTelegramWebAppInitData(String(body?.initData ?? ""), token);
  if (!tgUser) return NextResponse.json({ ok: false }, { status: 401 });

  const user = await db.user.findUnique({ where: { telegramId: String(tgUser.id) } });
  if (!user || !user.isActive) return NextResponse.json({ ok: false }, { status: 404 });

  const mustChangePassword = user.roles.includes("CONTRACTOR") ? false : user.mustChangePassword;
  await createSession({
    sub: user.id,
    login: user.login,
    roles: user.roles,
    employeeId: user.employeeId,
    mustChangePassword,
    epoch: user.sessionEpoch,
  });
  await audit({ actorId: user.id, action: "LOGIN_OK", entityType: "User", entityId: user.id });

  return NextResponse.json({ ok: true });
}
