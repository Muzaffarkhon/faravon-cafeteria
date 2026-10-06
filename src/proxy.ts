import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "faravon_session";
const PUBLIC_PATHS = [
  "/login",
  "/activate", // привязка телефона кассы по одноразовой ссылке (см. lib/cashier-link.ts)
  "/manifest.webmanifest",
  "/sw.js",
  "/pwa.js",
];

function secret() {
  const s = process.env.AUTH_SECRET;
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
    //  • PWA и служебные файлы (/sw.js, /pwa.js, /manifest.webmanifest);
    "/((?!api|_next/static|_next/image|sw\\.js|pwa\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|json|webmanifest|js|woff2?)$).*)",
  ],
};
