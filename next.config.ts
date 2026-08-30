import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in the home directory otherwise
  // confuses Turbopack's root inference and breaks route resolution.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
