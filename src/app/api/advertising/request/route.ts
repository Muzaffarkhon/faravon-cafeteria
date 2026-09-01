import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyName, contactName, contactPhone, productName, productDescription, budget } = body;
    if (!companyName || !contactName || !contactPhone || !productName) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    const rec = await db.advertisingRequest.create({
      data: { companyName, contactName, contactPhone, productName, productDescription, budget },
    });

    await audit({ actorId: null, action: "AD_REQUEST_CREATED", entityType: "AdvertisingRequest", entityId: rec.id, newValue: { companyName, productName } });

    return NextResponse.json({ ok: true, id: rec.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
