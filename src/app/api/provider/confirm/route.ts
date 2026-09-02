import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/api-guard";
import { redeemCouponByNumber } from "@/lib/coupon";

export const runtime = "nodejs";

/** Гашение купона подрядчиком по номеру. Право: coupons.confirm (роль CONTRACTOR). */
export async function POST(req: Request) {
  const g = await apiGuard("coupons.confirm");
  if (g.response) return g.response;

  try {
    const body = (await req.json().catch(() => null)) as { number?: string } | null;
    const number = body?.number?.trim();
    if (!number) return NextResponse.json({ error: "Укажите номер купона." }, { status: 400 });

    const coupon = await redeemCouponByNumber(number, g.session.user.id, g.session.user.partnerId);
    return NextResponse.json({ ok: true, number: coupon.number });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    const known =
      msg.includes("не найден") ||
      msg.includes("активир") ||
      msg.includes("просрочен") ||
      msg.includes("истёк") ||
      msg.includes("статус") ||
      msg.includes("партнёр");
    if (!known) console.error("[provider/confirm]", e);
    return NextResponse.json({ error: known ? msg : "Не удалось активировать купон." }, {
      status: known ? 409 : 500,
    });
  }
}
