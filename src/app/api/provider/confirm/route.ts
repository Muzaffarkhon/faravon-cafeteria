import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";

export async function POST(req: Request) {
  try {
    const s = await requireSession();
    assertCan(s.roles, "coupons.confirm");
    const { number } = await req.json();
    if (!number) return NextResponse.json({ error: "missing number" }, { status: 400 });

    const coupon = await db.coupon.findUnique({ where: { number }, include: { item: true } });
    if (!coupon) return NextResponse.json({ error: "coupon not found" }, { status: 404 });
    if (coupon.status !== "ISSUED") return NextResponse.json({ error: "coupon not in ISSUED state" }, { status: 409 });

    await db.$transaction([
      db.coupon.update({ where: { id: coupon.id }, data: { status: "USED", updatedAt: new Date() } }),
      db.applicationItem.update({ where: { id: coupon.itemId }, data: { status: "COUPON_ISSUED" } }),
    ]);

    await audit({ actorId: s.user.id, action: "COUPON_CONFIRMED_BY_PROVIDER", entityType: "Coupon", entityId: coupon.id, newValue: { number } });
    await notifyEmployee({ employeeId: coupon.employeeId, event: "COUPON_CONFIRMED_BY_PROVIDER", payload: { number } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
