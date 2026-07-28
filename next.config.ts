import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages exposes CF_PAGES during its Git-integrated build.
  // Keep the existing Sites/Vinext build unchanged, but emit a static `out`
  // directory when Cloudflare Pages runs `npx next build`.
  ...(process.env.CF_PAGES
    ? {
        output: "export" as const,
        typescript: { tsconfigPath: "tsconfig.pages.json" },
      }
    : {}),
};

export default nextConfig;
