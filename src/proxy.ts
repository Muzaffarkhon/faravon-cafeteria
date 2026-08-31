import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "faravon_session";
const PUBLIC_PATHS = ["/login"];

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    await jwtVerify(token, secret());
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    // Гейт сессии — только для страниц. Пропускаем:
    //  • /api/* — роуты авторизуются сами (webhook-секрет, CRON_SECRET, health публичен);
    //  • внутренние маршруты Next;
    //  • статические файлы с расширением (иконки, логотип из /public и т.п.).
    "/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|json|woff2?)$).*)",
  ],
};
