import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma client is server-only; keep it external to the server bundle.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
