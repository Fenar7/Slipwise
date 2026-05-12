import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import { collectAllowedDevOrigins } from "./src/lib/allowed-dev-origins";

const nextConfig: NextConfig = {
  // Accessing next dev from a phone/tablet uses the laptop's LAN IP rather than
  // localhost. Next 16 blocks dev-only assets/HMR from non-allowlisted hosts by
  // default, which can prevent hydration on mobile unless those LAN origins are
  // permitted here.
  allowedDevOrigins: collectAllowedDevOrigins({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    extraOrigins: process.env.ALLOWED_DEV_ORIGINS,
    networkInterfaces: networkInterfaces(),
  }),
  output: "standalone",
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "ioredis", "pg", "@prisma/adapter-pg"],

  // Performance: Aggressive static asset caching
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-DNS-Prefetch-Control", value: "on" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
    {
      source: "/fonts/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/images/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
      ],
    },
  ],

  async redirects() {
    return [
      { source: "/app", destination: "/app/home", permanent: false },
    ];
  },

  // Performance: Enable experimental optimizations
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "date-fns",
    ],
  },

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
