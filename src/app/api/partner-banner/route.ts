import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/api-guard";
import { isSafeLinkHref, isSafeImageSrc } from "@/lib/safe-url";

/** CRUD баннеров партнёров. Право: partners.manage (C&B). */
export async function GET() {
  const g = await apiGuard("partners.manage");
  if (g.response) return g.response;
  const items = await db.partnerBanner.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}

type BannerInput = {
  partnerId: string | null;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string | null;
  isActive: boolean;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

/**
 * Явный allow-list полей из тела запроса + валидация URL. Раньше тело
 * (`await req.json()`) уходило в Prisma `data:` как есть — mass assignment
 * (можно было выставить любую колонку) и `href = javascript:…` → stored XSS
 * на главной у каждого сотрудника.
 */
function parseBanner(body: Record<string, unknown>): BannerInput | { error: string } {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = s(body.title);
  if (!title) return { error: "Заголовок обязателен." };

  const href = s(body.href) || null;
  if (href && !isSafeLinkHref(href)) {
    return { error: "Ссылка должна быть http(s)-адресом или внутренним путём (/…)." };
  }
  const imageUrl = s(body.imageUrl) || null;
  if (imageUrl && !isSafeImageSrc(imageUrl)) {
    return { error: "Ссылка на изображение недопустима." };
  }
  const date = (v: unknown) => {
    const str = s(v);
    if (!str) return null;
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return {
    partnerId: s(body.partnerId) || null,
    title,
    subtitle: s(body.subtitle) || null,
    imageUrl,
    href,
    isActive: body.isActive === true || body.isActive === "true",
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0,
    startsAt: date(body.startsAt),
    endsAt: date(body.endsAt),
  };
}

export async function POST(req: Request) {
  const g = await apiGuard("partners.manage");
  if (g.response) return g.response;
  const parsed = parseBanner((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const item = await db.partnerBanner.create({ data: parsed });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: Request) {
  const g = await apiGuard("partners.manage");
  if (g.response) return g.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const parsed = parseBanner(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const item = await db.partnerBanner.update({ where: { id }, data: parsed });
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
