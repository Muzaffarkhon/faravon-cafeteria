import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "faravon_session";
const PUBLIC_PATHS = [
  "/login",
  "/manifest.webmanifest",
  "/sw.js",
  "/pwa.js",
];

function secret() {
  const s = process.env.AUTH_SECRET;
  // Fail-closed: без секрета не проверяем подпись пустым ключом (иначе можно
  // подделать сессионный JWT), а роняем запрос — пусть чинят конфиг.
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/sw.js" ||
    pathname === "/pwa.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  // После входа возвращаем туда же, куда шли, вместе с параметрами (напр. /provider?number=… из QR купона).
  const loginRedirect = () => {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  };

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return loginRedirect();

  try {
    await jwtVerify(token, secret());
    return NextResponse.next();
  } catch {
    return loginRedirect();
  }
}

export const config = {
  matcher: [
    // Гейт сессии — только для страниц. Пропускаем:
    //  • /api/* — роуты авторизуются сами (webhook-секрет, CRON_SECRET, health публичен);
    //  • внутренние маршруты Next;
    //  • PWA и служебные файлы (/sw.js, /pwa.js, /manifest.webmanifest);
    //  • статические файлы с расширением (иконки, логотип из /public и т.п.).
    "/((?!api|_next/static|_next/image|sw\\.js|pwa\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|json|webmanifest|js|woff2?)$).*)",
  ],
};
