import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root locally — a stray lockfile in the home directory otherwise
  // confuses Turbopack's root inference and breaks route resolution.
  ...(process.env.VERCEL
    ? {}
    : {
        turbopack: {
          root: projectRoot,
        },
      }),
  // Размер серверных функций (Vercel считает его в «Functions Storage» на каждый деплой).
  // Рантайм Prisma тянет за собой wasm-движки для MySQL/SQLite/SQL Server/CockroachDB и
  // edge-сборку (~44 МБ на функцию); мы работаем с PostgreSQL через нативный движок, они не нужны.
  outputFileTracingExcludes: {
    "/*": ["node_modules/@prisma/client/runtime/*wasm*"],
  },
  // Self-contained server bundle for container/Docker deployment only (not needed on Vercel)
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Изображения карточек рисуются обычным <img>, а не next/image: они мелкие
  // (миниатюры), URL может быть произвольным (поле «указать ссылку»), а оптимизатор
  // Vercel на Hobby лимитирован. Поэтому remotePatterns не нужен.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // Ограничивает домены, с которых браузер согласится выполнить <script src="...">:
          // свой origin + официальный SDK Telegram Mini App. Остальные директивы (style-src,
          // img-src и т.д.) не заданы — значит не ограничены, чтобы не ловить регрессии
          // на произвольных ссылках на баннеры/иконки партнёров.
          { key: "Content-Security-Policy", value: "script-src 'self' 'unsafe-inline' https://telegram.org" },
        ],
      },
    ];
  },
};

export default nextConfig;

