import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/api-guard";

/** CRUD баннеров партнёров. Право: partners.manage (C&B). */
export async function GET() {
  const g = await apiGuard("partners.manage");
  if (g.response) return g.response;
  const items = await db.partnerBanner.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const g = await apiGuard("partners.manage");
  if (g.response) return g.response;
  const data = await req.json();
  const item = await db.partnerBanner.create({ data });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: Request) {
  const g = await apiGuard("partners.manage");
  if (g.response) return g.response;
  const { id, ...rest } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const item = await db.partnerBanner.update({ where: { id }, data: rest });
  return NextResponse.json(item);
}

export async function DELETE(req: Request) {
  const g = await apiGuard("partners.manage");
  if (g.response) return g.response;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await db.partnerBanner.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
