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
  // Self-contained server bundle for container/Docker deployment only (not needed on Vercel)
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
};

export default nextConfig;

