import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/api-guard";
import { audit } from "@/lib/audit";
import { invalidateBannersCache } from "@/lib/catalog-cache";

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

  if (status !== "APPROVED" && status !== "REJECTED") {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (before.status === "APPROVED" && status !== "APPROVED") {
    return NextResponse.json(
      { error: "Заявка уже одобрена — изменить решение нельзя." },
      { status: 409 },
    );
  }
  if (before.status === status) {
    return NextResponse.json({ ...before, bannerId: null });
  }

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

  let bannerId: string | null = null;
  const spawnedBefore =
    status === "APPROVED"
      ? await db.auditLog.findFirst({
          where: {
            action: "PARTNER_BANNER_CREATED",
            entityType: "PartnerBanner",
            newValue: { path: ["fromAdRequest"], equals: id },
          },
          select: { id: true },
        })
      : null;
  if (status === "APPROVED" && !spawnedBefore) {
    const banner = await db.partnerBanner.create({
      data: {
        partnerId: before.partnerId,
        title: before.productName,
        subtitle: before.productDescription.slice(0, 300),
        androidUrl: before.androidUrl,
        iosUrl: before.iosUrl,
        href: before.androidUrl ?? before.iosUrl ?? null,
        isActive: false,
        sortOrder: 0,
      },
    });
    bannerId = banner.id;
    invalidateBannersCache();
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
