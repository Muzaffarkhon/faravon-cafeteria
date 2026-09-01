import { db } from "@/src/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const items = await db.partnerBanner.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const data = await req.json();
  const item = await db.partnerBanner.create({ data });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: Request) {
  const { id, ...rest } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const item = await db.partnerBanner.update({ where: { id }, data: rest });
  return NextResponse.json(item);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await db.partnerBanner.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
