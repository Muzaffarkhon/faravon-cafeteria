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
  return NextResponse.json(upd);
}
