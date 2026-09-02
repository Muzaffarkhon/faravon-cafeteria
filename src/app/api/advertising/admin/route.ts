import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/api-guard";
import { audit } from "@/lib/audit";

/** Реестр заявок на рекламу. Право: cards.manage (C&B). */
export async function GET() {
  const g = await apiGuard("cards.manage");
  if (g.response) return g.response;
  const items = await db.advertisingRequest.findMany({ orderBy: { submittedAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const g = await apiGuard("cards.manage");
  if (g.response) return g.response;

  const form = await req.formData();
  const id = form.get("id") as string;
  const status = (form.get("status") as string) || "PENDING";
  const notes = (form.get("notes") as string) || null;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const before = await db.advertisingRequest.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  const upd = await db.advertisingRequest.update({
    where: { id },
    data: { status, notes, reviewedAt: new Date() },
  });
  await audit({
    actorId: g.session.user.id,
    action: "AD_REQUEST_REVIEWED",
    entityType: "AdvertisingRequest",
    entityId: id,
    newValue: { status },
  });

  // При первом одобрении заявки автоматически заводим черновик баннера партнёра
  // с уже подставленными данными — C&B останется дооформить (картинка, ссылка) и включить.
  let bannerId: string | null = null;
  if (status === "APPROVED" && before.status !== "APPROVED") {
    const banner = await db.partnerBanner.create({
      data: {
        partnerId: before.partnerId,
        title: before.productName,
        subtitle: before.productDescription.slice(0, 300),
        isActive: false,
        sortOrder: 0,
      },
    });
    bannerId = banner.id;
    await audit({
      actorId: g.session.user.id,
      action: "PARTNER_BANNER_CREATED",
      entityType: "PartnerBanner",
      entityId: banner.id,
      newValue: { fromAdRequest: id, partnerId: before.partnerId },
    });
  }

  return NextResponse.json({ ...upd, bannerId });
}
