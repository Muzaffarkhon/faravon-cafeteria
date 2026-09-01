import { db } from "@/src/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const items = await db.advertisingRequest.findMany({ orderBy: { submittedAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const id = form.get("id") as string;
  const status = (form.get("status") as string) || "PENDING";
  const notes = (form.get("notes") as string) || null;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const upd = await db.advertisingRequest.update({ where: { id }, data: { status, notes, reviewedAt: new Date() } });
  return NextResponse.json(upd);
}
