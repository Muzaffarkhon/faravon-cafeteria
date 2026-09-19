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
        ],
      },
    ];
  },
};

export default nextConfig;

